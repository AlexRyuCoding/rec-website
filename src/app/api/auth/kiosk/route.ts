import { NextResponse } from "next/server";

async function deriveToken(password: string): Promise<string> {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(password));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function POST(req: Request) {
  const kioskPassword = process.env.ADMIN_KIOSK_PASSWORD;
  if (!kioskPassword) {
    return NextResponse.json(
      { error: "Server misconfiguration" },
      { status: 500 }
    );
  }

  const { password } = await req.json();
  if (!password) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  const [submittedToken, expectedToken] = await Promise.all([
    deriveToken(password),
    deriveToken(kioskPassword),
  ]);

  if (submittedToken !== expectedToken) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  const token = expectedToken;
  const response = NextResponse.json({ success: true });
  response.cookies.set("kiosk_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 60 * 60 * 24,
    path: "/",
  });
  return response;
}
