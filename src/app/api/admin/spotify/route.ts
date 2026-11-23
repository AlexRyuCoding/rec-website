import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { broadcastFlowUpdated } from "@/lib/rooms-realtime";
import { disconnectSpotify } from "@/lib/spotify-server";
import { dashboardRoute } from "@/lib/staff-route";

// Forget the clinic's Spotify connection. (To also withdraw the
// permission on Spotify's side: spotify.com → Account → Manage apps.)
export const DELETE = dashboardRoute(async () => {
  if (!(await disconnectSpotify(createServiceClient()))) {
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
  await broadcastFlowUpdated();
  return NextResponse.json({ ok: true });
});
