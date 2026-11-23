// The front door of the check-in kiosk's API routes: PIN sign-in, PIN
// setup, today's appointment, check-in. The same idea as staffRoute
// (staff-route.ts), for a different caller:
//
//   export const POST = kioskRoute(async (req) => { … });
//
// runs only for a paired kiosk tablet, or a signed-in staff member
// (isKioskAuthorized, kiosk-auth-server.ts). kiosk-route.test.ts lists
// the kiosk's routes and fails if one of them is not wrapped.

import { NextRequest } from "next/server";
import { isKioskAuthorized } from "./kiosk-auth-server";
import { neverCached, unauthorized } from "./staff-route";

type KioskHandler = (req: NextRequest) => Promise<Response> | Response;

export function kioskRoute(handler: KioskHandler) {
  return async (req: NextRequest): Promise<Response> => {
    if (!(await isKioskAuthorized())) return unauthorized();
    return neverCached(await handler(req));
  };
}
