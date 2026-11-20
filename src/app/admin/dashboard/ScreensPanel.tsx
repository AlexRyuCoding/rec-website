"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { MonitorPlay } from "lucide-react";

interface Display {
  id: string;
  label: string | null;
  approvedAt: string | null;
  lastSeenAt: string | null;
}

const CODE_LENGTH = 6;

function formatLastSeen(iso: string | null): string {
  if (!iso) return "never connected";
  const minutes = Math.floor((Date.now() - Date.parse(iso)) / 60000);
  if (minutes < 2) return "online now";
  if (minutes < 60) return `last seen ${minutes} min ago`;
  if (minutes < 24 * 60) return `last seen ${Math.floor(minutes / 60)} h ago`;
  return `last seen ${new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })}`;
}

// Pair and manage the waiting-room TV. The TV shows a 6-character code at
// /waiting-room; typing it here (signed in as staff) is what authorises
// that screen to show which patient goes to which room. Revoking cuts a
// screen off immediately.
export default function ScreensPanel() {
  const [displays, setDisplays] = useState<Display[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null
  );
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/displays");
      if (res.status === 401) {
        window.location.href = "/admin/login";
        return;
      }
      if (!res.ok) return;
      const data = (await res.json()) as { displays: Display[] };
      setDisplays(data.displays);
    } catch {
      // Keep the last list; the next action or reload retries.
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const pair = async () => {
    if (busy || code.length !== CODE_LENGTH) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/displays/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, label: label.trim() || undefined }),
      });
      if (res.ok) {
        setCode("");
        setLabel("");
        setMessage({
          ok: true,
          text: "Screen paired. It will start within a few seconds.",
        });
        await refresh();
        // The TV picks the approval up on its next poll (within ~5 s);
        // refresh once more so the row shows "online now" instead of
        // "never connected".
        setTimeout(refresh, 7000);
      } else if (res.status === 404) {
        setMessage({
          ok: false,
          text: "That code wasn't found or has expired. Use the code on the screen right now.",
        });
      } else {
        setMessage({ ok: false, text: "Couldn't pair the screen. Try again." });
      }
    } catch {
      setMessage({ ok: false, text: "Connection problem. Try again." });
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    setBusy(true);
    setConfirmingId(null);
    try {
      await fetch(`/api/admin/displays/${id}`, { method: "DELETE" });
      await refresh();
    } catch {
      setMessage({ ok: false, text: "Connection problem. Try again." });
    } finally {
      setBusy(false);
    }
  };

  const pill =
    "px-4 py-2 rounded-full border border-brand-foreground hover:bg-brand-muted transition-colors disabled:opacity-40";

  return (
    <section className="mt-10 border border-brand-foreground rounded-lg p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
        <h2 className="flex items-center gap-2 text-xl font-semibold">
          <MonitorPlay className="size-5" />
          Screens
        </h2>
        <Link href="/waiting-room" className={pill}>
          Open waiting-room screen
        </Link>
      </div>
      <p className="mb-5 text-sm opacity-70">
        The waiting-room screen tells patients which room to go to. On the TV,
        open <strong>ryuacupuncture.com/waiting-room</strong> and enter the code
        it shows here. Only enter a code shown on the clinic&apos;s own screen.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Code on the screen
          <input
            value={code}
            onChange={(e) =>
              setCode(
                e.target.value
                  .toUpperCase()
                  .replace(/[^A-Z0-9]/g, "")
                  .slice(0, CODE_LENGTH)
              )
            }
            onKeyDown={(e) => {
              if (e.key === "Enter") pair();
            }}
            placeholder="K7M4QX"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            className="w-44 rounded-lg border border-brand-foreground bg-transparent px-3 py-2 text-xl font-semibold tracking-[0.25em] placeholder:opacity-25"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Name (optional)
          <input
            value={label}
            maxLength={40}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") pair();
            }}
            placeholder="Waiting room screen"
            className="w-56 rounded-lg border border-brand-foreground bg-transparent px-3 py-2 placeholder:opacity-40"
          />
        </label>
        <button
          onClick={pair}
          disabled={busy || code.length !== CODE_LENGTH}
          className="px-5 py-2 rounded-full bg-brand-primary text-white hover:bg-brand-secondary transition-colors disabled:opacity-40"
        >
          Pair screen
        </button>
      </div>
      {message && (
        <p
          role="status"
          className={`mt-3 text-sm ${
            message.ok ? "text-brand-primary" : "text-brand-danger"
          }`}
        >
          {message.text}
        </p>
      )}

      <div className="mt-6">
        {!loaded ? null : displays.length === 0 ? (
          <p className="text-sm opacity-60">No screens paired yet.</p>
        ) : (
          <ul className="divide-y divide-brand-foreground/20">
            {displays.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div>
                  <p className="font-medium">
                    {d.label || "Waiting room screen"}
                  </p>
                  <p className="text-sm opacity-60">
                    {formatLastSeen(d.lastSeenAt)}
                    {d.approvedAt &&
                      ` · paired ${new Date(d.approvedAt).toLocaleDateString(
                        "en-US",
                        { month: "short", day: "numeric", year: "numeric" }
                      )}`}
                  </p>
                </div>
                {confirmingId === d.id ? (
                  <span className="flex items-center gap-2">
                    <button
                      onClick={() => revoke(d.id)}
                      disabled={busy}
                      className="px-3 py-1 rounded-full bg-brand-danger text-white disabled:opacity-40"
                    >
                      Confirm revoke
                    </button>
                    <button
                      onClick={() => setConfirmingId(null)}
                      className="px-3 py-1 rounded-full border border-brand-foreground hover:bg-brand-muted transition-colors"
                    >
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button
                    onClick={() => setConfirmingId(d.id)}
                    disabled={busy}
                    className="px-3 py-1 rounded-full border border-brand-foreground hover:bg-brand-muted transition-colors disabled:opacity-40"
                  >
                    Revoke
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
