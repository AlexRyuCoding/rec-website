import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { isAdminAuthorized } from "@/lib/admin-auth";

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
      "id, checked_in_at, appointment_time, practitioner, patients(first_name, last_name)",
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
        appointment_time: c.appointment_time,
        practitioner: c.practitioner,
        first_name: p?.first_name ?? "",
        last_name: p?.last_name ?? "",
      };
    }),
    total: count ?? 0,
    truncated: (count ?? 0) > MAX_ROWS,
  });
}
