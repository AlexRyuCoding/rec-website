import "next-auth";
import "next-auth/jwt";

// dayEnd: when this sign-in stops working (epoch ms) — the clinic's next
// 3 am after signing in. See src/lib/staff-session.ts.
declare module "next-auth" {
  interface Session {
    dayEnd?: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    dayEnd?: number;
  }
}
