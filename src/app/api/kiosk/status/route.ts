import { NextRequest, NextResponse } from "next/server";
import { carriesKioskCookie, KIOSK_COOKIE } from "@/lib/device-cookie";
import { deviceCookieOptions } from "@/lib/display-server";
import { kioskAccess } from "@/lib/kiosk-auth-server";

const noStore = { "Cache-Control": "no-store" };

// What the kiosk page should show: the number pad (a paired kiosk, or a
// signed-in staff member), a pairing code waiting for staff, or the
// set-up screen. Public — it says nothing about any patient.
export async function GET(req: NextRequest) {
  const access = await kioskAccess();
  const res = NextResponse.json(access, { headers: noStore });

  const cookieValue = req.cookies.get(KIOSK_COOKIE)?.value;
  if (access.status === "paired" && cookieValue) {
    // Slide the cookie's expiry so a kiosk in daily use never lapses.
    res.cookies.set({ ...deviceCookieOptions("kiosk"), value: cookieValue });
  } else if (access.status === "none" && carriesKioskCookie(cookieValue)) {
    // The pairing is gone (revoked in the dashboard, or a code nobody
    // approved in time). Drop the cookie: it no longer opens anything,
    // and while it is there the browser cannot reach the staff login.
    res.cookies.set({ ...deviceCookieOptions("kiosk"), value: "", maxAge: 0 });
  }
  return res;
}
