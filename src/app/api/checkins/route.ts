import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

export async function POST(req: Request) {
  const { patient_id, appointment_time, practitioner } = await req.json();

  if (!patient_id) {
    return NextResponse.json({ error: "patient_id required" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { error } = await supabase.from("checkins").insert({
    patient_id,
    appointment_time: appointment_time ?? null,
    practitioner: practitioner ?? null,
  });

  if (error) {
    return NextResponse.json({ error: "Failed to log check-in" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
