import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { findPatientByPin } from "@/lib/pin-server";
import { kioskRoute } from "@/lib/kiosk-route";
import { pinAttemptsExhausted, recordPinFailure } from "@/lib/pin-rate-limit";

export const POST = kioskRoute(async (req) => {
  if (await pinAttemptsExhausted()) {
    return NextResponse.json(
      { error: "Too many attempts. Please see the front desk." },
      { status: 429 }
    );
  }

  const { pin } = await req.json();

  if (!pin || !/^\d{4}$/.test(pin)) {
    return NextResponse.json(
      { error: "PIN must be exactly 4 digits" },
      { status: 400 }
    );
  }

  // One indexed query for most patients; the compare-against-everyone
  // way only for PINs not fingerprinted yet (see src/lib/pin-server.ts).
  let patient;
  try {
    patient = await findPatientByPin(createServiceClient(), pin);
  } catch {
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
  if (patient) {
    return NextResponse.json({
      id: patient.id,
      first_name: patient.first_name,
      last_name: patient.last_name,
      pb_client_id: patient.pb_client_id,
    });
  }

  await recordPinFailure();
  return NextResponse.json(
    { error: "PIN not recognized, please see the front desk" },
    { status: 404 }
  );
});
