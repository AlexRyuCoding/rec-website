import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { isAllowedAdminEmail } from "@/lib/admin-allowlist";
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
    async signIn({ user }) {
      return isAllowedAdminEmail(user.email);
    },
    // `account` is only present at the moment of signing in: that is when
    // the day's end is stamped into the token. It is checked wherever the
    // allowlist is — middleware.ts and admin-auth.ts.
    async jwt({ token, account }) {
      if (account) token.dayEnd = sessionDayEnd(Date.now());
      return token;
    },
    async session({ session, token }) {
      if (typeof token.dayEnd === "number") session.dayEnd = token.dayEnd;
      return session;
    },
  },
  pages: {
    signIn: "/admin/login",
    error: "/admin/login",
  },
};
