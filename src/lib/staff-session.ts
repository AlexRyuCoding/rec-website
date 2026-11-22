// When a staff sign-in ends, and where signing in again leads. Pure and
// free of next-auth imports, so the Edge middleware can use it.
//
// A sign-in lasts until the clinic's next 3 am, not "24 hours from when
// the button was pressed". With a plain 24-hour session, a board or the
// kiosk signed in at 8:10 one morning drops to the login screen at 8:10
// the next — in the middle of the clinic day, in front of a patient.
// Ending every session overnight keeps the routine the same (staff sign
// in once at the start of the day) and moves the cut-off to an hour when
// nobody is there.

import { CLINIC_TZ } from "./clinic-time";

export const SESSION_DAY_END_HOUR = 3;

const DAY_SECONDS = 24 * 60 * 60;

const clinicClock = new Intl.DateTimeFormat("en-US", {
  timeZone: CLINIC_TZ,
  hourCycle: "h23",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function clinicSecondsIntoDay(nowMs: number): number {
  const parts = clinicClock.formatToParts(new Date(nowMs));
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  return get("hour") * 3600 + get("minute") * 60 + get("second");
}

// The moment (epoch ms) a sign-in made now stops working: the next 3 am
// on the clinic's clock. On the two nights a year the clocks change it
// lands an hour off, which nobody is awake to notice.
export function sessionDayEnd(nowMs: number): number {
  const into = clinicSecondsIntoDay(nowMs);
  const end = SESSION_DAY_END_HOUR * 3600;
  const secondsLeft = into < end ? end - into : DAY_SECONDS - into + end;
  return Math.floor(nowMs / 1000) * 1000 + secondsLeft * 1000;
}

// dayEnd is the value stored in the sign-in token. A token without one
// was issued before this rule existed; it runs out by itself within 24
// hours, so it is left alone rather than signing everyone out mid-day on
// the deploy.
export function sessionDayOver(dayEnd: unknown, nowMs: number): boolean {
  return typeof dayEnd === "number" && nowMs >= dayEnd;
}

export const LOGIN_PATH = "/admin/login";
// Where signing in leads when nothing else was asked for.
export const DEFAULT_AFTER_LOGIN = "/admin/patient-signin";

// The page to open after signing in. Only our own staff pages qualify:
// the value comes from the address bar, so anything else (another site,
// "//host", the login page itself) falls back to the default.
export function safeNextPath(next: string | null | undefined): string {
  if (!next) return DEFAULT_AFTER_LOGIN;
  if (!next.startsWith("/admin/") || next.includes("\\")) {
    return DEFAULT_AFTER_LOGIN;
  }
  if (next === LOGIN_PATH || next.startsWith(`${LOGIN_PATH}?`)) {
    return DEFAULT_AFTER_LOGIN;
  }
  return next;
}

// The login address that brings staff back to the page they were on.
export function loginPathFor(currentPath: string): string {
  const next = safeNextPath(currentPath);
  return next === DEFAULT_AFTER_LOGIN
    ? LOGIN_PATH
    : `${LOGIN_PATH}?next=${encodeURIComponent(next)}`;
}
