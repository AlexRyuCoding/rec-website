// Staff patient search against Supabase. The typed text is understood in
// patient-search.ts (pure); the search_patients database function
// (migration 0014) decides who matches and in what order.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEARCH_FETCH_LIMIT,
  SEARCH_RESULT_LIMIT,
  isMissingSearchFunction,
  phoneFilter,
  rankPatients,
  wordFilter,
  type PatientSearch,
} from "./patient-search";

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

// Never returns the PIN hash — only whether there is one.
export async function searchPatients(
  supabase: SupabaseClient,
  search: RunnableSearch
): Promise<SearchOutcome | "error"> {
  return (
    (await databaseSearch(supabase, search)) ??
    (await basicSearch(supabase, search))
  );
}

// The real search. null = the function is not in the database yet
// (migration 0014 not applied) — the caller falls back to basicSearch.
async function databaseSearch(
  supabase: SupabaseClient,
  search: RunnableSearch
): Promise<SearchOutcome | "error" | null> {
  const { data, error } = await supabase.rpc("search_patients", {
    search_words: search.kind === "words" ? search.words : [],
    search_phones: search.kind === "phone" ? search.digits : [],
    max_results: SEARCH_RESULT_LIMIT,
  });
  if (error) {
    if (!isMissingSearchFunction(error.code)) return "error";
    console.warn("patient search: migration 0014 not applied, basic search");
    return null;
  }

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

// The search without migration 0014: every word somewhere in the names or
// email, but exact letters only (no accents or typos forgiven), and only
// the first SEARCH_FETCH_LIMIT matches are ranked. Kept so that deploying
// before the migration is applied does not take the search down.
async function basicSearch(
  supabase: SupabaseClient,
  search: RunnableSearch
): Promise<SearchOutcome | "error"> {
  let query = supabase
    .from("patients")
    .select("id, first_name, last_name, email, phone, pin")
    .order("last_name")
    .order("first_name")
    .limit(SEARCH_FETCH_LIMIT);

  if (search.kind === "phone") {
    query = query.or(phoneFilter(search.digits));
  } else {
    // One or() per word; PostgREST ANDs them.
    for (const word of search.words) {
      query = query.or(wordFilter(word));
    }
  }

  const { data, error } = await query;
  if (error) return "error";

  const rows = data ?? [];
  const ranked =
    search.kind === "words" ? rankPatients(rows, search.words) : rows;
  const shown = ranked.slice(0, SEARCH_RESULT_LIMIT);
  return {
    more: ranked.length > shown.length,
    patients: shown.map((p) => ({
      id: p.id,
      first_name: p.first_name,
      last_name: p.last_name,
      email: p.email,
      phone: p.phone,
      has_pin: !!p.pin,
    })),
  };
}
