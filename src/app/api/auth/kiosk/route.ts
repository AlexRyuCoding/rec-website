import { NextResponse } from "next/server";

async function makeToken(): Promise<string> {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest(
    "SHA-256",
    enc.encode(process.env.ADMIN_KIOSK_PASSWORD!)
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function POST(req: Request) {
  const { password } = await req.json();

  if (!password || password !== process.env.ADMIN_KIOSK_PASSWORD) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  const token = await makeToken();
  const response = NextResponse.json({ success: true });
  response.cookies.set("kiosk_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 60 * 60 * 24, // 24 hours
    path: "/",
  });
  return response;
}
