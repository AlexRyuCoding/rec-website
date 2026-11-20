import { describe, expect, it } from "vitest";
import {
  formatDisplayCookie,
  generatePairCode,
  generateSecret,
  hashSecret,
  isApprovable,
  normalizePairCode,
  PAIR_CODE_ALPHABET,
  PAIR_CODE_LENGTH,
  parseDisplayCookie,
  verifySecret,
} from "./display-auth";

const T0 = Date.parse("2026-11-19T18:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();
const MIN = 60_000;
const ID = "3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b";

describe("generatePairCode", () => {
  it("is six characters from the unambiguous alphabet", () => {
    for (let i = 0; i < 200; i++) {
      const code = generatePairCode();
      expect(code).toHaveLength(PAIR_CODE_LENGTH);
      for (const ch of code) expect(PAIR_CODE_ALPHABET).toContain(ch);
    }
  });
  it("never uses characters that are confused on a TV (0 O 1 I)", () => {
    for (const ch of "0O1I") expect(PAIR_CODE_ALPHABET).not.toContain(ch);
  });
});

describe("normalizePairCode", () => {
  it("uppercases and strips spaces and dashes", () => {
    expect(normalizePairCode(" k7m-4qx ")).toBe("K7M4QX");
  });
});

describe("hashSecret / verifySecret", () => {
  it("accepts the secret that produced the hash", () => {
    const secret = generateSecret();
    expect(verifySecret(secret, hashSecret(secret))).toBe(true);
  });
  it("rejects any other secret", () => {
    const hash = hashSecret(generateSecret());
    expect(verifySecret(generateSecret(), hash)).toBe(false);
  });
  it("rejects a malformed stored hash without throwing", () => {
    expect(verifySecret("x", "short")).toBe(false);
    expect(verifySecret("x", "")).toBe(false);
  });
  it("never stores the secret itself", () => {
    const secret = generateSecret();
    expect(hashSecret(secret)).not.toContain(secret);
    expect(hashSecret(secret)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("display cookie", () => {
  it("round-trips id and secret", () => {
    const secret = generateSecret();
    expect(parseDisplayCookie(formatDisplayCookie(ID, secret))).toEqual({
      id: ID,
      secret,
    });
  });
  it.each([
    ["undefined", undefined],
    ["null", null],
    ["empty", ""],
    ["no dot", "abc"],
    ["id is not a uuid", `not-a-uuid.${"a".repeat(43)}`],
    ["secret too short", `${ID}.${"a".repeat(10)}`],
    ["extra segment", `${ID}.${"a".repeat(43)}.extra`],
    ["secret with illegal characters", `${ID}.${"a".repeat(42)}!`],
  ])("treats a %s cookie as unpaired", (_label, value) => {
    expect(parseDisplayCookie(value)).toBeNull();
  });
});

describe("isApprovable", () => {
  const pending = {
    approved_at: null,
    revoked_at: null,
    created_at: iso(T0 - 2 * MIN),
  };
  it("a fresh pending code can be approved", () => {
    expect(isApprovable(pending, T0)).toBe(true);
  });
  it("a code older than ten minutes cannot", () => {
    const old = { ...pending, created_at: iso(T0 - 11 * MIN) };
    expect(isApprovable(old, T0)).toBe(false);
  });
  it("an already approved screen cannot be approved again", () => {
    expect(isApprovable({ ...pending, approved_at: iso(T0) }, T0)).toBe(false);
  });
  it("a revoked screen cannot be approved", () => {
    expect(isApprovable({ ...pending, revoked_at: iso(T0) }, T0)).toBe(false);
  });
});
