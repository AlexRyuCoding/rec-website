import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase";
import { DeviceKind, DEVICES } from "@/lib/display-auth";
import { staffRoute } from "@/lib/staff-route";

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
export const GET = staffRoute(async () => {
  const supabase = createServiceClient();
  const [screens, kiosks] = await Promise.all([
    paired(supabase, "tv"),
    paired(supabase, "kiosk"),
  ]);
  // Both lists or an error: a panel showing only the screens would look
  // as if no kiosk were paired.
  if (!screens || !kiosks) {
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
  return NextResponse.json({ displays: [...kiosks, ...screens] });
});
