import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase";
import { getAdminEmail, isAdminAuthorized } from "@/lib/admin-auth";
import { recordStaffAction } from "@/lib/audit-server";
import { createCheckin } from "@/lib/checkin-server";

const MAX_ROWS = 500;

export async function GET(req: Request) {
  if (!(await isAdminAuthorized())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  if (!from || !to || isNaN(Date.parse(from)) || isNaN(Date.parse(to))) {
    return NextResponse.json(
      { error: "from and to (ISO timestamps) required" },
      { status: 400 }
    );
  }

  const supabase = createServiceClient();
  const { data, error, count } = await supabase
    .from("checkins")
    .select(
      "id, checked_in_at, appointment_at, service_name, patients(first_name, last_name)",
      { count: "exact" }
    )
    .gte("checked_in_at", from)
    .lt("checked_in_at", to)
    .order("checked_in_at", { ascending: false })
    .limit(MAX_ROWS);

  if (error) {
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  return NextResponse.json({
    checkins: (data ?? []).map((c) => {
      const p = Array.isArray(c.patients) ? c.patients[0] : c.patients;
      return {
        id: c.id,
        checked_in_at: c.checked_in_at,
        appointment_at: c.appointment_at,
        service_name: c.service_name,
        first_name: p?.first_name ?? "",
        last_name: p?.last_name ?? "",
      };
    }),
    total: count ?? 0,
    truncated: (count ?? 0) > MAX_ROWS,
  });
}

const checkInSchema = z.object({ patient_id: z.string().uuid() });

// Staff check a patient in themselves — a walk-in, a forgotten PIN, the
// kiosk being down, or someone taken off the board by mistake. The
// patient lands in the rooms board's waiting list exactly as after a
// kiosk check-in. Only a visit that is still open counts as "already
// checked in" (see repeatRule in src/lib/checkin-server.ts). Written to
// the staff audit log.
export async function POST(req: Request) {
  const staffEmail = await getAdminEmail();
  if (!staffEmail) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = checkInSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const patientId = parsed.data.patient_id;

  const supabase = createServiceClient();
  const outcome = await createCheckin(supabase, patientId, "staff", Date.now());
  if (outcome === "error") {
    return NextResponse.json(
      { error: "Couldn't check the patient in" },
      { status: 500 }
    );
  }
  if (outcome === "created") {
    await recordStaffAction(supabase, {
      staffEmail,
      action: "staff_checkin",
      patientIds: [patientId],
    });
  }
  return NextResponse.json({
    success: true,
    duplicate: outcome === "duplicate",
  });
}
