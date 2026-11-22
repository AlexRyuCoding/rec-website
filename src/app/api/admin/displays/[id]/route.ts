import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase";
import { recordStaffAction } from "@/lib/audit-server";
import { DEVICES } from "@/lib/display-auth";
import { staffRoute } from "@/lib/staff-route";

// Revoke a paired waiting-room screen or check-in kiosk. Its cookie stops
// working at once: the TV falls back to showing a fresh pairing code, the
// kiosk to its set-up screen (and is an ordinary browser again).
export const DELETE = staffRoute<{ id: string }>(
  async (_req, { email: staffEmail }, { params }) => {
    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    // The id says which device, not which kind: look among the screens
    // first, then the kiosks.
    const supabase = createServiceClient();
    const revokedAt = new Date().toISOString();
    const { data: screen, error } = await supabase
      .from(DEVICES.tv.table)
      .update({ revoked_at: revokedAt })
      .eq("id", id)
      .is("revoked_at", null)
      .select("id, label")
      .maybeSingle();
    if (error) {
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }
    const revoked = (what: string, label: string | null) =>
      recordStaffAction(supabase, {
        staffEmail,
        action: "device_revoke",
        patientIds: [],
        detail: `${what}: ${label ?? "unnamed"}`,
      });
    if (screen) {
      await revoked("Waiting room screen", screen.label);
      return NextResponse.json({ success: true });
    }

    const { data: kiosk } = await supabase
      .from(DEVICES.kiosk.table)
      .update({ revoked_at: revokedAt })
      .eq("id", id)
      .is("revoked_at", null)
      .select("id, label")
      .maybeSingle();
    if (!kiosk) {
      return NextResponse.json({ error: "Screen not found" }, { status: 404 });
    }
    await revoked("Check-in kiosk", kiosk.label);
    return NextResponse.json({ success: true });
  }
);
