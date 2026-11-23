// Where the two Spotify routes send the browser. On Cloud Run a route's
// own `req.url` is the address the server listens on (0.0.0.0:8080), so a
// redirect built from it goes nowhere: every redirect here must be on the
// site's public address (NEXTAUTH_URL).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const staff = vi.hoisted(() => ({
  email: null as string | null,
  // When the dashboard was last used; set fresh in the tests that sign in.
  dashAt: undefined as number | undefined,
}));
vi.mock("@/lib/admin-auth", () => ({
  getAdminEmail: async () => staff.email,
  getStaffSession: async () =>
    staff.email ? { email: staff.email, dashAt: staff.dashAt } : null,
  isAdminAuthorized: async () => staff.email !== null,
}));

import { GET as login } from "./login/route";
import { GET as callback } from "./callback/route";

const SITE = "https://www.example.test";
const context = { params: Promise.resolve({}) };
// As the request reaches a route behind Google's load balancer.
const request = (path: string) => new NextRequest(`http://0.0.0.0:8080${path}`);
const location = (res: Response) => res.headers.get("location");

beforeEach(() => {
  staff.email = null;
  staff.dashAt = Date.now();
  vi.stubEnv("NEXTAUTH_URL", SITE);
  vi.stubEnv("SPOTIFY_CLIENT_ID", "");
  vi.stubEnv("SPOTIFY_CLIENT_SECRET", "");
});
afterEach(() => vi.unstubAllEnvs());

describe("Spotify connect: someone who is not signed in", () => {
  it("is sent from step 1 to the login page on the site's address", async () => {
    const res = await login(request("/api/admin/spotify/login"), context);
    expect(res.status).toBe(307);
    expect(location(res)).toBe(`${SITE}/admin/login`);
  });

  it("is sent from step 2 to the login page on the site's address", async () => {
    const res = await callback(
      request("/api/admin/spotify/callback?code=x&state=y"),
      context
    );
    expect(location(res)).toBe(`${SITE}/admin/login`);
  });
});

describe("Spotify connect: a signed-in staff member", () => {
  beforeEach(() => {
    staff.email = "desk@example.com";
  });

  it("comes back to the dashboard on the site's address when Spotify is not set up", async () => {
    const one = await login(request("/api/admin/spotify/login"), context);
    expect(location(one)).toBe(
      `${SITE}/admin/dashboard?spotify=not-configured#music`
    );
    const two = await callback(
      request("/api/admin/spotify/callback?code=x&state=y"),
      context
    );
    expect(location(two)).toBe(
      `${SITE}/admin/dashboard?spotify=not-configured#music`
    );
  });

  it("comes back to the dashboard on the site's address when the answer does not match", async () => {
    vi.stubEnv("SPOTIFY_CLIENT_ID", "made-up-id");
    vi.stubEnv("SPOTIFY_CLIENT_SECRET", "made-up-secret");
    vi.stubEnv("NEXTAUTH_SECRET", "made-up-for-this-test");
    // No state cookie: pressed Cancel at Spotify, or a forged link.
    const res = await callback(
      request("/api/admin/spotify/callback?code=x&state=y"),
      context
    );
    expect(location(res)).toBe(`${SITE}/admin/dashboard?spotify=failed#music`);
  });

  it("is sent to Spotify itself, with the site's address to come back to", async () => {
    vi.stubEnv("SPOTIFY_CLIENT_ID", "made-up-id");
    vi.stubEnv("SPOTIFY_CLIENT_SECRET", "made-up-secret");
    vi.stubEnv("NEXTAUTH_SECRET", "made-up-for-this-test");
    const res = await login(request("/api/admin/spotify/login"), context);
    const to = new URL(location(res)!);
    expect(to.host).not.toContain("0.0.0.0");
    expect(to.searchParams.get("redirect_uri")).toBe(
      `${SITE}/api/admin/spotify/callback`
    );
  });
});

describe("Spotify connect: signed in, but the dashboard has locked", () => {
  it("step 1 goes back to the dashboard (its lock screen), not on to Spotify", async () => {
    staff.email = "desk@example.com";
    staff.dashAt = Date.now() - 45 * 60_000;
    vi.stubEnv("SPOTIFY_CLIENT_ID", "made-up-id");
    vi.stubEnv("SPOTIFY_CLIENT_SECRET", "made-up-secret");
    const res = await login(request("/api/admin/spotify/login"), context);
    expect(res.status).toBe(307);
    expect(location(res)).toBe(`${SITE}/admin/dashboard?tab=setup`);
    expect(res.headers.get("set-cookie")).toBeNull();
  });
});
