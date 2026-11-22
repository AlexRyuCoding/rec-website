import { createHash, randomBytes, randomInt, timingSafeEqual } from "crypto";
import {
  DISPLAY_COOKIE,
  KIOSK_COOKIE,
  parseDeviceCookie,
} from "./device-cookie";

// Pairing for the waiting-room screen. The screen is a TV left running for
// days, so it cannot use the staff Google sign-in (24 h sessions, awkward
// on a TV). Instead it is paired once, like a streaming app:
//
//   1. the TV asks the server for a pairing; it gets a short code to show
//      and a long random secret in an httpOnly cookie
//   2. a signed-in staff member types the code into the dashboard
//   3. from then on the cookie alone authorises that one screen, until
//      staff revoke it
//
// The server stores only a hash of the secret, so a database leak does not
// hand out working screens. This file is the pure part; the database side
// is display-server.ts.
//
// The check-in kiosk is paired the same way (see kiosk-auth-server.ts):
// same code, same cookie shape, its own table and cookie name, so a TV
// pairing can never open the kiosk's routes or the other way round.

export { DISPLAY_COOKIE, KIOSK_COOKIE };

export type DeviceKind = "tv" | "kiosk";

export const DEVICES: Record<DeviceKind, { table: string; cookie: string }> = {
  tv: { table: "display_devices", cookie: DISPLAY_COOKIE },
  kiosk: { table: "kiosk_devices", cookie: KIOSK_COOKIE },
};
// 400 days is the longest lifetime browsers honour; it is re-set on use.
export const DISPLAY_COOKIE_MAX_AGE_S = 400 * 24 * 60 * 60;
// No 0/O or 1/I: the code is read off a TV across a room.
export const PAIR_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const PAIR_CODE_LENGTH = 6;
// How long staff have to type the code in before the TV shows a new one.
export const PENDING_TTL_MS = 10 * 60 * 1000;
export const PAIR_MAX_PER_HOUR = 10;

export function generatePairCode(): string {
  let code = "";
  for (let i = 0; i < PAIR_CODE_LENGTH; i++) {
    code += PAIR_CODE_ALPHABET[randomInt(PAIR_CODE_ALPHABET.length)];
  }
  return code;
}

export function generateSecret(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

// Constant-time, and never throws on a malformed stored hash.
export function verifySecret(secret: string, hash: string): boolean {
  const expected = Buffer.from(hashSecret(secret), "hex");
  const stored = Buffer.from(hash, "hex");
  if (stored.length !== expected.length) return false;
  return timingSafeEqual(expected, stored);
}

export function formatDisplayCookie(id: string, secret: string): string {
  return `${id}.${secret}`;
}

// Anything that is not exactly "<uuid>.<43-char secret>" is treated as no
// cookie at all — the screen simply pairs again. (Lives in
// device-cookie.ts so the Edge middleware can use it.)
export const parseDisplayCookie = parseDeviceCookie;

// What staff type, forgiving of case, spaces and dashes.
export function normalizePairCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function isApprovable(
  row: {
    approved_at: string | null;
    revoked_at: string | null;
    created_at: string;
  },
  nowMs: number
): boolean {
  if (row.approved_at !== null || row.revoked_at !== null) return false;
  return nowMs - Date.parse(row.created_at) <= PENDING_TTL_MS;
}
