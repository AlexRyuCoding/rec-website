import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isAllowedAdminEmail } from "@/lib/admin-allowlist";
import { sessionDayOver } from "@/lib/staff-session";

// The signed-in staff member's email — only if there is a valid Google
// session, the sign-in's day has not ended (staff-session.ts) AND the
// email is still on the allowlist; otherwise null. For routes that also
// record who did it (see src/lib/audit-server.ts).
//
// Every staff route must come through here (or isAdminAuthorized below):
// a route that reads the session by itself would skip the day's-end and
// allowlist checks.
export async function getAdminEmail(): Promise<string | null> {
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
