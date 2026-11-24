import { NextResponse } from "next/server";
import { fetchWithTimeout } from "@/lib/fetch-timeout";
import { realtimeServerConfig } from "@/lib/realtime-config";

// Daily ping so the free Supabase project that carries live updates
// never pauses for inactivity over holidays. A Cloud Scheduler job calls
// it with Authorization: Bearer <CRON_SECRET>.
//
// Supabase counts database requests as activity, and that project holds
// no patient table to ask, so it has a one-row table named `keepalive`
// for this. The clinic's database is not touched: Cloud SQL does not
// pause.
const PING_TIMEOUT_MS = 5000;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const realtime = realtimeServerConfig();
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
