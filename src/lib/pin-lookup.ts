// A way to find a patient by PIN without trying the PIN against every
// stored hash. Pure; the database side is pin-server.ts.
//
// PINs are stored as bcrypt hashes, and bcrypt cannot be searched: the
// only way to find whose PIN "4821" is, is to compare it against each
// patient's hash in turn (about 15 ms each). That is fine for fifty
// patients and a multi-second wait for several hundred.
//
// So next to the hash each patient gets a fingerprint of their PIN: an
// HMAC of the PIN under a key only the server holds (derived from
// NEXTAUTH_SECRET). The same PIN always gives the same fingerprint, so it
// can sit in an indexed column and be looked up in one query. Without
// the key it says nothing about the PIN — unlike a plain hash of four
// digits, which anyone could reverse by trying all 10,000. The bcrypt
// hash stays, and a fingerprint match is still confirmed against it.
//
// The fingerprint starts with a short id of the key that made it. If
// NEXTAUTH_SECRET is ever rotated, old fingerprints simply stop being
// "current": those patients are found the slow way once and re-stamped.

import { createHash, createHmac } from "crypto";

const PURPOSE = "rac-pin-lookup-v1";
const KEY_ID_LENGTH = 8;

function lookupKey(serverSecret: string): Buffer {
  return createHash("sha256").update(`${PURPOSE}:${serverSecret}`).digest();
}

function keyId(serverSecret: string): string {
  return createHash("sha256")
    .update(`${PURPOSE}:id:${serverSecret}`)
    .digest("hex")
    .slice(0, KEY_ID_LENGTH);
}

export function pinFingerprint(pin: string, serverSecret: string): string {
  const mac = createHmac("sha256", lookupKey(serverSecret))
    .update(pin)
    .digest("hex");
  return keyId(serverSecret) + mac;
}

// Was this stored fingerprint made with the key in use now? Only then
// does "its fingerprint is different" prove "its PIN is different".
export function isCurrentFingerprint(
  stored: string | null | undefined,
  serverSecret: string
): boolean {
  return typeof stored === "string" && stored.startsWith(keyId(serverSecret));
}
