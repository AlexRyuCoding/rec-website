import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { isAdminAuthorized } from "@/lib/admin-auth";

// Staff patient search: name, email, or phone fragment. Returns whether a
// PIN exists but NEVER the hash itself.
export async function GET(req: Request) {
  if (!(await isAdminAuthorized())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json(
      { error: "Search needs at least 2 characters" },
      { status: 400 }
    );
  }

  const supabase = createServiceClient();
  let query = supabase
    .from("patients")
    .select("id, first_name, last_name, email, phone, pin")
    .order("last_name")
    .limit(20);

  const digits = q.replace(/[\s\-().+]/g, "");
  if (/^\d{4,}$/.test(digits)) {
    query = query.like("phone_digits", `%${digits}%`);
  } else {
    // Strip PostgREST or() syntax characters so input can't break the filter
    const safe = q.replace(/[%_,()]/g, "");
    query = query.or(
      `first_name.ilike.%${safe}%,last_name.ilike.%${safe}%,email.ilike.%${safe}%`
    );
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  return NextResponse.json({
    patients: (data ?? []).map((p) => ({
      id: p.id,
      first_name: p.first_name,
      last_name: p.last_name,
      email: p.email,
      phone: p.phone,
      has_pin: !!p.pin,
    })),
  });
}
