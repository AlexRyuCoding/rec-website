import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { isAdminAuthorized } from "@/lib/admin-auth";
import { fetchTodaySession } from "@/lib/practice-better";

export async function POST(req: Request) {
  if (!(await isAdminAuthorized())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { patient_id } = await req.json();

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

  // Snapshot today's appointment (time + service) from Practice Better
  // onto the log row. Fail open: a PB outage or a walk-in with no session
  // today still checks in, just with null appointment fields.
  let appointment_at: string | null = null;
  let service_name: string | null = null;
  try {
    const { data: patientRow } = await supabase
      .from("patients")
      .select("pb_client_id")
      .eq("id", patient_id)
      .single();
    if (patientRow?.pb_client_id) {
      const session = await fetchTodaySession(patientRow.pb_client_id);
      if (session) {
        appointment_at = new Date(session.sessionDate).toISOString();
        service_name = session.serviceName;
      }
    }
  } catch {
    // check-in must never fail because the appointment lookup did
  }

  const { error } = await supabase
    .from("checkins")
    .insert({ patient_id, appointment_at, service_name });

  if (error) {
    return NextResponse.json(
      { error: "Failed to log check-in" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, duplicate: false });
}
