import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { isAdminAuthorized } from "@/lib/admin-auth";
import { loadFinishedVisits } from "@/lib/visits-server";

const noStore = { "Cache-Control": "no-store" };

// Today's finished visits ("First L." only), newest first, for the rooms
// board's "Finished" list: where a patient taken off the board by mistake
// — Room ready on the wrong tile, a wrong Remove — is put back (POST
// /api/admin/visits/[id] {action: "restore"}).
export async function GET() {
  if (!(await isAdminAuthorized())) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: noStore }
    );
  }
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
}
