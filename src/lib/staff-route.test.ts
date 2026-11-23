import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const signedIn = vi.hoisted(() => ({
  email: null as string | null,
  // When the dashboard was last used (epoch ms), as the sign-in carries it.
  dashAt: undefined as number | undefined,
}));
vi.mock("./admin-auth", () => ({
  getAdminEmail: async () => signedIn.email,
  getStaffSession: async () =>
    signedIn.email ? { email: signedIn.email, dashAt: signedIn.dashAt } : null,
  isAdminAuthorized: async () => signedIn.email !== null,
}));

import { DASHBOARD_IDLE_MS } from "./dashboard-lock";
import { dashboardRoute, neverCached, staffRoute } from "./staff-route";

const request = () => new NextRequest("https://example.test/api/admin/thing");
const context = <P>(params: P) => ({ params: Promise.resolve(params) });

beforeEach(() => {
  signedIn.email = null;
  signedIn.dashAt = undefined;
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

  it("marks every answer as never to be cached, whatever the handler set", async () => {
    signedIn.email = "desk@example.com";
    const plain = await staffRoute(async () => Response.json({ rooms: [] }))(
      request(),
      context({})
    );
    expect(plain.headers.get("cache-control")).toBe("no-store");
    expect(await plain.json()).toEqual({ rooms: [] });

    const cacheable = await staffRoute(
      async () =>
        new Response("x", {
          headers: { "Cache-Control": "public, max-age=60" },
        })
    )(request(), context({}));
    expect(cacheable.headers.get("cache-control")).toBe("no-store");
  });

  it("does so for an answer whose headers cannot be changed (a redirect)", async () => {
    signedIn.email = "desk@example.com";
    const res = await staffRoute(async () =>
      Response.redirect("https://example.test/admin/dashboard", 303)
    )(request(), context({}));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(
      "https://example.test/admin/dashboard"
    );
    expect(res.headers.get("cache-control")).toBe("no-store");
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

describe("dashboardRoute", () => {
  it("does not run the handler unless a staff member is signed in", async () => {
    const handler = vi.fn(async () => new Response("secret"));
    const res = await dashboardRoute(handler)(request(), context({}));
    expect(handler).not.toHaveBeenCalled();
    expect(res.status).toBe(401);
  });

  it("runs it while the dashboard was used in the last 30 minutes", async () => {
    signedIn.email = "desk@example.com";
    signedIn.dashAt = Date.now() - 5 * 60_000;
    const route = dashboardRoute<{ id: string }>(
      async (_req, staff, { params }) =>
        Response.json({ by: staff.email, id: (await params).id })
    );
    const res = await route(request(), context({ id: "p-1" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ by: "desk@example.com", id: "p-1" });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("answers 423 Locked, without running it, once that is 30 minutes ago", async () => {
    signedIn.email = "desk@example.com";
    signedIn.dashAt = Date.now() - DASHBOARD_IDLE_MS - 1000;
    const handler = vi.fn(async () => new Response("a patient's name"));
    const res = await dashboardRoute(handler)(request(), context({}));
    expect(handler).not.toHaveBeenCalled();
    expect(res.status).toBe(423);
    expect(await res.json()).toEqual({ error: "Locked" });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("is locked for a sign-in that carries no such moment at all", async () => {
    signedIn.email = "desk@example.com";
    const handler = vi.fn(async () => new Response("x"));
    const res = await dashboardRoute(handler)(request(), context({}));
    expect(handler).not.toHaveBeenCalled();
    expect(res.status).toBe(423);
  });

  it("leaves a plain staff route alone: the rooms board never locks", async () => {
    signedIn.email = "desk@example.com";
    signedIn.dashAt = Date.now() - 5 * 60 * 60_000;
    const res = await staffRoute(async () => Response.json({ rooms: [] }))(
      request(),
      context({})
    );
    expect(res.status).toBe(200);
  });
});

describe("neverCached", () => {
  it("keeps the status, the body and the other headers", async () => {
    const res = neverCached(
      new Response("made up", { status: 201, headers: { "X-Thing": "1" } })
    );
    expect(res.status).toBe(201);
    expect(res.headers.get("x-thing")).toBe("1");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.text()).toBe("made up");
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

// Staff routes that do NOT lock with the dashboard, each for a stated
// reason. Every other handler must be a dashboardRoute: a new route locks
// unless someone decides here that it must not.
const NEVER_LOCKED: Record<string, string> = {
  "rooms/route.ts GET": "the rooms board",
  "rooms/route.ts POST": "the rooms board (edit layout)",
  "rooms/[id]/route.ts PATCH": "the rooms board",
  "rooms/[id]/route.ts DELETE": "the rooms board (edit layout)",
  "rooms/[id]/timer/route.ts POST": "the rooms board",
  "rooms/[id]/doctor-in/route.ts POST": "the rooms board",
  "doctors/route.ts POST": "the rooms board (doctor roster)",
  "doctors/[id]/route.ts DELETE": "the rooms board (doctor roster)",
  "visits/[id]/route.ts POST": "the rooms board",
  "visits/finished/route.ts GET": "the rooms board's Finished list",
  "expected/route.ts GET": "the rooms board's Expected list",
  // By id, from the board's Expected list as well as from the dashboard's
  // search; it answers with no more than the board already shows.
  "checkins/route.ts POST": "staff check-in, also from the rooms board",
  // The browser comes back here from Spotify's consent page, minutes
  // after step 1 (which does lock); it holds no patient information.
  "spotify/callback/route.ts GET": "the way back from Spotify's consent page",
};

describe("every route under /api/admin", () => {
  const files = routeFiles(ADMIN_API);

  it("is found (the check below is not vacuous)", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it.each(files.map((f) => [f.slice(ADMIN_API.length + 1), f]))(
    "%s exports only handlers wrapped in staffRoute or dashboardRoute",
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
        const wrapper = NEVER_LOCKED[`${relative} ${method}`]
          ? "staffRoute"
          : "dashboardRoute";
        expect(
          new RegExp(`export const ${method} = ${wrapper}(?:<[^>]*>)?\\(`).test(
            source
          ),
          `${relative}: ${method} must be \`export const ${method} = ${wrapper}(…)\` — ` +
            "a staff route locks with the dashboard unless it is listed in NEVER_LOCKED"
        ).toBe(true);
      }
      // …and none of them checks the session by itself any more.
      expect(source).not.toMatch(
        /getServerSession|isAdminAuthorized|getAdminEmail/
      );
    }
  );

  it("the routes that never lock are still the ones listed", () => {
    for (const key of Object.keys(NEVER_LOCKED)) {
      const [relative, method] = key.split(" ");
      const source = readFileSync(join(ADMIN_API, relative), "utf8");
      expect(source, key).toMatch(
        new RegExp(`export const ${method} = staffRoute(?:<[^>]*>)?\\(`)
      );
    }
  });

  it("the handlers left open are still the ones listed", () => {
    for (const key of Object.keys(OPEN_ON_PURPOSE)) {
      const [relative, method] = key.split(" ");
      const source = readFileSync(join(ADMIN_API, relative), "utf8");
      expect(source).toMatch(new RegExp(`export async function ${method}\\b`));
    }
  });
});
