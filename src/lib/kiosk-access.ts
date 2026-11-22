// What a browser is, as far as the check-in kiosk is concerned. Pure; the
// part that reads cookies and the database is kiosk-auth-server.ts.

import type { DisplayAuth } from "./display-server";

export type KioskAccess =
  // A paired kiosk.
  | { status: "paired" }
  // Not a paired kiosk, but a signed-in staff member.
  | { status: "staff" }
  // Asked for a pairing code; staff have not typed it in yet.
  | { status: "pending"; code: string }
  // Neither. (Also: a kiosk whose pairing was revoked or expired.)
  | { status: "none" }
  // The pairing could not be checked. Not "none": the page must retry,
  // not drop a working kiosk to the set-up screen over a database blip.
  | { status: "error" };

// deviceAuth: what the database says about the kiosk cookie, or null when
// the browser carries none. A browser that does carry one is judged on
// that alone — never on a staff session (see carriesKioskCookie).
export function resolveKioskAccess(
  deviceAuth: DisplayAuth | null,
  isStaff: boolean
): KioskAccess {
  if (deviceAuth === null) return { status: isStaff ? "staff" : "none" };
  if (deviceAuth.status === "ok") return { status: "paired" };
  return deviceAuth;
}
