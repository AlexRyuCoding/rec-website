import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { isAdminAuthorized } from "@/lib/admin-auth";

// Staff PIN reset: clears the hash so the patient re-runs self-serve setup
// at the kiosk. Staff never see or choose a PIN, and the setup-pin
// overwrite guard stays intact — reset is clear-then-recreate, not
// overwrite.
export async function POST(req: Request) {
  if (!(await isAdminAuthorized())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { patient_id } = await req.json();
  if (!patient_id) {
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

  return NextResponse.json({ success: true });
}
