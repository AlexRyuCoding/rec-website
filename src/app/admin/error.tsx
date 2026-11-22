"use client";

import { useEffect, useState } from "react";

// What a staff page shows when it breaks while rendering. These screens
// run unattended — a wall tablet showing the rooms board, the check-in
// kiosk — so the page does not wait for someone to notice a blank
// screen: it says what is happening and reloads itself.
//
// Words for whoever is standing there: on the kiosk that is a patient.
//
// It gives up reloading after a few tries in a row (a page that breaks
// every time must not flicker forever) and then asks for a person.

const RELOAD_AFTER_S = 8;
const MAX_AUTO_RELOADS = 3;
// Reloads further apart than this are separate incidents.
const STREAK_WINDOW_MS = 2 * 60 * 1000;
const STREAK_KEY = "admin-error-reloads";

// How many automatic reloads have just happened in a row.
function recentReloads(): number {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STREAK_KEY) ?? "null") as {
      count: number;
      at: number;
    } | null;
    if (!saved || Date.now() - saved.at > STREAK_WINDOW_MS) return 0;
    return saved.count;
  } catch {
    return 0;
  }
}

function reload(countIt: boolean) {
  try {
    if (countIt) {
      sessionStorage.setItem(
        STREAK_KEY,
        JSON.stringify({ count: recentReloads() + 1, at: Date.now() })
      );
    } else {
      sessionStorage.removeItem(STREAK_KEY);
    }
  } catch {
    // Storage unavailable: reload anyway.
  }
  window.location.reload();
}

export default function AdminError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    // No patient data in an error report: the digest identifies it.
    console.error("admin page error", error.digest ?? error.name);
    if (recentReloads() >= MAX_AUTO_RELOADS) return;
    setSecondsLeft(RELOAD_AFTER_S);
    const tick = setInterval(() => {
      setSecondsLeft((s) => {
        if (s === null) return s;
        if (s <= 1) {
          clearInterval(tick);
          reload(true);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [error]);

  return (
    <div
      role="alert"
      className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-canvas px-6 text-center text-cream"
    >
      <h1 className="font-serif text-4xl">One moment, please</h1>
      {secondsLeft !== null ? (
        <p className="max-w-md text-lg text-cream/80">
          This screen ran into a problem and is restarting
          {secondsLeft > 0 ? ` in ${secondsLeft} s` : ""}.
        </p>
      ) : (
        <p className="max-w-md text-lg text-cream/80">
          This screen keeps running into a problem. Please tell the front desk.
        </p>
      )}
      <button
        onClick={() => reload(false)}
        className="rounded-full border-2 border-cream/50 px-8 py-3 text-lg hover:bg-cream/10"
      >
        Restart now
      </button>
    </div>
  );
}
