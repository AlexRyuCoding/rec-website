import { readFileSync } from "fs";
import { join } from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const allowed = vi.hoisted(() => ({ kiosk: false }));
vi.mock("./kiosk-auth-server", () => ({
  isKioskAuthorized: async () => allowed.kiosk,
}));
vi.mock("./admin-auth", () => ({
  getAdminEmail: async () => null,
  isAdminAuthorized: async () => false,
}));

import { kioskRoute } from "./kiosk-route";

const request = () => new NextRequest("https://example.test/api/checkins");

beforeEach(() => {
  allowed.kiosk = false;
});

describe("kioskRoute", () => {
  it("does not run the handler for a browser that is neither a paired kiosk nor staff", async () => {
    const handler = vi.fn(async () => new Response("a patient's name"));
    const res = await kioskRoute(handler)(request());
    expect(handler).not.toHaveBeenCalled();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("runs it for a paired kiosk (or staff)", async () => {
    allowed.kiosk = true;
    const res = await kioskRoute(async () => Response.json({ ok: true }))(
      request()
    );
    expect(res.status).toBe(200);
    // A patient's name and appointment must never be kept by the tablet's
    // browser, whichever route answered.
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("asks again on every request — a revoked kiosk is refused at once", async () => {
    const route = kioskRoute(async () => new Response("ok"));
    allowed.kiosk = true;
    expect((await route(request())).status).toBe(200);
    allowed.kiosk = false;
    expect((await route(request())).status).toBe(401);
  });
});

// The kiosk's routes. A new one belongs in this list.
const KIOSK_ROUTES = [
  "src/app/api/patients/lookup/route.ts",
  "src/app/api/patients/setup-pin/route.ts",
  "src/app/api/appointments/today/route.ts",
  "src/app/api/checkins/route.ts",
];

describe("every kiosk route", () => {
  it.each(KIOSK_ROUTES)(
    "%s exports only handlers wrapped in kioskRoute",
    (path) => {
      const source = readFileSync(join(process.cwd(), path), "utf8");
      const exported = [
        ...source.matchAll(
          /export\s+(?:async\s+function|function|const)\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g
        ),
      ].map((m) => m[1]);
      expect(exported.length).toBeGreaterThan(0);
      for (const method of exported) {
        expect(
          source.includes(`export const ${method} = kioskRoute(`),
          `${path}: ${method} must be \`export const ${method} = kioskRoute(…)\``
        ).toBe(true);
      }
      // …and none of them checks who is asking by itself any more.
      expect(source).not.toMatch(
        /isKioskAuthorized|isAdminAuthorized|getServerSession/
      );
    }
  );
});
