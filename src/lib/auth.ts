import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { isAllowedAdminEmail } from "@/lib/admin-allowlist";
import { dashboardLocked, renewDashboardActivity } from "@/lib/dashboard-lock";
import {
  recordSignIn,
  recordSignInRefused,
  recordSignOut,
} from "@/lib/signin-log";
import { sessionDayEnd } from "@/lib/staff-session";

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
  ],
  // JWT session: staff sign in once at the start of the day. It ends at
  // the clinic's next 3 am (dayEnd, below) — never in the middle of the
  // clinic day, which is where "24 hours after signing in" used to land.
  // The 24 h maxAge stays as the outer limit on the cookie itself.
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 },
  callbacks: {
    // Only the staff list signs in. Any other Google account is refused,
    // and the address that tried is written to the staff audit log
    // (bounded — see recordSignInRefused). Writing never changes the
    // answer: it cannot throw, and NextAuth gets its `false` either way.
    async signIn({ user }) {
      if (isAllowedAdminEmail(user.email)) return true;
      await recordSignInRefused(user.email, Date.now());
      return false;
    },
    // `account` is only present at the moment of signing in: that is when
    // the day's end is stamped into the token. It is checked wherever the
    // allowlist is — middleware.ts and admin-auth.ts.
    //
    // The same moment opens the dashboard (dashAt, dashboard-lock.ts).
    // After that only the dashboard page moves it forward, by asking for
    // a session update while a person is using it — and a moment that
    // has already run out is left as it is: a locked dashboard cannot
    // unlock itself, only signing in again does.
    async jwt({ token, account, trigger, session }) {
      const now = Date.now();
      if (account) {
        token.dayEnd = sessionDayEnd(now);
        token.dashAt = now;
      } else if (
        trigger === "update" &&
        (session as { dashboardActive?: unknown } | undefined)
          ?.dashboardActive === true
      ) {
        token.dashAt = renewDashboardActivity(token.dashAt, now);
      }
      return token;
    },
    async session({ session, token }) {
      if (typeof token.dayEnd === "number") session.dayEnd = token.dayEnd;
      if (typeof token.dashAt === "number") session.dashAt = token.dashAt;
      // Said by the server, on the server's clock (dashAt was stamped by
      // it too). The page must not work this out with the computer's own
      // clock: one that runs a minute slow would find every fresh sign-in
      // "in the future" and lock the dashboard for good.
      session.dashLocked = dashboardLocked(token.dashAt, Date.now());
      return session;
    },
  },
  // The record of sign-ins (staff_audit_log, through signin-log.ts).
  // NextAuth runs `signIn` once an allowed account's session has been
  // made, and `signOut` when its sign-out route is called with the page's
  // own token — the dashboard's Sign out button. A sign-in that simply
  // ends at 3 am passes through neither. Both functions always resolve:
  // an event that throws makes NextAuth report the sign-in as failed.
  events: {
    async signIn({ user }) {
      await recordSignIn(user.email);
    },
    async signOut({ token }) {
      await recordSignOut(token, Date.now());
    },
  },
  pages: {
    signIn: "/admin/login",
    error: "/admin/login",
  },
};
