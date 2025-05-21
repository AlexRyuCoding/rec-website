import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";

export default NextAuth({
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      // Only allow specific email(s)
      const allowedEmails = [
        "ryuacupuncture@gmail.com",
        "alexhryu@gmail.com",
        "jryu.acu@gmail.com",
        "info@acuglowellness.com",
      ];
      return allowedEmails.includes(user.email!);
    },
    async session({ session, token }) {
      // Pass email to session
      return session;
    },
  },
});
