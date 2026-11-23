import { loginPathFor } from "./staff-session";

// The server said this browser is no longer signed in (401): go to the
// login page, and come back to this page afterwards. A full page load on
// purpose — whatever the page was showing is gone with the session.
export function goToStaffLogin(): void {
  window.location.href = loginPathFor(
    window.location.pathname + window.location.search
  );
}

// A dashboard request was refused. 401: this browser is no longer signed
// in — go to the login page. 423: still signed in, but the dashboard has
// locked (dashboard-lock.ts) — tell the page, which swaps its contents
// for the lock screen (admin/dashboard/DashboardLock.tsx).
export const DASHBOARD_LOCKED_EVENT = "rac-dashboard-locked";

export function leaveDashboard(status: number): void {
  if (status === 423) window.dispatchEvent(new Event(DASHBOARD_LOCKED_EVENT));
  else goToStaffLogin();
}
