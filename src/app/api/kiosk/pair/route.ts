import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { getClientIp } from "@/lib/validation";
import { DEVICES, KIOSK_COOKIE, parseDisplayCookie } from "@/lib/display-auth";
import { authorizeDisplay, deviceCookieOptions } from "@/lib/display-server";
import { requestPairing } from "@/lib/pairing-server";

const noStore = { "Cache-Control": "no-store" };

// Step 1 of pairing a check-in kiosk: the tablet asks for a code to show.
// Public by necessity (the tablet has no credentials yet); the rules —
// grants nothing until staff approve the code in Dashboard → Screens,
// rate limited per IP, fails closed — are in src/lib/pairing-server.ts.
//
// Only ever called when someone taps "Show pairing code" on the kiosk's
// set-up screen, never by the page on its own: the cookie this sets marks
// the browser as a kiosk, and a kiosk is never staff.
export async function POST(req: NextRequest) {
  const reply = await requestPairing(
    createServiceClient(),
    "kiosk",
    req.cookies.get(KIOSK_COOKIE)?.value,
    getClientIp(req),
    Date.now()
  );

  switch (reply.status) {
    case "paired":
      return NextResponse.json({ paired: true }, { headers: noStore });
    case "pending":
      return NextResponse.json({ code: reply.code }, { headers: noStore });
    case "limited":
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: noStore }
      );
    case "error":
      return NextResponse.json(
        { error: "Database error" },
        { status: reply.reason === "unknown" ? 503 : 500, headers: noStore }
      );
    case "created": {
      const res = NextResponse.json({ code: reply.code }, { headers: noStore });
      res.cookies.set({ ...deviceCookieOptions("kiosk"), value: reply.cookie });
      return res;
    }
  }
}

// "Cancel" on the pairing-code screen: forget the code, so this browser
// is an ordinary one again (and can reach the staff login).
//
// An APPROVED kiosk is refused: its cookie is what keeps the tablet from
// ever being treated as staff, so nothing the tablet itself can send may
// remove it. Staff end a pairing in Dashboard → Screens.
export async function DELETE(req: NextRequest) {
  const cookieValue = req.cookies.get(KIOSK_COOKIE)?.value;
  const supabase = createServiceClient();
  const auth = await authorizeDisplay(
    supabase,
    cookieValue,
    Date.now(),
    "kiosk"
  );
  if (auth.status === "ok") {
    return NextResponse.json(
      { error: "This kiosk is paired. Staff can remove it in the dashboard." },
      { status: 409, headers: noStore }
    );
  }
  if (auth.status === "error") {
    return NextResponse.json(
      { error: "Database error" },
      { status: 503, headers: noStore }
    );
  }
  if (auth.status === "pending") {
    const parsed = parseDisplayCookie(cookieValue);
    if (parsed) {
      await supabase
        .from(DEVICES.kiosk.table)
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", parsed.id)
        .is("approved_at", null);
    }
  }
  const res = NextResponse.json({ success: true }, { headers: noStore });
  res.cookies.set({ ...deviceCookieOptions("kiosk"), value: "", maxAge: 0 });
  return res;
}
