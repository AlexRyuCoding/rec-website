import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { recordStaffAction } from "@/lib/audit-server";
import { dashboardRoute } from "@/lib/staff-route";

// Staff PIN reset: clears the hash so the patient re-runs self-serve setup
// at the kiosk. Staff never see or choose a PIN, and the setup-pin
// overwrite guard stays intact — reset is clear-then-recreate, not
// overwrite. Each reset is written to the staff audit log.
export const POST = dashboardRoute(async (req, { email: staffEmail }) => {
  const body = await req.json().catch(() => null);
  const patient_id = body?.patient_id;
  if (typeof patient_id !== "string" || !patient_id) {
    return NextResponse.json({ error: "patient_id required" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("patients")
    .update({ pin: null })
    .eq("id", patient_id)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Patient not found" }, { status: 404 });
  }

  await recordStaffAction(supabase, {
    staffEmail,
    action: "pin_reset",
    patientIds: [data.id],
  });
  return NextResponse.json({ success: true });
});
