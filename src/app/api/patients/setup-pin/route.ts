import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { createServiceClient } from "@/lib/supabase";

function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, "");
}

export async function POST(req: Request) {
  const { contact } = await req.json();

  if (!contact || contact.trim().length < 3) {
    return NextResponse.json(
      { error: "Enter a valid phone number or email" },
      { status: 400 }
    );
  }

  const supabase = createServiceClient();
  const normalized = normalizePhone(contact.trim());
  const isPhone = /^\d{7,15}$/.test(normalized);

  const query = supabase
    .from("patients")
    .select("id, first_name, last_name, phone, pin, pb_client_id");

  if (isPhone) {
    // Fetch all and filter by normalized phone — Supabase doesn't support inline transforms
    const { data: patients, error } = await query;
    if (error)
      return NextResponse.json({ error: "Database error" }, { status: 500 });

    const patient = (patients ?? []).find(
      (p) => normalizePhone(p.phone ?? "") === normalized
    );

    if (!patient) {
      return NextResponse.json({ status: "not_found" });
    }
    if (patient.pin) {
      return NextResponse.json({ status: "has_pin" });
    }
    return NextResponse.json({
      status: "ok",
      patient_id: patient.id,
      first_name: patient.first_name,
    });
  } else {
    // Email lookup
    const { data: patients, error } = await query.eq(
      "email",
      contact.trim().toLowerCase()
    );
    if (error)
      return NextResponse.json({ error: "Database error" }, { status: 500 });

    if (!patients || patients.length === 0) {
      return NextResponse.json({ status: "not_found" });
    }
    const patient = patients[0];
    if (patient.pin) {
      return NextResponse.json({ status: "has_pin" });
    }
    return NextResponse.json({
      status: "ok",
      patient_id: patient.id,
      first_name: patient.first_name,
    });
  }
}

export async function PATCH(req: Request) {
  const { patient_id, pin } = await req.json();

  if (!patient_id || !pin || !/^\d{4}$/.test(pin)) {
    return NextResponse.json(
      { error: "patient_id and 4-digit pin required" },
      { status: 400 }
    );
  }

  const hashed = await bcrypt.hash(pin, 8);
  const supabase = createServiceClient();

  const { data: patient, error } = await supabase
    .from("patients")
    .update({ pin: hashed })
    .eq("id", patient_id)
    .select("id, first_name, last_name, pb_client_id")
    .single();

  if (error || !patient) {
    return NextResponse.json({ error: "Failed to save PIN" }, { status: 500 });
  }

  return NextResponse.json({
    id: patient.id,
    first_name: patient.first_name,
    last_name: patient.last_name,
    pb_client_id: patient.pb_client_id,
  });
}
