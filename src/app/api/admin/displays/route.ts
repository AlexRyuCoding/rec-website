import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { isAdminAuthorized } from "@/lib/admin-auth";

// Paired waiting-room screens, for the dashboard's Screens panel.
export async function GET() {
  if (!(await isAdminAuthorized())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("display_devices")
    .select("id, label, approved_at, last_seen_at")
    .not("approved_at", "is", null)
    .is("revoked_at", null)
    .order("approved_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  return NextResponse.json({
    displays: (data ?? []).map((d) => ({
      id: d.id,
      label: d.label,
      approvedAt: d.approved_at,
      lastSeenAt: d.last_seen_at,
    })),
  });
}
