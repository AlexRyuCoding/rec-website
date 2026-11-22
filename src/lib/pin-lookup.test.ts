import { describe, expect, it } from "vitest";
import { isCurrentFingerprint, pinFingerprint } from "./pin-lookup";

const SECRET = "server-secret-one";

describe("pinFingerprint", () => {
  it("is the same every time for the same PIN and server secret", () => {
    expect(pinFingerprint("4821", SECRET)).toBe(pinFingerprint("4821", SECRET));
  });

  it("differs for every PIN — no two of the 10,000 share one", () => {
    const seen = new Set<string>();
    for (let n = 0; n < 10_000; n++) {
      seen.add(pinFingerprint(String(n).padStart(4, "0"), SECRET));
    }
    expect(seen.size).toBe(10_000);
  });

  it("depends on the server secret, so the database alone gives nothing away", () => {
    expect(pinFingerprint("4821", SECRET)).not.toBe(
      pinFingerprint("4821", "server-secret-two")
    );
  });

  it("does not contain the PIN", () => {
    expect(pinFingerprint("4821", SECRET)).toMatch(/^[0-9a-f]{72}$/);
  });
});

describe("isCurrentFingerprint", () => {
  it("recognises a fingerprint made with the current secret", () => {
    expect(isCurrentFingerprint(pinFingerprint("4821", SECRET), SECRET)).toBe(
      true
    );
  });

  it("does not recognise one made before the secret was rotated", () => {
    const old = pinFingerprint("4821", "server-secret-two");
    expect(isCurrentFingerprint(old, SECRET)).toBe(false);
  });

  it("is false for a patient with no fingerprint", () => {
    expect(isCurrentFingerprint(null, SECRET)).toBe(false);
    expect(isCurrentFingerprint(undefined, SECRET)).toBe(false);
  });
});
