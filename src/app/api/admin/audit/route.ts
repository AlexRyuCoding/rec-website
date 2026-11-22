import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase";
import { allowedAdminEmails } from "@/lib/admin-allowlist";
import { STAFF_ACTIONS } from "@/lib/audit-log";
import { loadAuditPage } from "@/lib/audit-server";
import { staffRoute } from "@/lib/staff-route";

const noStore = { "Cache-Control": "no-store" };

const querySchema = z.object({
  action: z.enum(STAFF_ACTIONS).optional(),
  staff: z.string().email().max(200).optional(),
  patient: z.string().uuid().optional(),
  before: z.coerce.number().int().positive().optional(),
});

// The staff audit log, for the dashboard's Log tab: newest first, 100 a
// page, optionally only one kind of action, one staff member, or the
// rows that name one patient ("who looked at this patient?").
//
// The patient is given by id, never by name: a name in the address would
// end up in request logs. Replies name patients, so no cache keeps them.
export const GET = staffRoute(async (req) => {
  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse(
    Object.fromEntries(
      ["action", "staff", "patient", "before"]
        .map((key) => [key, searchParams.get(key)])
        .filter(([, value]) => value)
    )
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request" },
      { status: 400, headers: noStore }
    );
  }

  try {
    const page = await loadAuditPage(createServiceClient(), {
      action: parsed.data.action,
      staffEmail: parsed.data.staff,
      patientId: parsed.data.patient,
      beforeId: parsed.data.before,
    });
    return NextResponse.json(
      {
        ...page,
        // Who can appear in the log: the accounts allowed to sign in.
        staff: [...allowedAdminEmails()].sort(),
      },
      { headers: noStore }
    );
  } catch {
    return NextResponse.json(
      { error: "The log could not be read." },
      { status: 500, headers: noStore }
    );
  }
});
