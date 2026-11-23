import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { siteUrl } from "@/lib/site-url";
import { dashboardRoute } from "@/lib/staff-route";
import {
  SPOTIFY_STATE_COOKIE,
  spotifyAuthorizeUrl,
  spotifyConfigured,
} from "@/lib/spotify-server";

export const dynamic = "force-dynamic";

// A person's browser comes here by navigation, not a script: someone who
// is not signed in is sent to the login page rather than shown JSON.
const toLogin = (req: NextRequest) =>
  NextResponse.redirect(siteUrl("/admin/login", req));

// …and someone whose dashboard has locked goes back to it, where the lock
// screen is: a locked browser must not be able to replace the clinic's
// Spotify connection.
const toLockedDashboard = (req: NextRequest) =>
  NextResponse.redirect(siteUrl("/admin/dashboard?tab=setup", req));

// Step 1 of connecting the clinic's Spotify account: send the signed-in
// staff member to Spotify's own consent page. The random `state` comes
// back with them and must match the cookie, so nobody can be tricked
// into connecting an account they did not choose.
export const GET = dashboardRoute(
  async (req) => {
    if (!spotifyConfigured()) {
      return NextResponse.redirect(
        siteUrl("/admin/dashboard?spotify=not-configured#music", req)
      );
    }

    const state = randomBytes(16).toString("hex");
    const res = NextResponse.redirect(spotifyAuthorizeUrl(state));
    res.cookies.set({
      name: SPOTIFY_STATE_COOKIE,
      value: state,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api/admin/spotify",
      maxAge: 10 * 60,
    });
    return res;
  },
  { whenNotStaff: toLogin, whenLocked: toLockedDashboard }
);
