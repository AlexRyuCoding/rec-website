import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { isAdminAuthorized } from "@/lib/admin-auth";
import { parsePatientSearch } from "@/lib/patient-search";
import { searchPatients } from "@/lib/patient-search-server";

// Staff patient search: name (any order, parts are enough, accents and
// small typos forgiven), email, or phone fragment. Rules:
// src/lib/patient-search.ts + the search_patients database function
// (migration 0014). Returns whether a PIN exists but NEVER the hash itself.
export async function GET(req: Request) {
  if (!(await isAdminAuthorized())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const search = parsePatientSearch(searchParams.get("q") ?? "");
  if (search.kind === "too-short") {
    return NextResponse.json(
      { error: "Search needs at least 2 characters" },
      { status: 400 }
    );
  }

  const outcome = await searchPatients(createServiceClient(), search);
  if (outcome === "error") {
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
  return NextResponse.json(outcome);
}
