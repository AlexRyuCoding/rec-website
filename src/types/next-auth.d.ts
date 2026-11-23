import "next-auth";
import "next-auth/jwt";

// dayEnd: when this sign-in stops working (epoch ms) — the clinic's next
// 3 am after signing in. See src/lib/staff-session.ts.
// dashAt: when the staff dashboard was last really used (epoch ms). See
// src/lib/dashboard-lock.ts.
declare module "next-auth" {
  interface Session {
    dayEnd?: number;
    dashAt?: number;
    // Whether the dashboard is locked, as the SERVER's clock has it. The
    // page asks this, never its own clock: a computer whose clock is off
    // must not lock a dashboard that was just opened.
    dashLocked?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    dayEnd?: number;
    dashAt?: number;
  }
}
