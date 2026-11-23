// The sign-in configuration and the record it keeps (staff_audit_log:
// staff_signin, staff_signout, signin_refused).
//
// The second half runs NextAuth's own request handling — its callback and
// sign-out routes, with this app's real callbacks, events and pages —
// against the in-memory database. Only Google is stood in for: the two
// calls NextAuth would make to Google answer with an account of the
// test's choosing.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Account, AuthOptions, User } from "next-auth";
// Not among the package's public entry points; the route's own entry
// (NextAuth()) needs a running Next.js request around it.
import { AuthHandler } from "../../node_modules/next-auth/core";
import { decode } from "next-auth/jwt";
import GoogleProvider from "next-auth/providers/google";
import { FakeDbOptions, fakeSupabase } from "./testing/fake-supabase";

type Row = Record<string, unknown>;

const state = vi.hoisted(() => ({
  client: null as unknown,
  broken: false,
}));
vi.mock("@/lib/supabase", () => ({
  createServiceClient: () => {
    if (state.broken) throw new Error("no database for desk@example.com");
    return state.client;
  },
}));

import { authOptions } from "./auth";

let log: Row[];
function useDb(options: FakeDbOptions = {}) {
  let nextId = 0;
  const db = fakeSupabase(
    { staff_audit_log: [] },
    {
      onInsert: (_table, row) => {
        row.id = ++nextId;
        row.at = new Date().toISOString();
      },
      ...options,
    }
  );
  state.client = db.client;
  log = db.tables.staff_audit_log as Row[];
}
// Migration 0022 not applied yet: the three new actions are refused by
// the table's check, everything else answers.
const beforeMigration: FakeDbOptions = {
  onQuery: (query) => (query.kind === "insert" ? "23514" : undefined),
};

const SECRET = "made-up-for-this-test-only";
let logged: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.stubEnv("ALLOWED_ADMIN_EMAILS", "desk@example.com, doctor@example.com");
  vi.stubEnv("NEXTAUTH_URL", "http://localhost:3000");
  vi.stubEnv("NEXTAUTH_SECRET", SECRET);
  state.broken = false;
  useDb();
  logged = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const user = (email: string | null): User => ({ id: "g-1", email });
const account = { provider: "google" } as Account;

describe("the signIn callback", () => {
  const signIn = (email: string | null) =>
    authOptions.callbacks!.signIn!({
      user: user(email),
      account,
    } as Parameters<
      NonNullable<AuthOptions["callbacks"]>["signIn"] & object
    >[0]);

  it("lets a staff account through and writes nothing itself", async () => {
    expect(await signIn("Desk@Example.com")).toBe(true);
    expect(log).toEqual([]);
  });

  it("refuses any other account and writes down the address that tried", async () => {
    expect(await signIn("Stranger@Example.com")).toBe(false);
    expect(log).toMatchObject([
      {
        staff_email: "stranger@example.com",
        action: "signin_refused",
        patient_ids: [],
        detail: "Not on the staff list",
      },
    ]);
  });

  it("refuses an account with no address", async () => {
    expect(await signIn(null)).toBe(false);
    expect(log).toMatchObject([{ action: "signin_refused" }]);
  });

  it("refuses just the same when the row cannot be written", async () => {
    useDb(beforeMigration);
    expect(await signIn("stranger@example.com")).toBe(false);
    state.broken = true;
    expect(await signIn("stranger@example.com")).toBe(false);
    expect(log).toEqual([]);
  });

  it("still lets staff through when there is no database at all", async () => {
    state.broken = true;
    expect(await signIn("desk@example.com")).toBe(true);
  });
});

describe("the signIn and signOut events", () => {
  it("a completed sign-in is a row", async () => {
    await authOptions.events!.signIn!({
      user: user("Desk@Example.com"),
      account,
      isNewUser: false,
    });
    expect(log).toMatchObject([
      {
        staff_email: "desk@example.com",
        action: "staff_signin",
        patient_ids: [],
        detail: null,
      },
    ]);
  });

  // NextAuth turns an event that throws into "sign-in failed".
  it("the signIn event never throws, whatever the database does", async () => {
    const event = () =>
      authOptions.events!.signIn!({
        user: user("desk@example.com"),
        account,
        isNewUser: false,
      });
    useDb(beforeMigration);
    await expect(event()).resolves.toBeUndefined();
    state.broken = true;
    await expect(event()).resolves.toBeUndefined();
    state.client = null;
    state.broken = false;
    await expect(event()).resolves.toBeUndefined();
    expect(JSON.stringify(logged.mock.calls)).not.toContain("desk@");
  });

  it("Sign out is a row for the person who was signed in", async () => {
    await authOptions.events!.signOut!({
      token: { email: "desk@example.com", dayEnd: Date.now() + 60_000 },
      session: undefined as never,
    });
    expect(log).toMatchObject([
      { staff_email: "desk@example.com", action: "staff_signout" },
    ]);
  });
});

