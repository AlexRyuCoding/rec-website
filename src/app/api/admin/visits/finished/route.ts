import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { loadFinishedVisits } from "@/lib/visits-server";
import { staffRoute } from "@/lib/staff-route";

const noStore = { "Cache-Control": "no-store" };

// Today's finished visits ("First L." only), newest first, for the rooms
// board's "Finished" list: where a patient taken off the board by mistake
// — Room ready on the wrong tile, a wrong Remove — is put back (POST
// /api/admin/visits/[id] {action: "restore"}).
export const GET = staffRoute(async () => {
  try {
    const finished = await loadFinishedVisits(
      createServiceClient(),
      Date.now()
    );
    return NextResponse.json({ finished }, { headers: noStore });
  } catch {
    return NextResponse.json(
      { error: "Database error" },
      { status: 500, headers: noStore }
    );
  }
});
