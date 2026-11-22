"use client";
import { useCallback, useEffect, useState } from "react";
import { MonitorPlay, TabletSmartphone, Tv } from "lucide-react";
import { goToStaffLogin } from "@/lib/staff-login-redirect";

type DeviceKind = "tv" | "kiosk";

interface Display {
  id: string;
  // Absent in a reply from before kiosks could be paired: a screen.
  kind?: DeviceKind;
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

const KINDS: {
  id: DeviceKind;
  label: string;
  defaultName: string;
  paired: string;
}[] = [
  {
    id: "tv",
    label: "Waiting-room TV",
    defaultName: "Waiting room screen",
    paired: "Screen paired. It will start within a few seconds.",
  },
  {
    id: "kiosk",
    label: "Check-in kiosk",
    defaultName: "Check-in kiosk",
    paired: "Kiosk paired. Its sign-in screen appears within a few seconds.",
  },
];

// Pair and manage the clinic's own devices. Each shows a 6-character code
// (the TV at /waiting-room, the kiosk tablet on its set-up screen);
// typing it here, signed in as staff, is what authorises that device —
// the TV to show which patient goes to which room, the kiosk to check
// patients in. Staff say which of the two it is, and the code is only
// looked for among devices of that kind: a kiosk can do more than a
// screen, so it is never paired by someone who thought it was a TV.
// Revoking cuts a device off immediately.
export default function ScreensPanel() {
  const [displays, setDisplays] = useState<Display[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<DeviceKind>("tv");
  // false = kiosks can't be listed (migration 0018 not applied yet).
  const [kiosksAvailable, setKiosksAvailable] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null
  );
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/displays");
      if (res.status === 401) {
        goToStaffLogin();
        return;
      }
      if (!res.ok) return;
      const data = (await res.json()) as {
        displays: Display[];
        kiosksAvailable?: boolean;
      };
      setDisplays(data.displays);
      setKiosksAvailable(data.kiosksAvailable !== false);
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
        body: JSON.stringify({ code, label: label.trim() || undefined, kind }),
      });
      if (res.status === 401) {
        goToStaffLogin();
        return;
      }
      if (res.ok) {
        setCode("");
        setLabel("");
        setMessage({ ok: true, text: chosen.paired });
        await refresh();
        // The TV picks the approval up on its next poll (within ~5 s);
        // refresh once more so the row shows "online now" instead of
        // "never connected".
        setTimeout(refresh, 7000);
      } else if (res.status === 404) {
        setMessage({
          ok: false,
          text: `That code wasn't found for a ${chosen.label} or has expired. Use the code on the device right now, and check which kind is chosen.`,
        });
      } else {
        setMessage({ ok: false, text: "Couldn't pair it. Try again." });
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
      const res = await fetch(`/api/admin/displays/${id}`, {
        method: "DELETE",
      });
      if (res.status === 401) {
        goToStaffLogin();
        return;
      }
      if (!res.ok) {
        setMessage({ ok: false, text: "Couldn't revoke it. Try again." });
      }
      await refresh();
    } catch {
      setMessage({ ok: false, text: "Connection problem. Try again." });
    } finally {
      setBusy(false);
    }
  };

  const pill =
    "px-4 py-2 rounded-full border border-brand-foreground hover:bg-brand-muted transition-colors disabled:opacity-40";
  const chosen = KINDS.find((k) => k.id === kind) ?? KINDS[0];

  return (
    <section className="mt-10 border border-brand-foreground rounded-lg p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
        <h2 className="flex items-center gap-2 text-xl font-semibold">
          <MonitorPlay className="size-5" />
          Screens
        </h2>
        {/* A plain link (full page load), not next/link: the waiting-room
            page has its own content-security policy for the music
            players, and an in-app navigation would keep this page's. */}
        <a href="/waiting-room" className={pill}>
          Open waiting-room screen
        </a>
      </div>
      <p className="mb-2 text-sm opacity-70">
        The waiting-room screen tells patients which room to go to. On the TV,
        open <strong>ryuacupuncture.com/waiting-room</strong> and enter the code
        it shows here.
      </p>
      <p className="mb-5 text-sm opacity-70">
        The check-in kiosk is the tablet patients sign in on. On the tablet,
        open <strong>ryuacupuncture.com/admin/patient-signin</strong>, tap{" "}
        <strong>Show pairing code</strong> and enter the code here. A paired
        tablet needs no staff sign-in, and cannot open the dashboard. Only enter
        a code shown on the clinic&apos;s own device.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <fieldset className="flex flex-col gap-1 text-sm">
          <legend className="mb-1">What is it?</legend>
          <div className="flex gap-2">
            {KINDS.filter((k) => k.id === "tv" || kiosksAvailable).map((k) => (
              <button
                key={k.id}
                type="button"
                aria-pressed={kind === k.id}
                onClick={() => {
                  setKind(k.id);
                  setMessage(null);
                }}
                className={`flex items-center gap-2 rounded-full border px-4 py-2 transition-colors ${
                  kind === k.id
                    ? "border-brand-primary bg-brand-primary text-white"
                    : "border-brand-foreground hover:bg-brand-muted"
                }`}
              >
                {k.id === "tv" ? (
                  <Tv className="size-4" />
                ) : (
                  <TabletSmartphone className="size-4" />
                )}
                {k.label}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="flex flex-col gap-1 text-sm">
          Code on the device
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
            placeholder={chosen.defaultName}
            className="w-56 rounded-lg border border-brand-foreground bg-transparent px-3 py-2 placeholder:opacity-40"
          />
        </label>
        <button
          onClick={pair}
          disabled={busy || code.length !== CODE_LENGTH}
          className="px-5 py-2 rounded-full bg-brand-primary text-white hover:bg-brand-secondary transition-colors disabled:opacity-40"
        >
          {kind === "tv" ? "Pair screen" : "Pair kiosk"}
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
          <p className="text-sm opacity-60">Nothing paired yet.</p>
        ) : (
          <ul className="divide-y divide-brand-foreground/20">
            {displays.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div>
                  <p className="flex items-center gap-2 font-medium">
                    {d.kind === "kiosk" ? (
                      <TabletSmartphone aria-hidden className="size-4" />
                    ) : (
                      <Tv aria-hidden className="size-4" />
                    )}
                    {d.label ||
                      (d.kind === "kiosk"
                        ? "Check-in kiosk"
                        : "Waiting room screen")}
                    <span className="rounded-full border border-brand-foreground/40 px-2 text-xs font-normal opacity-70">
                      {d.kind === "kiosk" ? "Kiosk" : "TV"}
                    </span>
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
