import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isAdminAuthorized } from "./admin-auth";
import { DISPLAY_COOKIE } from "./display-auth";
import { authorizeDisplay } from "./display-server";

// For the waiting-room screen's secondary requests (music): a paired
// screen or a signed-in staff member, yes or no. Pairing itself — showing
// a code, re-pairing after a revoke — is driven only by
// /api/display/calls; these routes just refuse anyone else.
export async function isScreenAuthorized(
  req: NextRequest,
  supabase: SupabaseClient
): Promise<boolean> {
  if (await isAdminAuthorized()) return true;
  const auth = await authorizeDisplay(
    supabase,
    req.cookies.get(DISPLAY_COOKIE)?.value,
    Date.now()
  );
  return auth.status === "ok";
}
