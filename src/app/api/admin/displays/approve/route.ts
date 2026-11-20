import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase";
import { authOptions } from "@/lib/auth";
import { isAllowedAdminEmail } from "@/lib/admin-allowlist";
import {
  isApprovable,
  normalizePairCode,
  PAIR_CODE_LENGTH,
} from "@/lib/display-auth";

const bodySchema = z.object({
  code: z.string().max(20),
  label: z.string().trim().max(40).optional(),
});

// Step 2 of pairing: a signed-in staff member types the code shown on the
// TV. Only this turns a pending pairing into a working screen, so only
// staff can ever create one.
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email ?? null;
  if (!isAllowedAdminEmail(email)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  const code = parsed.success ? normalizePairCode(parsed.data.code) : "";
  if (!parsed.success || code.length !== PAIR_CODE_LENGTH) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: candidates, error: readError } = await supabase
    .from("display_devices")
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
    .from("display_devices")
    .update({
      approved_at: new Date().toISOString(),
      approved_by: email,
      label: parsed.data.label || "Waiting room screen",
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
      label: data.label,
      approvedAt: data.approved_at,
      lastSeenAt: data.last_seen_at,
    },
  });
}
