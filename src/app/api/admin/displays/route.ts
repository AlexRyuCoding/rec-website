import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase";
import { isAdminAuthorized } from "@/lib/admin-auth";
import { DeviceKind, DEVICES } from "@/lib/display-auth";

async function paired(supabase: SupabaseClient, kind: DeviceKind) {
  const { data, error } = await supabase
    .from(DEVICES[kind].table)
    .select("id, label, approved_at, last_seen_at")
    .not("approved_at", "is", null)
    .is("revoked_at", null)
    .order("approved_at", { ascending: false });
  if (error) return null;
  return (data ?? []).map((d) => ({
    id: d.id as string,
    kind,
    label: d.label as string | null,
    approvedAt: d.approved_at as string | null,
    lastSeenAt: d.last_seen_at as string | null,
  }));
}

// Paired devices, for the dashboard's Screens panel: waiting-room screens
// and check-in kiosks.
export async function GET() {
  if (!(await isAdminAuthorized())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const [screens, kiosks] = await Promise.all([
    paired(supabase, "tv"),
    paired(supabase, "kiosk"),
  ]);
  if (!screens) {
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  // If the kiosk list can't be read (migration 0018 not applied yet) the
  // panel still manages the screens and just leaves kiosks out.
  return NextResponse.json({
    displays: [...(kiosks ?? []), ...screens],
    kiosksAvailable: kiosks !== null,
  });
}
