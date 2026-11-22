import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { kioskRoute } from "@/lib/kiosk-route";
import { createCheckin } from "@/lib/checkin-server";

// The kiosk's check-in: the patient confirmed "Yes — check me in". The
// row it writes is also the patient's visit on the rooms board. Rules
// (what counts as a repeat, the appointment snapshot) are in
// src/lib/checkin-server.ts; staff check a patient in themselves through
// POST /api/admin/checkins.
export const POST = kioskRoute(async (req) => {
  const body = await req.json().catch(() => null);
  const patient_id = body?.patient_id;
  if (typeof patient_id !== "string" || !patient_id) {
    return NextResponse.json({ error: "patient_id required" }, { status: 400 });
  }

  const outcome = await createCheckin(
    createServiceClient(),
    patient_id,
    "kiosk",
    Date.now()
  );
  if (outcome === "error") {
    return NextResponse.json(
      { error: "Failed to log check-in" },
      { status: 500 }
    );
  }
  return NextResponse.json({
    success: true,
    duplicate: outcome === "duplicate",
  });
});
