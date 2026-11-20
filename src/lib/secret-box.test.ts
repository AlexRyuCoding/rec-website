import { describe, expect, it } from "vitest";
import { openSecret, sealSecret } from "./secret-box";

describe("secret box", () => {
  const secret = "server-secret";
  const purpose = "spotify-refresh-token";

  it("round-trips a secret", () => {
    const sealed = sealSecret("AQD-refresh-token", secret, purpose);
    expect(sealed).not.toContain("AQD-refresh-token");
    expect(openSecret(sealed, secret, purpose)).toBe("AQD-refresh-token");
  });

  it("seals the same secret differently each time", () => {
    expect(sealSecret("x", secret, purpose)).not.toBe(
      sealSecret("x", secret, purpose)
    );
  });

  it("opens nothing with another server secret or purpose", () => {
    const sealed = sealSecret("token", secret, purpose);
    expect(openSecret(sealed, "other-secret", purpose)).toBeNull();
    expect(openSecret(sealed, secret, "other-purpose")).toBeNull();
  });

  it("returns null for tampered or malformed input instead of throwing", () => {
    const sealed = sealSecret("token", secret, purpose);
    const parts = sealed.split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(openSecret(parts.join("."), secret, purpose)).toBeNull();
    expect(openSecret("plain-token", secret, purpose)).toBeNull();
    expect(openSecret("v1.a.b", secret, purpose)).toBeNull();
    expect(openSecret(null, secret, purpose)).toBeNull();
    expect(openSecret("", secret, purpose)).toBeNull();
  });
});
