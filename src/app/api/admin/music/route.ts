import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase";
import { getAdminEmail } from "@/lib/admin-auth";
import {
  LINK_MAX_LENGTH,
  MUSIC_SOURCES,
  RADIO_PRESETS,
  STATION_NAME_MAX_LENGTH,
} from "@/lib/music";
import {
  loadMusicRow,
  loadSavedStations,
  mergeMusicSettings,
  MUSIC_TABLE,
  MusicRow,
} from "@/lib/music-server";
import { broadcastFlowUpdated } from "@/lib/rooms-realtime";
import { spotifyConfigured } from "@/lib/spotify-server";

export const dynamic = "force-dynamic";

// The waiting-room TV's background music, for the dashboard: what staff
// chose (GET) and changing it (PATCH). The Spotify token never appears
// here — only whether an account is connected, and its name.

function settingsReply(row: MusicRow) {
  return {
    settings: {
      source: row.source,
      radioName: row.radio_name ?? "",
      radioUrl: row.radio_url ?? "",
      youtubeUrl: row.youtube_url ?? "",
      spotifyUrl: row.spotify_url ?? "",
      volume: row.volume,
      paused: row.paused,
    },
    spotify: {
      configured: spotifyConfigured(),
      connected: row.spotify_refresh_token !== null,
      accountName: row.spotify_account_name,
    },
    presets: RADIO_PRESETS,
  };
}

export async function GET() {
  if (!(await getAdminEmail())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const supabase = createServiceClient();
  const [row, stations] = await Promise.all([
    loadMusicRow(supabase),
    loadSavedStations(supabase),
  ]);
  if (!row) {
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
  // Staff's own stations. If that list can't be read (migration 0013 not
  // applied yet) the panel still works with the built-in ones.
  return NextResponse.json({
    ...settingsReply(row),
    stations: stations ?? [],
    stationsAvailable: stations !== null,
  });
}

const patchSchema = z.object({
  source: z.enum(MUSIC_SOURCES as [string, ...string[]]).optional(),
  radioName: z.string().max(STATION_NAME_MAX_LENGTH).optional(),
  radioUrl: z.string().max(LINK_MAX_LENGTH).optional(),
  youtubeUrl: z.string().max(LINK_MAX_LENGTH).optional(),
  spotifyUrl: z.string().max(LINK_MAX_LENGTH).optional(),
  volume: z.number().int().min(0).max(100).optional(),
  paused: z.boolean().optional(),
});

// Only the fields sent are changed, so "pause" and the volume slider do
// not have to resend (or accidentally save) what is typed in the form.
export async function PATCH(req: Request) {
  const email = await getAdminEmail();
  if (!email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const row = await loadMusicRow(supabase);
  if (!row) {
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  const merged = mergeMusicSettings(
    row,
    parsed.data as Parameters<typeof mergeMusicSettings>[1]
  );
  if (!merged.ok) {
    return NextResponse.json({ error: merged.error }, { status: 400 });
  }

  const updatedAt = new Date().toISOString();
  const { error } = await supabase.from(MUSIC_TABLE).upsert({
    id: true,
    ...merged.values,
    updated_at: updatedAt,
    updated_by: email,
  });
  if (error) {
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  // An empty "something changed — ask again" hint: the TV refetches and
  // switches within a second instead of on its next 10 s poll.
  await broadcastFlowUpdated();

  return NextResponse.json(
    settingsReply({ ...row, ...merged.values, updated_at: updatedAt })
  );
}
