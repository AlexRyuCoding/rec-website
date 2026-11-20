import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { isAdminAuthorized } from "@/lib/admin-auth";
import { broadcastFlowUpdated } from "@/lib/rooms-realtime";
import { disconnectSpotify } from "@/lib/spotify-server";

// Forget the clinic's Spotify connection. (To also withdraw the
// permission on Spotify's side: spotify.com → Account → Manage apps.)
export async function DELETE() {
  if (!(await isAdminAuthorized())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await disconnectSpotify(createServiceClient()))) {
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
  await broadcastFlowUpdated();
  return NextResponse.json({ ok: true });
}
