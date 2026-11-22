import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase";
import { getAdminEmail } from "@/lib/admin-auth";
import {
  checkNewStation,
  LINK_MAX_LENGTH,
  STATION_NAME_MAX_LENGTH,
} from "@/lib/music";
import { loadSavedStations, STATIONS_TABLE } from "@/lib/music-server";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  // Generous here; checkNewStation gives the reason in plain words.
  name: z.string().max(STATION_NAME_MAX_LENGTH * 4),
  url: z.string().max(LINK_MAX_LENGTH),
});

// Keep a radio station for later (staff). The list itself is read with
// GET /api/admin/music, so the panel loads everything in one request.
// Adding a station does not change what is playing.
export async function POST(req: Request) {
  const email = await getAdminEmail();
  if (!email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const existing = await loadSavedStations(supabase);
  if (!existing) {
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  const check = checkNewStation(parsed.data.name, parsed.data.url, existing);
  if (!check.ok) {
    return NextResponse.json({ error: check.reason }, { status: 400 });
  }

  const { data, error } = await supabase
    .from(STATIONS_TABLE)
    .insert({ name: check.name, url: check.url, created_by: email })
    .select("id, name, url")
    .single();
  if (error) {
    // 23505 = unique violation: someone added the same stream a moment ago.
    return error.code === "23505"
      ? NextResponse.json(
          { error: "That station is already in your list." },
          { status: 400 }
        )
      : NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  return NextResponse.json({ station: data }, { status: 201 });
}
