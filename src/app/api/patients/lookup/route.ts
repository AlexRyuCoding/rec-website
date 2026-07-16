import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { createServiceClient, fetchAllPatientsWithPins } from "@/lib/supabase";
import { isAdminAuthorized } from "@/lib/admin-auth";
import { pinAttemptsExhausted, recordPinFailure } from "@/lib/pin-rate-limit";

export async function POST(req: Request) {
  if (!(await isAdminAuthorized())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
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

  const supabase = createServiceClient();
  let patients;
  try {
    patients = await fetchAllPatientsWithPins(supabase);
  } catch {
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  for (const patient of patients) {
    const match = await bcrypt.compare(pin, patient.pin);
    if (match) {
      return NextResponse.json({
        id: patient.id,
        first_name: patient.first_name,
        last_name: patient.last_name,
        pb_client_id: patient.pb_client_id,
      });
    }
  }

  await recordPinFailure();
  return NextResponse.json(
    { error: "PIN not recognized, please see the front desk" },
    { status: 404 }
  );
}
