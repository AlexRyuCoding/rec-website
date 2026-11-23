"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { SessionProvider, signIn, useSession } from "next-auth/react";
import {
  dashboardLocked,
  lockPhase,
  shouldReportActivity,
} from "@/lib/dashboard-lock";
import type { LockPhase } from "@/lib/dashboard-lock";
import {
  DASHBOARD_LOCKED_EVENT,
  goToStaffLogin,
} from "@/lib/staff-login-redirect";
import Backdrop from "../ui/Backdrop";
import Banner from "../ui/Banner";
import Button from "../ui/Button";
import Panel from "../ui/Panel";
import { useStaffTheme } from "../ui/use-staff-theme";

// The dashboard locks itself after 30 minutes without activity. The rules
// and the reasons are in src/lib/dashboard-lock.ts; the server enforces
// them (dashboardRoute) whatever this page does. This is the page's half:
//
//  - it notices real activity (a press, a key, a touch, the wheel) and
//    tells the server, at most once a minute, so the lock stays open
//    while somebody is working;
//  - a minute before, it says so; then it takes the dashboard OUT of the
//    page (the panels are unmounted, their data with them) and shows the
//    lock screen;
//  - it does the same at once when a request is answered 423, and when
//    the page is opened on a dashboard that has already locked.
//
// Unlocking is signing in with Google again, which comes back here.

type Phase = "checking" | LockPhase;

// What counts as "somebody is using the dashboard". Not mousemove: a
// bumped desk is not a person; not the page's own refreshes.
const INPUTS = ["pointerdown", "keydown", "wheel", "touchstart"] as const;

function LockScreen() {
  useStaffTheme();
  const [loading, setLoading] = useState(false);
  const unlock = () => {
    setLoading(true);
    // Back to this very tab of the dashboard. The account chooser, so a
    // glance is not enough to walk through — Google offers a site no way
    // to ask for the password again.
    signIn(
      "google",
      { callbackUrl: window.location.pathname + window.location.search },
      { prompt: "select_account" }
    );
  };
  return (
    <main className="relative isolate flex min-h-dvh items-center justify-center px-4 py-8 text-ui-text">
      <Backdrop under />
      <Panel className="flex w-full max-w-sm flex-col gap-5 px-6 pb-7 pt-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight">Locked</h1>
          <p className="text-sm text-ui-text-2">
            The dashboard locks after 30 minutes without activity.
          </p>
        </div>
        <Button
          variant="primary"
          size="lg"
          className="w-full"
          onClick={unlock}
          disabled={loading}
        >
          Sign in with Google to continue
        </Button>
      </Panel>
    </main>
  );
}

function Gate({ children }: { children: ReactNode }) {
  const { data: session, status, update } = useSession();
  const [phase, setPhase] = useState<Phase>("checking");
  const lastInput = useRef(0);
  const lastReport = useRef(0);
  const updateRef = useRef(update);
  updateRef.current = update;

  // Opening the page: locked already, or open — and opening it is itself
  // a use of the dashboard.
  useEffect(() => {
    if (phase !== "checking" || status === "loading") return;
    if (status === "unauthenticated") {
      goToStaffLogin();
      return;
    }
    if (dashboardLocked(session?.dashAt, Date.now())) {
      setPhase("locked");
      return;
    }
    lastInput.current = Date.now();
    setPhase("open");
  }, [phase, status, session]);

  const running = phase === "open" || phase === "warning";

  useEffect(() => {
    if (!running) return;
    const lock = () => setPhase("locked");
    const onInput = () => {
      lastInput.current = Date.now();
    };
    const tick = () => {
      const now = Date.now();
      const next = lockPhase(lastInput.current, now);
      setPhase((current) => (current === "locked" ? current : next));
      if (next === "locked") return;
      if (shouldReportActivity(lastInput.current, lastReport.current, now)) {
        lastReport.current = now;
        // The answer carries the moment as the server now has it. If the
        // server says it has locked (this tab slept, the clock moved),
        // the server is right.
        updateRef
          .current({ dashboardActive: true })
          .then((fresh) => {
            if (fresh && dashboardLocked(fresh.dashAt, Date.now())) lock();
          })
          .catch(() => {});
      }
    };
    for (const name of INPUTS) {
      window.addEventListener(name, onInput, { passive: true, capture: true });
    }
    window.addEventListener(DASHBOARD_LOCKED_EVENT, lock);
    const timer = window.setInterval(tick, 1000);
    tick();
    return () => {
      for (const name of INPUTS) {
        window.removeEventListener(name, onInput, { capture: true });
      }
      window.removeEventListener(DASHBOARD_LOCKED_EVENT, lock);
      window.clearInterval(timer);
    };
  }, [running]);

  if (phase === "checking") return null;
  if (phase === "locked") return <LockScreen />;
  return (
    <>
      {children}
      {phase === "warning" && (
        // Fixed, so that appearing and going moves nothing on the page.
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
          <Banner tone="caution" role="status" className="shadow-lift-2">
            The dashboard will lock in a minute. Click or press a key to keep it
            open.
          </Banner>
        </div>
      )}
    </>
  );
}

export default function DashboardLock({ children }: { children: ReactNode }) {
  return (
    // No refetch on focus: the session is asked for once, and after that
    // only this component's own updates touch it.
    <SessionProvider refetchOnWindowFocus={false}>
      <Gate>{children}</Gate>
    </SessionProvider>
  );
}
