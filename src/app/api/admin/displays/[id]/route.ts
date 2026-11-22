import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase";
import { isAdminAuthorized } from "@/lib/admin-auth";
import { DEVICES } from "@/lib/display-auth";

// Revoke a paired waiting-room screen or check-in kiosk. Its cookie stops
// working at once: the TV falls back to showing a fresh pairing code, the
// kiosk to its set-up screen (and is an ordinary browser again).
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAdminAuthorized())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  // The id says which device, not which kind: look among the screens
  // first, then the kiosks. (A kiosk table that is not there yet —
  // migration 0018 — just means it was not a kiosk.)
  const supabase = createServiceClient();
  const revokedAt = new Date().toISOString();
  const { data: screen, error } = await supabase
    .from(DEVICES.tv.table)
    .update({ revoked_at: revokedAt })
    .eq("id", id)
    .is("revoked_at", null)
    .select("id")
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
  if (screen) return NextResponse.json({ success: true });

  const { data: kiosk } = await supabase
    .from(DEVICES.kiosk.table)
    .update({ revoked_at: revokedAt })
    .eq("id", id)
    .is("revoked_at", null)
    .select("id")
    .maybeSingle();
  if (!kiosk) {
    return NextResponse.json({ error: "Screen not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
