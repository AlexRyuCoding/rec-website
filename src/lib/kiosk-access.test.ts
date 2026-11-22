import { describe, expect, it } from "vitest";
import { carriesKioskCookie, parseDeviceCookie } from "./device-cookie";
import { formatDisplayCookie, generateSecret } from "./display-auth";
import { resolveKioskAccess } from "./kiosk-access";

describe("resolveKioskAccess", () => {
  it("an ordinary browser is staff or nobody", () => {
    expect(resolveKioskAccess(null, true)).toEqual({ status: "staff" });
    expect(resolveKioskAccess(null, false)).toEqual({ status: "none" });
  });

  it("a paired kiosk is a kiosk", () => {
    expect(resolveKioskAccess({ status: "ok" }, false)).toEqual({
      status: "paired",
    });
  });

  it("a kiosk waiting for staff shows its code", () => {
    expect(
      resolveKioskAccess({ status: "pending", code: "K7M4QX" }, false)
    ).toEqual({ status: "pending", code: "K7M4QX" });
  });

  it("a revoked kiosk is nobody — a staff sign-in on it does not count", () => {
    expect(resolveKioskAccess({ status: "none" }, true)).toEqual({
      status: "none",
    });
  });

  it("a pairing that could not be checked is an error, not 'none'", () => {
    expect(resolveKioskAccess({ status: "error" }, true)).toEqual({
      status: "error",
    });
  });
});

describe("carriesKioskCookie", () => {
  const id = "3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b";

  it("recognises the cookie a paired device carries", () => {
    const value = formatDisplayCookie(id, generateSecret());
    expect(carriesKioskCookie(value)).toBe(true);
    expect(parseDeviceCookie(value)?.id).toBe(id);
  });

  it("is false for no cookie or anything else", () => {
    for (const value of [undefined, null, "", "1", "true", `${id}.short`, id]) {
      expect(carriesKioskCookie(value)).toBe(false);
    }
  });
});
