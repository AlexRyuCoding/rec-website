import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { isAllowedAdminEmail } from "@/lib/admin-allowlist";
import { LOGIN_PATH, loginPathFor, sessionDayOver } from "@/lib/staff-session";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === LOGIN_PATH) return NextResponse.next();

  const token = await getToken({ req: request });
  const email = typeof token?.email === "string" ? token.email : null;

  // Not signed in, off the allowlist, or signed in on an earlier day:
  // to the login page, which leads back here afterwards.
  if (
    !isAllowedAdminEmail(email) ||
    sessionDayOver(token?.dayEnd, Date.now())
  ) {
    return NextResponse.redirect(
      new URL(loginPathFor(pathname + request.nextUrl.search), request.url)
    );
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
