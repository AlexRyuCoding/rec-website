import { describe, expect, it, vi } from "vitest";
import type { Account, Session } from "next-auth";
import type { JWT } from "next-auth/jwt";
import { authOptions } from "./auth";
import { DASHBOARD_IDLE_MS } from "./dashboard-lock";

// The sign-in's two callbacks, as NextAuth calls them: what happens to the
// "dashboard last used" moment (dashAt) at sign-in, on a session update
// from the dashboard page, and on every other request.

type JwtArgs = Parameters<
  NonNullable<typeof authOptions.callbacks>["jwt"] & object
>[0];
const jwt = (args: Partial<JwtArgs> & { token: JWT }) =>
  authOptions.callbacks!.jwt!({
    user: { id: "u", email: "desk@example.com" },
    account: null,
    ...args,
  } as JwtArgs);

const account = { provider: "google", type: "oauth" } as Account;
const MIN = 60_000;

describe("the sign-in's dashboard moment", () => {
  it("is set at sign-in", async () => {
    const before = Date.now();
    const token = await jwt({ token: {}, account });
    expect(token.dashAt).toBeGreaterThanOrEqual(before);
    expect(token.dashAt).toBeLessThanOrEqual(Date.now());
    expect(typeof token.dayEnd).toBe("number");
  });

  it("is left alone by an ordinary request", async () => {
    const dashAt = Date.now() - 10 * MIN;
    const token = await jwt({ token: { dashAt, dayEnd: 1 } });
    expect(token.dashAt).toBe(dashAt);
  });

  it("moves forward when the dashboard page says somebody is using it", async () => {
    const dashAt = Date.now() - 10 * MIN;
    const before = Date.now();
    const token = await jwt({
      token: { dashAt },
      trigger: "update",
      session: { dashboardActive: true },
    });
    expect(token.dashAt).toBeGreaterThanOrEqual(before);
  });

  it("does not move once it has locked — the page cannot unlock itself", async () => {
    const dashAt = Date.now() - DASHBOARD_IDLE_MS - 1000;
    const token = await jwt({
      token: { dashAt },
      trigger: "update",
      session: { dashboardActive: true },
    });
    expect(token.dashAt).toBe(dashAt);
  });

  it("is not set by an update for a sign-in that never had one", async () => {
    const token = await jwt({
      token: {},
      trigger: "update",
      session: { dashboardActive: true },
    });
    expect(token.dashAt).toBeUndefined();
  });

  it("ignores an update that says anything else, or tries to set it", async () => {
    const dashAt = Date.now() - 10 * MIN;
    for (const session of [
      undefined,
      {},
      { dashboardActive: "yes" },
      { dashAt: Date.now() + 5 * MIN },
      { dayEnd: Date.now() + 99 * 24 * 60 * MIN },
    ]) {
      const token = await jwt({
        token: { dashAt, dayEnd: 7 },
        trigger: "update",
        session,
      });
      expect(token.dashAt).toBe(dashAt);
      expect(token.dayEnd).toBe(7);
    }
  });

  it("an update never extends the day: dayEnd is only stamped at sign-in", async () => {
    const token = await jwt({
      token: { dashAt: Date.now(), dayEnd: 123 },
      trigger: "update",
      session: { dashboardActive: true },
    });
    expect(token.dayEnd).toBe(123);
  });

  it("is handed to the page with the session", async () => {
    vi.useFakeTimers();
    const session = await authOptions.callbacks!.session!({
      session: { user: { email: "desk@example.com" }, expires: "" } as Session,
      token: { dashAt: 1_800_000_000_000, dayEnd: 1_800_000_100_000 },
    } as Parameters<
      NonNullable<NonNullable<typeof authOptions.callbacks>["session"]>
    >[0]);
    vi.useRealTimers();
    expect((session as Session).dashAt).toBe(1_800_000_000_000);
    expect((session as Session).dayEnd).toBe(1_800_000_100_000);
  });
});
