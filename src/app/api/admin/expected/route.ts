import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { loadExpected, ScheduleUnavailable } from "@/lib/expected-server";
import { staffRoute } from "@/lib/staff-route";

const noStore = { "Cache-Control": "no-store" };

// Who is still expected today, for the rooms board's "Expected" list:
// today's Practice Better appointments whose patients have not checked
// in, as "First L." with the appointment time, practitioner and service.
//
// The schedule is a shared copy at most five minutes old (see
// expected-server.ts); ?refresh=1 asks Practice Better again, at most
// every thirty seconds. Checking a patient in from the list is the
// ordinary staff check-in (POST /api/admin/checkins).
export const GET = staffRoute(async (req) => {
  const forced = new URL(req.url).searchParams.get("refresh") === "1";
  try {
    const list = await loadExpected(createServiceClient(), Date.now(), forced);
    return NextResponse.json(list, { headers: noStore });
  } catch (e) {
    const reason = e instanceof ScheduleUnavailable ? e.reason : "database";
    return NextResponse.json(
      {
        error:
          reason === "practice-better"
            ? "Practice Better could not be reached."
            : "Today's appointments are not available.",
        reason,
      },
      { status: reason === "practice-better" ? 502 : 503, headers: noStore }
    );
  }
});
