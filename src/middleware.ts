import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { isAllowedAdminEmail } from "@/lib/admin-allowlist";
import { adminPageGate } from "@/lib/admin-gate";
import { carriesKioskCookie, KIOSK_COOKIE } from "@/lib/device-cookie";

// Staff pages. The rules are in src/lib/admin-gate.ts (pure, tested).
export async function middleware(request: NextRequest) {
  const token = await getToken({ req: request });
  const email = typeof token?.email === "string" ? token.email : null;

  const decision = adminPageGate({
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.search,
    kiosk: carriesKioskCookie(request.cookies.get(KIOSK_COOKIE)?.value),
    staff: isAllowedAdminEmail(email),
    dayEnd: token?.dayEnd,
    nowMs: Date.now(),
  });
  if (!decision.allow) {
    return NextResponse.redirect(new URL(decision.redirect, request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
