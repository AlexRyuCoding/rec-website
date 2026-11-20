import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { getClientIp } from "@/lib/validation";
import {
  DISPLAY_COOKIE,
  formatDisplayCookie,
  generatePairCode,
  generateSecret,
  hashSecret,
  PAIR_MAX_PER_HOUR,
} from "@/lib/display-auth";
import { authorizeDisplay, displayCookieOptions } from "@/lib/display-server";

const PENDING_RETENTION_MS = 24 * 60 * 60 * 1000;

// Step 1 of pairing a waiting-room screen: the screen asks for a code to
// show. Public by necessity (the TV has no credentials yet), so:
// - it grants nothing by itself — the pairing is useless until a signed-in
//   staff member approves the code on the dashboard
// - it is rate limited per IP and fails closed, like the public forms
export async function POST(req: NextRequest) {
  const supabase = createServiceClient();
  const nowMs = Date.now();

  // A screen that already holds a live pairing (approved, or still
  // waiting for approval) keeps it; reloading the page must not mint codes.
  const existing = await authorizeDisplay(
    supabase,
    req.cookies.get(DISPLAY_COOKIE)?.value,
    nowMs
  );
  if (existing.status === "error") {
    // Can't tell whether this screen is already paired — minting a new
    // pairing now would overwrite a possibly good cookie.
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
  if (existing.status === "ok") {
    return NextResponse.json({ paired: true });
  }
  if (existing.status === "pending") {
    return NextResponse.json({ code: existing.code });
  }

  const ip = getClientIp(req);
  const hourAgo = new Date(nowMs - 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await supabase
    .from("display_devices")
    .select("id", { count: "exact", head: true })
    .eq("created_ip", ip)
    .gte("created_at", hourAgo);
  if (countError || count === null || count >= PAIR_MAX_PER_HOUR) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  // Codes nobody approved are clutter after a day.
  await supabase
    .from("display_devices")
    .delete()
    .is("approved_at", null)
    .lt("created_at", new Date(nowMs - PENDING_RETENTION_MS).toISOString());

  const code = generatePairCode();
  const secret = generateSecret();
  const { data, error } = await supabase
    .from("display_devices")
    .insert({ code, secret_hash: hashSecret(secret), created_ip: ip })
    .select("id")
    .single();
  if (error || !data) {
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  const res = NextResponse.json({ code });
  res.cookies.set({
    ...displayCookieOptions,
    value: formatDisplayCookie(data.id, secret),
  });
  return res;
}
