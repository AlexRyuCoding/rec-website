// Who may use the check-in kiosk's routes (PIN lookup, PIN setup, today's
// appointment, check-in).
//
// The kiosk is a tablet left with patients all day. It used to work on a
// staff member's Google sign-in, which made it a signed-in staff browser
// in a waiting room: the dashboard — patient search, PIN resets — was an
// address away. Now the tablet is paired once as a device, like the
// waiting-room TV (display-auth.ts): its cookie opens the kiosk's routes
// and nothing else, lasts until staff revoke it, and needs no sign-in.
//
// A staff session still opens the kiosk's routes too, so a tablet that
// has not been paired yet keeps working the old way, and staff can try
// the kiosk on their own computer.

import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isAdminAuthorized } from "./admin-auth";
import { carriesKioskCookie, KIOSK_COOKIE } from "./device-cookie";
import { authorizeDisplay } from "./display-server";
import { KioskAccess, resolveKioskAccess } from "./kiosk-access";
import { createServiceClient } from "./supabase";

export async function kioskAccess(
  supabase: SupabaseClient = createServiceClient()
): Promise<KioskAccess> {
  const cookieValue = (await cookies()).get(KIOSK_COOKIE)?.value;
  if (carriesKioskCookie(cookieValue)) {
    return resolveKioskAccess(
      await authorizeDisplay(supabase, cookieValue, Date.now(), "kiosk"),
      false
    );
  }
  return resolveKioskAccess(null, await isAdminAuthorized());
}

export type { KioskAccess };

// Guard for the kiosk's own API routes.
export async function isKioskAuthorized(): Promise<boolean> {
  const access = await kioskAccess();
  return access.status === "paired" || access.status === "staff";
}
