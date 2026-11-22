// The front door of every staff API route (/api/admin/*).
//
// A staff route used to open with its own copy of the sign-in check. Any
// one of them could get it subtly wrong — three once read the session by
// themselves and so skipped the "sign-in ends at 3 am" rule. Now a route
// is written as
//
//   export const POST = staffRoute(async (req, staff) => { … });
//
// and cannot run at all unless a staff member is signed in: Google
// session, still on the allowlist, sign-in not from an earlier day, and
// not a kiosk tablet (all of that is getAdminEmail, admin-auth.ts).
// staff-route.test.ts fails if a file under /api/admin exports a handler
// that is not wrapped.

import { NextRequest, NextResponse } from "next/server";
import { getAdminEmail } from "./admin-auth";

// The signed-in staff member, for routes that record who did it.
export interface Staff {
  email: string;
}

interface RouteContext<Params> {
  params: Promise<Params>;
}

type StaffHandler<Params> = (
  req: NextRequest,
  staff: Staff,
  context: RouteContext<Params>
) => Promise<Response> | Response;

// What everyone else gets. Never cached: whether this browser is staff
// can change from one request to the next.
export function unauthorized(): Response {
  return NextResponse.json(
    { error: "Unauthorized" },
    { status: 401, headers: { "Cache-Control": "no-store" } }
  );
}

export function staffRoute<Params = Record<string, never>>(
  handler: StaffHandler<Params>,
  options: {
    // For the two routes a browser navigates to (the Spotify connect
    // flow): send the person to the login page instead of showing JSON.
    whenNotStaff?: (req: NextRequest) => Response;
  } = {}
) {
  return async (
    req: NextRequest,
    context: RouteContext<Params>
  ): Promise<Response> => {
    const email = await getAdminEmail();
    if (!email) return options.whenNotStaff?.(req) ?? unauthorized();
    return handler(req, { email }, context);
  };
}
