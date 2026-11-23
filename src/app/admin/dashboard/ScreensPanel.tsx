"use client";
import { useCallback, useEffect, useState } from "react";
import { MonitorPlay, TabletSmartphone, Tv } from "lucide-react";
import { leaveDashboard } from "@/lib/staff-login-redirect";
import Button from "../ui/Button";
import Panel from "../ui/Panel";
import Segmented from "../ui/Segmented";
import { buttonClass, fieldClass } from "../ui/styles";
import Tag from "../ui/Tag";

type DeviceKind = "tv" | "kiosk";

interface Display {
  id: string;
  kind: DeviceKind;
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
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null
  );
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/displays");
      if (res.status === 401 || res.status === 423) {
        leaveDashboard(res.status);
        return;
      }
      if (!res.ok) return;
      const data = (await res.json()) as {
        displays: Display[];
      };
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
        body: JSON.stringify({ code, label: label.trim() || undefined, kind }),
      });
      if (res.status === 401 || res.status === 423) {
        leaveDashboard(res.status);
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
      if (res.status === 401 || res.status === 423) {
        leaveDashboard(res.status);
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

  const chosen = KINDS.find((k) => k.id === kind) ?? KINDS[0];

  return (
    <Panel as="section" className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <MonitorPlay aria-hidden className="size-5 text-ui-accent-text" />
          Screens
        </h2>
        {/* A plain link (full page load), not next/link: the waiting-room
            page has its own content-security policy for the music
            players, and an in-app navigation would keep this page's. */}
        <a href="/waiting-room" className={buttonClass({ size: "sm" })}>
          Open waiting-room screen
        </a>
      </div>
      <p className="mb-2 text-sm text-ui-text-2">
        The waiting-room screen tells patients which room to go to. On the TV,
        open <strong>ryuacupuncture.com/waiting-room</strong> and enter the code
        it shows here.
      </p>
      <p className="mb-5 text-sm text-ui-text-2">
        The check-in kiosk is the tablet patients sign in on. On the tablet,
        open <strong>ryuacupuncture.com/admin/patient-signin</strong>, tap{" "}
        <strong>Show pairing code</strong> and enter the code here. A paired
        tablet needs no staff sign-in, and cannot open the dashboard. Only enter
        a code shown on the clinic&apos;s own device.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <fieldset className="flex flex-col gap-1 text-sm text-ui-text-2">
          <legend className="mb-1">What is it?</legend>
          <Segmented
            label="What is it?"
            value={kind}
            onChange={(next) => {
              setKind(next);
              setMessage(null);
            }}
            options={KINDS.map((k) => ({
              value: k.id,
              label: (
                <>
                  {k.id === "tv" ? (
                    <Tv aria-hidden className="size-4" />
                  ) : (
                    <TabletSmartphone aria-hidden className="size-4" />
                  )}
                  {k.label}
                </>
              ),
            }))}
            className="text-[15px]"
          />
        </fieldset>
        <label className="flex flex-col gap-1 text-sm text-ui-text-2">
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
            // The example code is kept faint: at full strength, in this size,
            // it reads as a code already typed in.
            className={`${fieldClass} w-44 text-xl font-semibold tracking-[0.25em] placeholder:opacity-40`}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-ui-text-2">
          Name (optional)
          <input
            value={label}
            maxLength={40}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") pair();
            }}
            placeholder={chosen.defaultName}
            className={`${fieldClass} w-56 text-[15px]`}
          />
        </label>
        <Button
          variant="primary"
          onClick={pair}
          disabled={busy || code.length !== CODE_LENGTH}
        >
          {kind === "tv" ? "Pair screen" : "Pair kiosk"}
        </Button>
      </div>
      {message && (
        <p
          role="status"
          className={`mt-3 text-sm ${
            message.ok ? "text-ui-accent-text" : "text-ui-error"
          }`}
        >
          {message.text}
        </p>
      )}

      <div className="mt-6">
        {!loaded ? null : displays.length === 0 ? (
          <p className="text-sm text-ui-text-3">Nothing paired yet.</p>
        ) : (
          <ul className="divide-y divide-ui-line border-t border-ui-line">
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
                    <Tag>{d.kind === "kiosk" ? "Kiosk" : "TV"}</Tag>
                  </p>
                  <p className="text-sm text-ui-text-3">
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
                      className={buttonClass({ variant: "danger", size: "sm" })}
                    >
                      Confirm revoke
                    </button>
                    <button
                      onClick={() => setConfirmingId(null)}
                      className={buttonClass({ size: "sm" })}
                    >
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button
                    onClick={() => setConfirmingId(d.id)}
                    disabled={busy}
                    className={buttonClass({ size: "sm" })}
                  >
                    Revoke
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}
