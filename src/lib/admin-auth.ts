import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isAllowedAdminEmail } from "@/lib/admin-allowlist";

// The signed-in staff member's email — only if there is a valid Google
// session AND the email is still on the allowlist; otherwise null. For
// routes that also record who did it (see src/lib/audit-server.ts).
export async function getAdminEmail(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  return email && isAllowedAdminEmail(email) ? email.toLowerCase() : null;
}

// Guard for the kiosk API routes: valid Google session AND the email is
// still on the allowlist.
export async function isAdminAuthorized(): Promise<boolean> {
  return (await getAdminEmail()) !== null;
}
