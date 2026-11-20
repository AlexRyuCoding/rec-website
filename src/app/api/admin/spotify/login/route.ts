import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/admin-auth";
import {
  SPOTIFY_STATE_COOKIE,
  spotifyAuthorizeUrl,
  spotifyConfigured,
} from "@/lib/spotify-server";

export const dynamic = "force-dynamic";

// Step 1 of connecting the clinic's Spotify account: send the signed-in
// staff member to Spotify's own consent page. The random `state` comes
// back with them and must match the cookie, so nobody can be tricked
// into connecting an account they did not choose.
export async function GET(req: Request) {
  if (!(await isAdminAuthorized())) {
    return NextResponse.redirect(new URL("/admin/login", req.url));
  }
  if (!spotifyConfigured()) {
    return NextResponse.redirect(
      new URL("/admin/dashboard?spotify=not-configured#music", req.url)
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
}
