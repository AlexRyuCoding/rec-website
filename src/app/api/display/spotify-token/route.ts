import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { isScreenAuthorized } from "@/lib/display-request";
import { getSpotifyAccessToken } from "@/lib/spotify-server";

export const dynamic = "force-dynamic";

// A one-hour Spotify access token for the waiting-room screen's player.
// Only a paired screen (or signed-in staff) may ask: the token can play
// and control music on the clinic's Spotify account, nothing else. The
// long-lived refresh token stays on the server.
export async function GET(req: NextRequest) {
  const noStore = { "Cache-Control": "no-store" };
  const supabase = createServiceClient();
  if (!(await isScreenAuthorized(req, supabase))) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: noStore }
    );
  }

  const result = await getSpotifyAccessToken(supabase);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.reason },
      // 409: staff must reconnect. 503: temporary, ask again.
      { status: result.reason === "unavailable" ? 503 : 409, headers: noStore }
    );
  }
  return NextResponse.json(
    { accessToken: result.accessToken, expiresInS: result.expiresInS },
    { headers: noStore }
  );
}
