import { NextRequest, NextResponse } from "next/server";

async function expectedToken(): Promise<string> {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest(
    "SHA-256",
    enc.encode(process.env.ADMIN_KIOSK_PASSWORD!)
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/admin/login") return NextResponse.next();

  const session = request.cookies.get("kiosk_session");
  const token = await expectedToken();

  if (session?.value !== token) {
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
