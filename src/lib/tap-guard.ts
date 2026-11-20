// A double tap must never answer a question the patient has not seen.
//
// On the kiosk a button press often replaces the screen, and the next
// screen frequently has a button in the same spot: "Continue" gives way to
// "Cancel", the fourth PIN digit gives way to "Yes — check me in", "Yes"
// gives way to "Done". An impatient or shaky second tap would land on that
// new button within a fraction of a second. So for a moment after every
// screen change, the kiosk's buttons ignore presses — shorter than anyone
// can read and react, long enough to absorb the second half of a double
// tap.
export const SCREEN_CHANGE_GUARD_MS = 350;

export function createTapGuard() {
  let blockedUntil = 0;
  return {
    block(ms: number, now = Date.now()) {
      blockedUntil = Math.max(blockedUntil, now + ms);
    },
    blocked(now = Date.now()) {
      return now < blockedUntil;
    },
  };
}

// One guard for the whole kiosk: every button consults it.
export const kioskTapGuard = createTapGuard();
