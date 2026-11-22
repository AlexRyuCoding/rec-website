import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { recordStaffAction } from "@/lib/audit-server";
import { parsePatientSearch } from "@/lib/patient-search";
import { searchPatients } from "@/lib/patient-search-server";
import { staffRoute } from "@/lib/staff-route";

const MAX_QUERY_LENGTH = 200;

// A reply that holds patient details must not be kept by any cache.
function reply(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

// Staff patient search: name (any order, parts are enough, accents and
// small typos forgiven), email, or phone fragment. Rules:
// src/lib/patient-search.ts + the search_patients database function
// (migration 0014). Returns whether a PIN exists but NEVER the hash itself.
//
// POST with the text in the body, {q}: a name in the address
// (?q=Ann+Licater) ends up in request logs. Every search is written to
// the staff audit log with the patients it listed.
export const POST = staffRoute(async (req, { email: staffEmail }) => {
  const body = await req.json().catch(() => null);
  const text =
    typeof body?.q === "string" ? body.q.slice(0, MAX_QUERY_LENGTH).trim() : "";
  const search = parsePatientSearch(text);
  if (search.kind === "too-short") {
    return reply({ error: "Search needs at least 2 characters" }, 400);
  }

  const supabase = createServiceClient();
  const outcome = await searchPatients(supabase, search);
  if (outcome === "error") return reply({ error: "Database error" }, 500);

  await recordStaffAction(supabase, {
    staffEmail,
    action: "patient_search",
    patientIds: outcome.patients.map((p) => p.id),
    detail: text,
  });
  return reply(outcome);
});

// The search used to be a GET. A dashboard tab left open from before the
// change still asks that way; it shows this message in place of results.
// Not behind staffRoute on purpose (listed in staff-route.test.ts): it
// reads nothing and says the same thing to everyone.
export async function GET() {
  return NextResponse.json(
    { error: "This page is out of date. Please reload it." },
    { status: 405, headers: { Allow: "POST", "Cache-Control": "no-store" } }
  );
}
