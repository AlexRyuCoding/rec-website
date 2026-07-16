import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isAllowedAdminEmail } from "@/lib/admin-allowlist";

// Guard for the kiosk API routes: valid Google session AND the email is
// still on the allowlist.
export async function isAdminAuthorized(): Promise<boolean> {
  const session = await getServerSession(authOptions);
  return isAllowedAdminEmail(session?.user?.email);
}
