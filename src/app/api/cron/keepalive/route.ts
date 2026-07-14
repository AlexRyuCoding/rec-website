import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

// Daily Vercel Cron ping (see vercel.json) so the Supabase free-tier
// project never pauses for inactivity over holidays. Vercel sends
// Authorization: Bearer <CRON_SECRET>.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { count, error } = await supabase
    .from("patients")
    .select("id", { count: "exact", head: true });

  if (error || count === null) {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  return NextResponse.json({ ok: true, patients: count });
}