// ---- through NextAuth itself ----------------------------------------------

// Whoever "Google" says is signing in.
let googleSays: Row = {};

const google = GoogleProvider({ clientId: "made-up", clientSecret: "made-up" });
const options: AuthOptions = {
  ...authOptions,
  // What the route's own entry point does before handing over.
  secret: SECRET,
  providers: [
    {
      ...google,
      // Google's real provider discovers Google's addresses over the
      // network and verifies a signed token. Here the two answers are
      // given directly; the profile → user mapping is still Google's.
      wellKnown: undefined,
      idToken: false,
      checks: ["none"],
      authorization: {
        url: "https://accounts.invalid/auth",
        params: { scope: "openid email profile" },
      },
      token: {
        url: "https://accounts.invalid/token",
        request: async () => ({ tokens: { access_token: "made-up" } }),
      },
      userinfo: {
        url: "https://accounts.invalid/userinfo",
        request: async () => googleSays,
      },
    },
  ],
  logger: { error: () => {}, warn: () => {}, debug: () => {} },
};

const SESSION_COOKIE = "next-auth.session-token";
type Reply = Awaited<ReturnType<typeof AuthHandler>>;
const cookieOf = (reply: Reply, name: string) =>
  reply.cookies?.find((c) => c.name === name);

function request(path: string, init: RequestInit & { cookie?: string } = {}) {
  return AuthHandler({
    req: new Request(`http://localhost:3000/api/auth/${path}`, {
      ...init,
      headers: {
        host: "localhost:3000",
        "content-type": "application/json",
        ...(init.cookie ? { cookie: init.cookie } : {}),
      },
    }),
    options,
  });
}

// The return from Google's consent screen.
function comeBackFromGoogle(email: string) {
  googleSays = { sub: "g-1", name: "Someone", email, email_verified: true };
  return request("callback/google?code=made-up");
}

async function pressSignOut(sessionToken: string | null) {
  const csrf = await request("csrf");
  const csrfCookie = cookieOf(csrf, "next-auth.csrf-token")!;
  const cookies = [`${csrfCookie.name}=${csrfCookie.value}`];
  if (sessionToken) cookies.push(`${SESSION_COOKIE}=${sessionToken}`);
  return request("signout", {
    method: "POST",
    cookie: cookies.join("; "),
    body: JSON.stringify({
      csrfToken: (csrf.body as unknown as { csrfToken: string }).csrfToken,
    }),
  });
}

