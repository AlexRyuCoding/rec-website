// Signing out of the dashboard without the lock's own reports undoing it.
//
// While somebody uses the dashboard, the page reports it (a session
// update, see DashboardLock.tsx), and every such report is answered with
// a freshly issued sign-in cookie. Pressing "Sign out" is itself a use of
// the page. So a report could leave just before the sign-out and be
// answered just after it: the cleared cookie was then replaced by a
// working one, and the browser sat on the login page looking signed out
// while still signed in (found in review, 2026-11-23; about 1 press in
// 40 on a real connection).
//
// The rule: once leaving has begun no report is sent, and the sign-out
// itself is not sent until a report already on its way has been answered.

// A report that never answers must not keep anyone signed in.
const WAIT_FOR_REPORT_MS = 4000;

let leaving: Promise<void> | null = null;
let onItsWay: Promise<unknown> | null = null;

// Send a "somebody is using the dashboard" report — unless leaving has
// begun, in which case nothing is sent and the answer is null.
export function reportWhileStaying<T>(
  send: () => Promise<T>
): Promise<T | null> {
  if (leaving) return Promise.resolve(null);
  const sent = send();
  const settled = sent.then(
    () => undefined,
    () => undefined
  );
  onItsWay = settled;
  void settled.then(() => {
    if (onItsWay === settled) onItsWay = null;
  });
  return sent;
}

// Sign out: stop reporting, let a report on its way be answered (for a
// few seconds at most), then sign out. A second press does nothing more.
export function leaveDashboardQuietly(
  signOut: () => Promise<unknown> | unknown
): Promise<void> {
  if (leaving) return leaving;
  leaving = (async () => {
    if (onItsWay) {
      await Promise.race([
        onItsWay,
        new Promise((resolve) => setTimeout(resolve, WAIT_FOR_REPORT_MS)),
      ]);
    }
    await signOut();
  })();
  return leaving;
}

export function resetDashboardLeaveForTests(): void {
  leaving = null;
  onItsWay = null;
}
