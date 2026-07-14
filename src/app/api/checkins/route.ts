import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { isAdminAuthorized } from "@/lib/admin-auth";

export async function POST(req: Request) {
  if (!(await isAdminAuthorized())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { patient_id, appointment_time, practitioner } = await req.json();

  if (!patient_id) {
    return NextResponse.json({ error: "patient_id required" }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Double-tap / re-entered-PIN guard: one check-in per patient per
  // 4-hour window keeps the log truthful without blocking a genuine
  // morning + afternoon double visit.
  const since = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
  const { data: recent, error: dupError } = await supabase
    .from("checkins")
    .select("id")
    .eq("patient_id", patient_id)
    .gte("checked_in_at", since)
    .limit(1);

  if (dupError) {
    return NextResponse.json(
      { error: "Failed to log check-in" },
      { status: 500 }
    );
  }
  if (recent && recent.length > 0) {
    return NextResponse.json({ success: true, duplicate: true });
  }

  const { error } = await supabase.from("checkins").insert({
    patient_id,
    appointment_time: appointment_time ?? null,
    practitioner: practitioner ?? null,
  });

  if (error) {
    return NextResponse.json(
      { error: "Failed to log check-in" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, duplicate: false });
}
