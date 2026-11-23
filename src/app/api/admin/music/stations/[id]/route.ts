import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase";
import { STATIONS_TABLE } from "@/lib/music-server";
import { dashboardRoute } from "@/lib/staff-route";

// Remove a station from staff's list. If it is the one playing it keeps
// playing: the music setting holds the stream's address, not a link to
// this row.
export const DELETE = dashboardRoute<{ id: string }>(
  async (_req, _staff, { params }) => {
    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const { data, error } = await createServiceClient()
      .from(STATIONS_TABLE)
      .delete()
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (error) {
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: "Station not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  }
);
