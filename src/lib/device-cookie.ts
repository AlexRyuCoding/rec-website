// The cookie a paired device carries ("<row id>.<secret>"), and how to
// recognise one. Free of Node imports on purpose: the Edge middleware
// needs to know "is this browser a kiosk?" and cannot load crypto.

// Waiting-room TV.
export const DISPLAY_COOKIE = "rac_display";
// Check-in kiosk.
export const KIOSK_COOKIE = "rac_kiosk";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// 32 random bytes as base64url are always exactly 43 characters.
const SECRET_RE = /^[A-Za-z0-9_-]{43}$/;

// Anything that is not exactly "<uuid>.<43-char secret>" is treated as no
// cookie at all — the device simply pairs again.
export function parseDeviceCookie(
  value: string | undefined | null
): { id: string; secret: string } | null {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 2) return null;
  const [id, secret] = parts;
  if (!UUID_RE.test(id) || !SECRET_RE.test(secret)) return null;
  return { id, secret };
}

// Does this browser present itself as a kiosk? Only the shape is checked
// (whether the pairing is real is the database's answer, in the API
// routes). That is enough for the one thing this decides: a browser that
// carries a kiosk cookie is never treated as staff. Being wrong about a
// forged cookie only ever takes access away.
export function carriesKioskCookie(value: string | undefined | null): boolean {
  return parseDeviceCookie(value) !== null;
}
