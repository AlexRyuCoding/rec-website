import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { isScreenAuthorized } from "@/lib/display-request";
import {
  fetchIcyTitle,
  loadMusicRow,
  tvMusicFromRow,
} from "@/lib/music-server";

export const dynamic = "force-dynamic";

// The track the chosen radio station is playing right now. Browsers hide
// a stream's track announcements from the page, so the server reads them.
// It only ever reads the station saved by staff — the address is not
// taken from the request.
export async function GET(req: NextRequest) {
  const noStore = { "Cache-Control": "no-store" };
  const supabase = createServiceClient();
  if (!(await isScreenAuthorized(req, supabase))) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: noStore }
    );
  }

  const row = await loadMusicRow(supabase);
  const music = row ? tvMusicFromRow(row) : null;
  const title =
    music?.source === "radio" ? await fetchIcyTitle(music.url) : null;
  return NextResponse.json({ title }, { headers: noStore });
}
