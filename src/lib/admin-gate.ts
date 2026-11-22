// Which /admin page a browser may open — the middleware's decision, as a
// pure function. No next-auth or Node imports: it runs on the Edge.

import {
  DEFAULT_AFTER_LOGIN,
  LOGIN_PATH,
  loginPathFor,
  sessionDayOver,
} from "./staff-session";

// The check-in kiosk page.
export const KIOSK_PATH = DEFAULT_AFTER_LOGIN;

export type GateDecision = { allow: true } | { allow: false; redirect: string };

export function adminPageGate(request: {
  pathname: string;
  search: string;
  // The browser carries a kiosk cookie (shape only — device-cookie.ts).
  kiosk: boolean;
  // The signed-in Google account is on the allowlist.
  staff: boolean;
  dayEnd: unknown;
  nowMs: number;
}): GateDecision {
  const { pathname } = request;

  // A kiosk is never staff. Whatever else that browser holds — a Google
  // sign-in made on the tablet before it was paired, or after — every
  // staff page, the login page included, leads back to the kiosk.
  if (request.kiosk) {
    return pathname === KIOSK_PATH
      ? { allow: true }
      : { allow: false, redirect: KIOSK_PATH };
  }

  // The kiosk page itself holds no patient data (like /waiting-room): its
  // routes answer only a paired kiosk or staff. It has to open on a
  // tablet with no credentials at all, to show the pairing code.
  if (pathname === KIOSK_PATH || pathname === LOGIN_PATH)
    return { allow: true };

  // Not signed in, off the allowlist, or signed in on an earlier day:
  // to the login page, which leads back here afterwards.
  if (!request.staff || sessionDayOver(request.dayEnd, request.nowMs)) {
    return {
      allow: false,
      redirect: loginPathFor(pathname + request.search),
    };
  }
  return { allow: true };
}
