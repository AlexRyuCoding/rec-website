import { NextResponse } from "next/server";
import { fetchWithTimeout } from "@/lib/fetch-timeout";
import { realtimeServerConfig } from "@/lib/realtime-config";
import { createServiceClient } from "@/lib/supabase";

// Daily ping so a free-tier Supabase project never pauses for inactivity
// over holidays. The caller sends Authorization: Bearer <CRON_SECRET> —
// Vercel Cron (see vercel.json) on Vercel, a Cloud Scheduler job on Google
// Cloud.
//
// Which project it keeps awake:
//  - Live updates in a Supabase project of their own (realtime-config.ts,
//    `separate`): THAT project. Supabase counts database requests as
//    activity, and it holds no patient table to ask, so it has a one-row
//    table named `keepalive` for this. The database is not touched — on
//    Google Cloud it is Cloud SQL, which does not pause.
//  - Otherwise: the one Supabase project that is database and Realtime
//    both, as before.
const PING_TIMEOUT_MS = 5000;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const realtime = realtimeServerConfig();
  if (realtime.separate) {
    try {
      const res = await fetchWithTimeout(
        `${realtime.url}/rest/v1/keepalive?select=id&limit=1`,
        {
          headers: {
            apikey: realtime.serviceKey,
            Authorization: `Bearer ${realtime.serviceKey}`,
          },
        },
        PING_TIMEOUT_MS
      );
      if (!res.ok) return NextResponse.json({ ok: false }, { status: 500 });
      return NextResponse.json({ ok: true });
    } catch {
      return NextResponse.json({ ok: false }, { status: 500 });
    }
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
