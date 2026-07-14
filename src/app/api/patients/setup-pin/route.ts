import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { createServiceClient, fetchAllPatientsWithPins } from "@/lib/supabase";
import { isAdminAuthorized } from "@/lib/admin-auth";

function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, "");
}

interface ContactMatch {
  id: string;
  first_name: string;
  pin: string | null;
}

// Emails and phones are shared within families, so a contact can match
// several patients. Setting up a PIN only applies to patients without one:
// if exactly one match has no PIN, that's who's standing at the kiosk.
// Zero without a PIN → they all have PINs. More than one → can't safely
// guess which family member this is.
function resolveMatches(matches: ContactMatch[]) {
  if (matches.length === 0) {
    return NextResponse.json({ status: "not_found" });
  }
  const withoutPin = matches.filter((p) => !p.pin);
  if (withoutPin.length === 0) {
    return NextResponse.json({ status: "has_pin" });
  }
  if (withoutPin.length > 1) {
    return NextResponse.json({ status: "ambiguous" });
  }
  return NextResponse.json({
    status: "ok",
    patient_id: withoutPin[0].id,
    first_name: withoutPin[0].first_name,
  });
}

export async function POST(req: Request) {
  if (!(await isAdminAuthorized())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

  const query = supabase.from("patients").select("id, first_name, phone, pin");

  if (isPhone) {
    // phone_digits is a generated normalized column — exact indexed match
    const { data: patients, error } = await query.eq(
      "phone_digits",
      normalized
    );
    if (error)
      return NextResponse.json({ error: "Database error" }, { status: 500 });

    return resolveMatches(patients ?? []);
  } else {
    const { data: patients, error } = await query.eq(
      "email",
      contact.trim().toLowerCase()
    );
    if (error)
      return NextResponse.json({ error: "Database error" }, { status: 500 });

    return resolveMatches(patients ?? []);
  }
}

export async function PATCH(req: Request) {
  if (!(await isAdminAuthorized())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { patient_id, pin } = await req.json();

  if (!patient_id || !pin || !/^\d{4}$/.test(pin)) {
    return NextResponse.json(
      { error: "patient_id and 4-digit pin required" },
      { status: 400 }
    );
  }

  const supabase = createServiceClient();

  // Setting a PIN is only for patients who don't have one — never an
  // overwrite path, or a stolen patient_id could hijack an existing PIN.
  const { data: target, error: targetError } = await supabase
    .from("patients")
    .select("id, pin")
    .eq("id", patient_id)
    .maybeSingle();

  if (targetError) {
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
  if (!target) {
    return NextResponse.json({ error: "Patient not found" }, { status: 404 });
  }
  if (target.pin) {
    return NextResponse.json(
      {
        error:
          "A PIN is already set for this patient. Please see the front desk.",
      },
      { status: 403 }
    );
  }

  // PIN lookup is by PIN alone, so each PIN must map to exactly one patient
  let existing;
  try {
    existing = (await fetchAllPatientsWithPins(supabase)).filter(
      (p) => p.id !== patient_id
    );
  } catch {
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  for (const other of existing) {
    if (await bcrypt.compare(pin, other.pin)) {
      return NextResponse.json(
        { error: "That PIN is already taken — please choose a different one." },
        { status: 409 }
      );
    }
  }

  const hashed = await bcrypt.hash(pin, 8);

  const { data: patient, error } = await supabase
    .from("patients")
    .update({ pin: hashed })
    .eq("id", patient_id)
    .is("pin", null)
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
