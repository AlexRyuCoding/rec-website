import { describe, expect, it } from "vitest";
import { adminPageGate, KIOSK_PATH } from "./admin-gate";

const NOW = Date.parse("2026-11-24T18:00:00.000Z");
const browser = (
  overrides: Partial<Parameters<typeof adminPageGate>[0]> = {}
) => ({
  pathname: "/admin/dashboard",
  search: "",
  kiosk: false,
  staff: false,
  dayEnd: NOW + 3600_000,
  nowMs: NOW,
  ...overrides,
});
const staff = { staff: true };
const kiosk = { kiosk: true };

describe("adminPageGate", () => {
  it("lets signed-in staff into staff pages", () => {
    expect(adminPageGate(browser(staff))).toEqual({ allow: true });
    expect(
      adminPageGate(browser({ ...staff, pathname: "/admin/rooms" }))
    ).toEqual({
      allow: true,
    });
  });

  it("sends anyone else to the login page, remembering where they were going", () => {
    expect(
      adminPageGate(browser({ pathname: "/admin/rooms", search: "?x=1" }))
    ).toEqual({
      allow: false,
      redirect: "/admin/login?next=%2Fadmin%2Frooms%3Fx%3D1",
    });
  });

  it("sends staff whose sign-in was on an earlier day to the login page", () => {
    expect(adminPageGate(browser({ ...staff, dayEnd: NOW - 1 }))).toMatchObject(
      {
        allow: false,
      }
    );
  });

  it("the kiosk page opens for a browser with no credentials at all", () => {
    expect(adminPageGate(browser({ pathname: KIOSK_PATH }))).toEqual({
      allow: true,
    });
  });

  it("the login page is always reachable for an ordinary browser", () => {
    expect(adminPageGate(browser({ pathname: "/admin/login" }))).toEqual({
      allow: true,
    });
  });

  describe("a browser carrying a kiosk cookie", () => {
    it("gets the kiosk page", () => {
      expect(
        adminPageGate(browser({ ...kiosk, pathname: KIOSK_PATH }))
      ).toEqual({
        allow: true,
      });
    });

    it("is sent back to the kiosk from every staff page", () => {
      for (const pathname of [
        "/admin/dashboard",
        "/admin/rooms",
        "/admin/other",
      ]) {
        expect(adminPageGate(browser({ ...kiosk, pathname }))).toEqual({
          allow: false,
          redirect: KIOSK_PATH,
        });
      }
    });

    it("cannot even reach the login page", () => {
      expect(
        adminPageGate(browser({ ...kiosk, pathname: "/admin/login" }))
      ).toEqual({
        allow: false,
        redirect: KIOSK_PATH,
      });
    });

    it("is not staff even with a valid staff sign-in on the same browser", () => {
      expect(adminPageGate(browser({ ...kiosk, ...staff }))).toEqual({
        allow: false,
        redirect: KIOSK_PATH,
      });
    });
  });
});
