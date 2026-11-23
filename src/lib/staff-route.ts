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
// that is not wrapped. The wrapper also marks every answer "no-store".

import { NextRequest, NextResponse } from "next/server";
import { getAdminEmail, getStaffSession } from "./admin-auth";
import { dashboardLocked } from "./dashboard-lock";

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

// Every answer of a staff or kiosk route is marked never to be cached: it
// is about patients, or about who may see them, and must not be kept by a
// browser or by anything between it and the server. The wrappers do this
// so that no single route can forget. (A redirect's headers are fixed
// once it is made, hence the copy.)
export function neverCached(res: Response): Response {
  if (res.headers.get("cache-control") === "no-store") return res;
  try {
    res.headers.set("Cache-Control", "no-store");
    return res;
  } catch {
    const headers = new Headers(res.headers);
    headers.set("Cache-Control", "no-store");
    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers,
    });
  }
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
    return neverCached(await handler(req, { email }, context));
  };
}

// What a dashboard-only route answers once the dashboard has locked: the
// person is still signed in (the rooms board goes on working), but this
// needs them to sign in again. The page shows its lock screen on a 423.
export function locked(): Response {
  return NextResponse.json(
    { error: "Locked" },
    { status: 423, headers: { "Cache-Control": "no-store" } }
  );
}

// staffRoute for what only the dashboard uses — patient search, the
// check-in history, the audit log, PIN resets, pairing, settings. It also
// refuses (423) when the dashboard has not been used for 30 minutes
// (dashboard-lock.ts). staff-route.test.ts makes this the rule: a route
// under /api/admin must be a dashboardRoute unless it is listed there as
// one the rooms board needs.
export function dashboardRoute<Params = Record<string, never>>(
  handler: StaffHandler<Params>,
  options: {
    // For a route a browser navigates to (connecting Spotify): where to
    // send the person instead of answering JSON.
    whenNotStaff?: (req: NextRequest) => Response;
    whenLocked?: (req: NextRequest) => Response;
  } = {}
) {
  return async (
    req: NextRequest,
    context: RouteContext<Params>
  ): Promise<Response> => {
    const staff = await getStaffSession();
    if (!staff) return options.whenNotStaff?.(req) ?? unauthorized();
    if (dashboardLocked(staff.dashAt, Date.now())) {
      return neverCached(options.whenLocked?.(req) ?? locked());
    }
    return neverCached(await handler(req, { email: staff.email }, context));
  };
}
