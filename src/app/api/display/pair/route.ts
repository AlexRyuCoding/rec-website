import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { getClientIp } from "@/lib/validation";
import { DISPLAY_COOKIE } from "@/lib/display-auth";
import { displayCookieOptions } from "@/lib/display-server";
import { requestPairing } from "@/lib/pairing-server";

// Step 1 of pairing a waiting-room screen: the screen asks for a code to
// show. Public by necessity (the TV has no credentials yet); the rules —
// grants nothing until staff approve, rate limited per IP, fails closed —
// are in src/lib/pairing-server.ts.
export async function POST(req: NextRequest) {
  const reply = await requestPairing(
    createServiceClient(),
    "tv",
    req.cookies.get(DISPLAY_COOKIE)?.value,
    getClientIp(req),
    Date.now()
  );

  switch (reply.status) {
    case "paired":
      return NextResponse.json({ paired: true });
    case "pending":
      return NextResponse.json({ code: reply.code });
    case "limited":
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    case "error":
      return NextResponse.json(
        { error: "Database error" },
        { status: reply.reason === "unknown" ? 503 : 500 }
      );
    case "created": {
      const res = NextResponse.json({ code: reply.code });
      res.cookies.set({ ...displayCookieOptions, value: reply.cookie });
      return res;
    }
  }
}
