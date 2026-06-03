import { NextRequest, NextResponse } from "next/server";

async function deriveToken(password: string): Promise<string> {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(password));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/admin/login") return NextResponse.next();

  const kioskPassword = process.env.ADMIN_KIOSK_PASSWORD;
  if (!kioskPassword) {
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }

  const session = request.cookies.get("kiosk_session");
  const token = await deriveToken(kioskPassword);

  if (session?.value !== token) {
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
