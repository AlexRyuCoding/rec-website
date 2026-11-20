import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { isAdminAuthorized } from "@/lib/admin-auth";
import { broadcastFlowUpdated } from "@/lib/rooms-realtime";
import {
  connectSpotify,
  SPOTIFY_STATE_COOKIE,
  spotifyConfigured,
} from "@/lib/spotify-server";

export const dynamic = "force-dynamic";

function sameState(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

// Step 2: Spotify sends the staff member back here with a one-time code.
// Only a signed-in staff member whose `state` matches the cookie set in
// step 1 can complete it.
export async function GET(req: NextRequest) {
  const back = (result: string) => {
    const res = NextResponse.redirect(
      new URL(`/admin/dashboard?spotify=${result}#music`, req.url)
    );
    res.cookies.set({
      name: SPOTIFY_STATE_COOKIE,
      value: "",
      path: "/api/admin/spotify",
      maxAge: 0,
    });
    return res;
  };

  if (!(await isAdminAuthorized())) {
    return NextResponse.redirect(new URL("/admin/login", req.url));
  }
  if (!spotifyConfigured()) return back("not-configured");

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state") ?? "";
  const expected = req.cookies.get(SPOTIFY_STATE_COOKIE)?.value ?? "";
  // "error=access_denied" lands here too: the staff member pressed Cancel.
  if (!code || !expected || !sameState(state, expected)) return back("failed");

  const connected = await connectSpotify(createServiceClient(), code);
  if (!connected) return back("failed");

  // A TV already set to Spotify starts playing without anyone touching it.
  await broadcastFlowUpdated();
  return back("connected");
}
