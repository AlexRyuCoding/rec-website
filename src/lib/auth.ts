import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { isAllowedAdminEmail } from "@/lib/admin-allowlist";

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
  ],
  // JWT session, 24h: staff unlock the kiosk once at the start of the day
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 },
  callbacks: {
    async signIn({ user }) {
      return isAllowedAdminEmail(user.email);
    },
  },
  pages: {
    signIn: "/admin/login",
    error: "/admin/login",
  },
};
