import { cookies } from "next/headers";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isAllowedAdminEmail } from "@/lib/admin-allowlist";
import { carriesKioskCookie, KIOSK_COOKIE } from "@/lib/device-cookie";
import { sessionDayOver } from "@/lib/staff-session";

// The signed-in staff member's email — only if there is a valid Google
// session, the sign-in's day has not ended (staff-session.ts) AND the
// email is still on the allowlist; otherwise null. For routes that also
// record who did it (see src/lib/audit-server.ts).
//
// Every staff route must come through here (or isAdminAuthorized below):
// a route that reads the session by itself would skip the day's-end and
// allowlist checks.
//
// A browser that carries a kiosk cookie is never staff, whatever session
// it also holds: the kiosk tablet sits with patients, and a Google
// sign-in left on it (from before it was paired, or made on it since)
// must not turn it back into a staff browser. Revoking the kiosk in
// Dashboard → Screens is what frees the tablet again.
export async function getAdminEmail(): Promise<string | null> {
  if (carriesKioskCookie((await cookies()).get(KIOSK_COOKIE)?.value)) {
    return null;
  }
  const session = await getServerSession(authOptions);
  if (!session || sessionDayOver(session.dayEnd, Date.now())) return null;
  const email = session.user?.email;
  return email && isAllowedAdminEmail(email) ? email.toLowerCase() : null;
}

// Guard for the kiosk API routes: valid Google session AND the email is
// still on the allowlist.
export async function isAdminAuthorized(): Promise<boolean> {
  return (await getAdminEmail()) !== null;
}
