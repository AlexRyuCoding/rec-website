import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "crypto";

// Encrypts a secret before it is stored in the database (the clinic's
// Spotify refresh token), so a database leak alone does not hand it out.
// AES-256-GCM; the key is derived from a server-only secret and a purpose
// label, so the same server secret gives unrelated keys for other uses.

const VERSION = "v1";

function deriveKey(serverSecret: string, purpose: string): Buffer {
  return createHash("sha256").update(`${purpose}:${serverSecret}`).digest();
}

export function sealSecret(
  plain: string,
  serverSecret: string,
  purpose: string
): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(
    "aes-256-gcm",
    deriveKey(serverSecret, purpose),
    iv
  );
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [
    VERSION,
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    body.toString("base64url"),
  ].join(".");
}

// null for anything that was not sealed with this secret and purpose
// (tampered, a rotated server secret, garbage) — never throws.
export function openSecret(
  sealed: string | null | undefined,
  serverSecret: string,
  purpose: string
): string | null {
  if (!sealed) return null;
  const parts = sealed.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) return null;
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      deriveKey(serverSecret, purpose),
      Buffer.from(parts[1], "base64url")
    );
    decipher.setAuthTag(Buffer.from(parts[2], "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(parts[3], "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}
