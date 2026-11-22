// Staff patient search against Supabase. The typed text is understood in
// patient-search.ts (pure); the search_patients database function
// (migration 0014) decides who matches and in what order.

import type { SupabaseClient } from "@supabase/supabase-js";
import { SEARCH_RESULT_LIMIT, type PatientSearch } from "./patient-search";

export interface PatientResult {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  has_pin: boolean;
}

export interface SearchOutcome {
  patients: PatientResult[];
  // true = there were more matches than the ones listed
  more: boolean;
}

export type RunnableSearch = Exclude<PatientSearch, { kind: "too-short" }>;

// Never returns the PIN hash — only whether there is one. "error" = the
// database could not answer; there is no second, simpler search to fall
// back on (there was one while migration 0014 was being rolled out).
export async function searchPatients(
  supabase: SupabaseClient,
  search: RunnableSearch
): Promise<SearchOutcome | "error"> {
  const { data, error } = await supabase.rpc("search_patients", {
    search_words: search.kind === "words" ? search.words : [],
    search_phones: search.kind === "phone" ? search.digits : [],
    max_results: SEARCH_RESULT_LIMIT,
  });
  if (error) return "error";

  const rows = (data ?? []) as (PatientResult & { total_matches: number })[];
  return {
    more: Number(rows[0]?.total_matches ?? 0) > rows.length,
    patients: rows.map((p) => ({
      id: p.id,
      first_name: p.first_name,
      last_name: p.last_name,
      email: p.email,
      phone: p.phone,
      has_pin: p.has_pin,
    })),
  };
}
