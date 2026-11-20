import { createHash, randomBytes, randomInt, timingSafeEqual } from "crypto";

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

export const DISPLAY_COOKIE = "rac_display";
// 400 days is the longest lifetime browsers honour; it is re-set on use.
export const DISPLAY_COOKIE_MAX_AGE_S = 400 * 24 * 60 * 60;
// No 0/O or 1/I: the code is read off a TV across a room.
export const PAIR_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const PAIR_CODE_LENGTH = 6;
// How long staff have to type the code in before the TV shows a new one.
export const PENDING_TTL_MS = 10 * 60 * 1000;
export const PAIR_MAX_PER_HOUR = 10;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// 32 random bytes as base64url are always exactly 43 characters.
const SECRET_RE = /^[A-Za-z0-9_-]{43}$/;

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
// cookie at all — the screen simply pairs again.
export function parseDisplayCookie(
  value: string | undefined | null
): { id: string; secret: string } | null {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 2) return null;
  const [id, secret] = parts;
  if (!UUID_RE.test(id) || !SECRET_RE.test(secret)) return null;
  return { id, secret };
}

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
