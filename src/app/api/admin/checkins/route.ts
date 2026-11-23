import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase";
import { recordStaffAction, recordStaffActionOnce } from "@/lib/audit-server";
import { checkinRangeDetail } from "@/lib/audit-log";
import { createCheckin } from "@/lib/checkin-server";
import { loadCheckinPage, loadCheckinTimings } from "@/lib/checkins-server";
import { summarizeVisits } from "@/lib/visit-stats";
import { dashboardRoute, staffRoute } from "@/lib/staff-route";

const noStore = { "Cache-Control": "no-store" };

// The dashboard's check-ins view: one page of check-ins in a from/to
// range (newest first, with where each visit stands), and — with the
// first page — the wait-time numbers for the WHOLE range. `offset` asks
// for a later page ("Load more", and a CSV export of everything).
//
// The reply holds patients' full names, so no cache may keep it, and it
// is written to the staff audit log with the patients it listed:
// - a view, at most once per 15 minutes for the same person and dates
//   (the list refreshes itself every minute)
// - an export (&export=1, sent by "Export CSV"), every page of it
export const GET = dashboardRoute(async (req, { email: staffEmail }) => {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const offset = Number(searchParams.get("offset") ?? "0");
  const exporting = searchParams.get("export") === "1";
  if (
    !from ||
    !to ||
    isNaN(Date.parse(from)) ||
    isNaN(Date.parse(to)) ||
    !Number.isInteger(offset) ||
    offset < 0
  ) {
    return NextResponse.json(
      { error: "from and to (ISO timestamps) required" },
      { status: 400, headers: noStore }
    );
  }

  const supabase = createServiceClient();
  let page;
  try {
    page = await loadCheckinPage(supabase, from, to, offset);
  } catch {
    return NextResponse.json(
      { error: "Database error" },
      { status: 500, headers: noStore }
    );
  }

  const entry = {
    staffEmail,
    patientIds: page.patientIds,
    detail: checkinRangeDetail(from, to, offset),
  };
  if (exporting) {
    await recordStaffAction(supabase, { ...entry, action: "checkins_export" });
  } else {
    await recordStaffActionOnce(
      supabase,
      { ...entry, action: "checkins_view" },
      Date.now()
    );
  }

  // The numbers are an extra: if they cannot be worked out the list is
  // still shown, just without them.
  let stats = null;
  if (offset === 0) {
    try {
      const timings = await loadCheckinTimings(supabase, from, to);
      stats = {
        ...summarizeVisits(timings.rows),
        complete: timings.complete,
      };
    } catch {
      stats = null;
    }
  }

  return NextResponse.json(
    {
      checkins: page.checkins,
      total: page.total,
      truncated: page.more,
      stats,
    },
    { headers: noStore }
  );
});

const checkInSchema = z.object({ patient_id: z.string().uuid() });

// Staff check a patient in themselves — a walk-in, a forgotten PIN, the
// kiosk being down, or someone taken off the board by mistake. The
// patient lands in the rooms board's waiting list exactly as after a
// kiosk check-in. Only a visit that is still open counts as "already
// checked in" (see repeatRule in src/lib/checkin-server.ts). Written to
// the staff audit log.
export const POST = staffRoute(async (req, { email: staffEmail }) => {
  const parsed = checkInSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const patientId = parsed.data.patient_id;

  const supabase = createServiceClient();
  const outcome = await createCheckin(supabase, patientId, "staff", Date.now());
  if (outcome === "error") {
    return NextResponse.json(
      { error: "Couldn't check the patient in" },
      { status: 500 }
    );
  }
  if (outcome === "created") {
    await recordStaffAction(supabase, {
      staffEmail,
      action: "staff_checkin",
      patientIds: [patientId],
    });
  }
  return NextResponse.json({
    success: true,
    duplicate: outcome === "duplicate",
  });
});
