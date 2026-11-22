import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase";
import { getAdminEmail } from "@/lib/admin-auth";
import {
  DEVICES,
  isApprovable,
  normalizePairCode,
  PAIR_CODE_LENGTH,
} from "@/lib/display-auth";

const bodySchema = z.object({
  code: z.string().max(20),
  label: z.string().trim().max(40).optional(),
  // What staff said the device is. A dashboard tab from before kiosks
  // could be paired sends nothing: a screen.
  kind: z.enum(["tv", "kiosk"]).default("tv"),
});

const DEFAULT_LABELS = { tv: "Waiting room screen", kiosk: "Check-in kiosk" };

// Step 2 of pairing: a signed-in staff member types the code shown on the
// device. Only this turns a pending pairing into a working screen or
// kiosk, so only staff can ever create one.
//
// The code is looked up only among devices of the kind staff chose. A
// kiosk can do more than a screen (PIN lookup, PIN setup, check-in), so
// it must never be approved by someone who believed they were pairing a
// TV: a kiosk's code entered as a screen is simply "not found".
export async function POST(req: Request) {
  const email = await getAdminEmail();
  if (!email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  const code = parsed.success ? normalizePairCode(parsed.data.code) : "";
  if (!parsed.success || code.length !== PAIR_CODE_LENGTH) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const table = DEVICES[parsed.data.kind].table;
  const { data: candidates, error: readError } = await supabase
    .from(table)
    .select("id, created_at, approved_at, revoked_at")
    .eq("code", code)
    .is("approved_at", null)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(1);
  if (readError) {
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
  const pending = candidates?.[0];
  if (!pending || !isApprovable(pending, Date.now())) {
    return NextResponse.json(
      { error: "Code not found or expired" },
      { status: 404 }
    );
  }

  const { data, error } = await supabase
    .from(table)
    .update({
      approved_at: new Date().toISOString(),
      approved_by: email,
      label: parsed.data.label || DEFAULT_LABELS[parsed.data.kind],
    })
    .eq("id", pending.id)
    .is("approved_at", null)
    .select("id, label, approved_at, last_seen_at")
    .maybeSingle();
  if (error || !data) {
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  return NextResponse.json({
    display: {
      id: data.id,
      kind: parsed.data.kind,
      label: data.label,
      approvedAt: data.approved_at,
      lastSeenAt: data.last_seen_at,
    },
  });
}
