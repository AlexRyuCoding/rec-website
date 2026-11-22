import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const signedIn = vi.hoisted(() => ({ email: null as string | null }));
vi.mock("./admin-auth", () => ({
  getAdminEmail: async () => signedIn.email,
  isAdminAuthorized: async () => signedIn.email !== null,
}));

import { staffRoute } from "./staff-route";

const request = () => new NextRequest("https://example.test/api/admin/thing");
const context = <P>(params: P) => ({ params: Promise.resolve(params) });

beforeEach(() => {
  signedIn.email = null;
});

describe("staffRoute", () => {
  it("does not run the handler unless a staff member is signed in", async () => {
    const handler = vi.fn(async () => new Response("secret"));
    const res = await staffRoute(handler)(request(), context({}));
    expect(handler).not.toHaveBeenCalled();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("runs it for staff, with who they are and the route's parameters", async () => {
    signedIn.email = "desk@example.com";
    const route = staffRoute<{ id: string }>(async (_req, staff, { params }) =>
      Response.json({ by: staff.email, id: (await params).id })
    );
    const res = await route(request(), context({ id: "room-3" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ by: "desk@example.com", id: "room-3" });
  });

  it("asks again on every request — a sign-in that ended is refused at once", async () => {
    const route = staffRoute(async () => new Response("ok"));
    signedIn.email = "desk@example.com";
    expect((await route(request(), context({}))).status).toBe(200);
    signedIn.email = null;
    expect((await route(request(), context({}))).status).toBe(401);
  });

  it("can send a browser to the login page instead of answering JSON", async () => {
    const handler = vi.fn(async () => new Response("connected"));
    const route = staffRoute(handler, {
      whenNotStaff: (req) =>
        Response.redirect(new URL("/admin/login", req.url)),
    });
    const res = await route(request(), context({}));
    expect(handler).not.toHaveBeenCalled();
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      "https://example.test/admin/login"
    );
  });
});

// ---- every staff route is behind it --------------------------------------

const ADMIN_API = join(process.cwd(), "src/app/api/admin");

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return routeFiles(path);
    return name === "route.ts" ? [path] : [];
  });
}

// Handlers that answer without a sign-in, each for a stated reason.
const OPEN_ON_PURPOSE: Record<string, string> = {
  // Tells a dashboard tab from before the search became a POST to reload.
  // It reads nothing and says the same to everyone.
  "patients/route.ts GET": "stale-tab notice",
};

describe("every route under /api/admin", () => {
  const files = routeFiles(ADMIN_API);

  it("is found (the check below is not vacuous)", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it.each(files.map((f) => [f.slice(ADMIN_API.length + 1), f]))(
    "%s exports only handlers wrapped in staffRoute",
    (relative, path) => {
      const source = readFileSync(path, "utf8");
      const exported = [
        ...source.matchAll(
          /export\s+(?:async\s+function|function|const)\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g
        ),
      ].map((m) => m[1]);
      expect(exported.length).toBeGreaterThan(0);
      for (const method of exported) {
        if (OPEN_ON_PURPOSE[`${relative} ${method}`]) continue;
        expect(
          new RegExp(`export const ${method} = staffRoute(?:<[^>]*>)?\\(`).test(
            source
          ),
          `${relative}: ${method} must be \`export const ${method} = staffRoute(…)\``
        ).toBe(true);
      }
      // …and none of them checks the session by itself any more.
      expect(source).not.toMatch(
        /getServerSession|isAdminAuthorized|getAdminEmail/
      );
    }
  );

  it("the handlers left open are still the ones listed", () => {
    for (const key of Object.keys(OPEN_ON_PURPOSE)) {
      const [relative, method] = key.split(" ");
      const source = readFileSync(join(ADMIN_API, relative), "utf8");
      expect(source).toMatch(new RegExp(`export async function ${method}\\b`));
    }
  });
});
