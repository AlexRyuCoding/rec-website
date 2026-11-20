import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { isAdminAuthorized } from "@/lib/admin-auth";
import { DISPLAY_COOKIE } from "@/lib/display-auth";
import { authorizeDisplay, displayCookieOptions } from "@/lib/display-server";
import { CALL_DISPLAY_MS, displayName } from "@/lib/patient-flow";
import { loadActiveVisits } from "@/lib/visits-server";

export const dynamic = "force-dynamic";

// The only data the waiting-room screen can read: who is being called to
// which room right now, as "First L." + room name. Allowed for a paired
// screen (device cookie) or a signed-in staff member previewing it.
//
// A call is shown from the moment the patient is called until the room's
// timer is started (the doctor is in) or ten minutes pass.
export async function GET(req: NextRequest) {
  const supabase = createServiceClient();
  const nowMs = Date.now();
  const noStore = { "Cache-Control": "no-store" };

  const cookieValue = req.cookies.get(DISPLAY_COOKIE)?.value;
  let viaCookie = false;
  if (!(await isAdminAuthorized())) {
    const auth = await authorizeDisplay(supabase, cookieValue, nowMs);
    if (auth.status === "error") {
      // Not 401: the screen must retry, not start a new pairing.
      return NextResponse.json(
        { error: "Database error" },
        { status: 503, headers: noStore }
      );
    }
    if (auth.status === "none") {
      return NextResponse.json(
        { pair: true },
        { status: 401, headers: noStore }
      );
    }
    if (auth.status === "pending") {
      return NextResponse.json(
        { pending: true, code: auth.code },
        { status: 403, headers: noStore }
      );
    }
    viaCookie = true;
  }

  let calls: {
    id: string;
    displayName: string;
    roomName: string;
    calledAt: string;
  }[];
  try {
    const visits = (await loadActiveVisits(supabase, nowMs)).filter(
      (v) =>
        v.room_id !== null &&
        v.called_at !== null &&
        v.seen_at === null &&
        nowMs - Date.parse(v.called_at) < CALL_DISPLAY_MS
    );
    const roomNames = new Map<string, string>();
    if (visits.length > 0) {
      const { data: rooms, error } = await supabase
        .from("rooms")
        .select("id, name")
        .in("id", [...new Set(visits.map((v) => v.room_id!))]);
      if (error) throw new Error("rooms fetch failed");
      for (const room of rooms ?? []) roomNames.set(room.id, room.name);
    }
    calls = visits
      .filter((v) => roomNames.has(v.room_id!))
      .map((v) => ({
        id: v.id,
        displayName: displayName(v.patients?.first_name, v.patients?.last_name),
        roomName: roomNames.get(v.room_id!)!,
        calledAt: v.called_at!,
      }))
      .sort((a, b) => Date.parse(b.calledAt) - Date.parse(a.calledAt));
  } catch {
    return NextResponse.json(
      { error: "Database error" },
      { status: 500, headers: noStore }
    );
  }

  const res = NextResponse.json(
    { calls, serverTime: new Date(nowMs).toISOString() },
    { headers: noStore }
  );
  // Slide the cookie's expiry so a screen in daily use never lapses.
  if (viaCookie && cookieValue) {
    res.cookies.set({ ...displayCookieOptions, value: cookieValue });
  }
  return res;
}
