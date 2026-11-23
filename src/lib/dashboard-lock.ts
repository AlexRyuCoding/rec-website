// The staff dashboard locks itself when nobody is using it. Pure rules;
// the sign-in side is auth.ts, the server's check is staff-route.ts
// (dashboardRoute), the page's side is admin/dashboard/DashboardLock.tsx.
//
// Why: the dashboard is where full names, contact details, the check-in
// history and the audit log are. A dashboard left open on a computer must
// stop showing and serving them by itself (HIPAA's "automatic logoff").
//
// How: the sign-in cookie carries the moment the dashboard was last
// really used (`dashAt`, epoch ms).
//  - It is set at sign-in.
//  - The page renews it while a person is using the dashboard — a click,
//    a key, a touch; never the page's own automatic refreshes.
//  - The server refuses to renew a moment that has already run out, so a
//    locked dashboard cannot unlock itself: only signing in again does.
//  - Dashboard-only routes refuse once it is 30 minutes old.
//
// What it leaves alone, on purpose: the rooms board, the kiosk and the
// TV. The board runs on the wall all day on the same sign-in and shows
// only "First L."; signing the whole browser out would throw it back to
// the login screen in the middle of the clinic day.
//
// What it is not: a barrier against someone sitting at an unlocked
// computer. Google gives a site no way to ask for the password again, so
// unlocking is the account chooser. The computer's own screen lock is the
// other half (owner's decision, 2026-11-23).

// Owner's decision: 30 minutes.
export const DASHBOARD_IDLE_MS = 30 * 60 * 1000;
// The page says so one minute before.
export const DASHBOARD_WARNING_MS = 60 * 1000;
// How often, at most, the page tells the server "still here".
export const ACTIVITY_REPORT_MS = 60 * 1000;
// Two servers' clocks may differ by a moment; more than this ahead of
// "now" is not a clock difference.
const CLOCK_SLACK_MS = 30 * 1000;

// Locked unless the dashboard was used within the last 30 minutes.
// Anything unknown is locked: a sign-in made before the lock existed has
// no moment at all, and must not count as "just used".
export function dashboardLocked(dashAt: unknown, nowMs: number): boolean {
  if (typeof dashAt !== "number" || !Number.isFinite(dashAt)) return true;
  if (dashAt > nowMs + CLOCK_SLACK_MS) return true;
  return nowMs - dashAt >= DASHBOARD_IDLE_MS;
}

// "Somebody is using the dashboard": the new moment — or the old one,
// unchanged, if it has already locked.
export function renewDashboardActivity(
  dashAt: number | undefined,
  nowMs: number
): number | undefined {
  return dashboardLocked(dashAt, nowMs) ? dashAt : nowMs;
}

export type LockPhase = "open" | "warning" | "locked";

// What the page shows, counted from the last real input on it.
export function lockPhase(lastInputMs: number, nowMs: number): LockPhase {
  const idle = nowMs - lastInputMs;
  if (idle >= DASHBOARD_IDLE_MS) return "locked";
  if (idle >= DASHBOARD_IDLE_MS - DASHBOARD_WARNING_MS) return "warning";
  return "open";
}

// Tell the server only when there was input since the last time it was
// told, and not more often than once a minute.
export function shouldReportActivity(
  lastInputMs: number,
  lastReportMs: number,
  nowMs: number
): boolean {
  return (
    lastInputMs > lastReportMs && nowMs - lastReportMs >= ACTIVITY_REPORT_MS
  );
}