describe("through NextAuth: signing in", () => {
  it("a staff account gets its session, and a 'Signed in' row", async () => {
    const reply = await comeBackFromGoogle("Desk@Example.com");
    const session = cookieOf(reply, SESSION_COOKIE);
    expect(session?.value).toBeTruthy();
    expect(reply.redirect).toBe("http://localhost:3000");
    expect(log).toMatchObject([
      {
        staff_email: "desk@example.com",
        action: "staff_signin",
        patient_ids: [],
        detail: null,
      },
    ]);
    // The day's end is still stamped into the token.
    const token = await decode({ token: session!.value, secret: SECRET });
    expect(token?.email).toBe("desk@example.com");
    expect(typeof token?.dayEnd).toBe("number");
  });

  it("any other account is turned away, with a 'Sign-in refused' row", async () => {
    const reply = await comeBackFromGoogle("Stranger@Example.com");
    expect(cookieOf(reply, SESSION_COOKIE)).toBeUndefined();
    // (NextAuth's own address, which sends the browser on to the login
    // page.)
    expect(reply.redirect).toBe(
      "http://localhost:3000/api/auth/error?error=AccessDenied"
    );
    expect(log).toMatchObject([
      {
        staff_email: "stranger@example.com",
        action: "signin_refused",
        detail: "Not on the staff list",
      },
    ]);
  });

  it("the same stranger trying again is still one row; staff are untouched", async () => {
    for (let i = 0; i < 5; i++) {
      const reply = await comeBackFromGoogle("stranger@example.com");
      expect(cookieOf(reply, SESSION_COOKIE)).toBeUndefined();
    }
    await comeBackFromGoogle("desk@example.com");
    expect(log.map((r) => r.action)).toEqual([
      "signin_refused",
      "staff_signin",
    ]);
  });

  it("before migration 0022 a staff member signs in as always; one line is logged", async () => {
    useDb(beforeMigration);
    const reply = await comeBackFromGoogle("desk@example.com");
    expect(cookieOf(reply, SESSION_COOKIE)?.value).toBeTruthy();
    expect(reply.redirect).toBe("http://localhost:3000");
    expect(log).toEqual([]);
    expect(logged).toHaveBeenCalledTimes(1);
    expect(logged.mock.calls[0]).toEqual([
      "audit log write failed:",
      "staff_signin",
      "Error code=23514",
    ]);
  });

  it("before migration 0022 a stranger is still refused; one line is logged", async () => {
    useDb(beforeMigration);
    const reply = await comeBackFromGoogle("stranger@example.com");
    expect(cookieOf(reply, SESSION_COOKIE)).toBeUndefined();
    expect(reply.redirect).toContain("error=AccessDenied");
    expect(logged.mock.calls).toEqual([
      ["audit log write failed:", "signin_refused", "Error code=23514"],
    ]);
  });

  it("with no database at all a staff member still signs in, a stranger still does not", async () => {
    state.broken = true;
    const staff = await comeBackFromGoogle("desk@example.com");
    expect(cookieOf(staff, SESSION_COOKIE)?.value).toBeTruthy();
    expect(staff.redirect).toBe("http://localhost:3000");
    const stranger = await comeBackFromGoogle("stranger@example.com");
    expect(cookieOf(stranger, SESSION_COOKIE)).toBeUndefined();
    expect(stranger.redirect).toContain("error=AccessDenied");
    // What was logged names the kind of failure, never the address.
    expect(JSON.stringify(logged.mock.calls)).not.toContain("@example.com");
  });
});

describe("through NextAuth: Sign out", () => {
  const signedIn = async () =>
    cookieOf(await comeBackFromGoogle("desk@example.com"), SESSION_COOKIE)!
      .value;

  it("pressing Sign out clears the session and writes 'Signed out'", async () => {
    const reply = await pressSignOut(await signedIn());
    expect(cookieOf(reply, SESSION_COOKIE)?.value).toBe("");
    expect(log.map((r) => [r.staff_email, r.action])).toEqual([
      ["desk@example.com", "staff_signin"],
      ["desk@example.com", "staff_signout"],
    ]);
  });

  it("a sign-out request without the page's token does nothing", async () => {
    const session = await signedIn();
    const reply = await request("signout", {
      method: "POST",
      cookie: `${SESSION_COOKIE}=${session}`,
      body: JSON.stringify({ csrfToken: "guessed" }),
    });
    expect(reply.redirect).toContain("/signout?csrf=true");
    expect(log.map((r) => r.action)).toEqual(["staff_signin"]);
  });

  it("signing out when nobody is signed in writes nothing", async () => {
    await pressSignOut(null);
    await pressSignOut("not-a-session");
    expect(log).toEqual([]);
  });

  it("a sign-in that already ended at 3 am is not a sign-out", async () => {
    const session = await signedIn();
    // The same browser, the moment the clinic's 3 am has come. (The
    // cookie itself is good for 24 hours, so NextAuth still reads it.)
    const token = await decode({ token: session, secret: SECRET });
    vi.spyOn(Date, "now").mockReturnValue(token!.dayEnd as number);
    const reply = await pressSignOut(session);
    expect(cookieOf(reply, SESSION_COOKIE)?.value).toBe("");
    expect(log.map((r) => r.action)).toEqual(["staff_signin"]);
  });

  it("someone taken off the staff list since is not written as staff", async () => {
    const session = await signedIn();
    vi.stubEnv("ALLOWED_ADMIN_EMAILS", "doctor@example.com");
    await pressSignOut(session);
    expect(log.map((r) => r.action)).toEqual(["staff_signin"]);
  });

  it("before migration 0022 Sign out works; one more line is logged", async () => {
    useDb(beforeMigration);
    const reply = await pressSignOut(await signedIn());
    expect(cookieOf(reply, SESSION_COOKIE)?.value).toBe("");
    expect(logged.mock.calls).toEqual([
      ["audit log write failed:", "staff_signin", "Error code=23514"],
      ["audit log write failed:", "staff_signout", "Error code=23514"],
    ]);
  });
});
