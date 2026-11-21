// Staff patient search (Dashboard → Patients): what the typed text means.
// Pure — the route applies it.
//
// The text is split into words and EVERY word must be found somewhere in
// the patient's first name, last name or email. Matching the whole text
// against one column at a time (the first version) could never find
// "Ann Lic": no single column holds both names.
//
// Who matches and in what order is decided in the database, by the
// search_patients function (migration 0014; tests in
// supabase/tests/patient_search.sql). wordFilter / phoneFilter /
// rankPatients below are the route's fallback while that migration is not
// applied — the same rules, minus accents and typos.

export type PatientSearch =
  | { kind: "phone"; digits: string[] }
  | { kind: "words"; words: string[] }
  | { kind: "too-short" };

export const MAX_SEARCH_WORDS = 6;
export const SEARCH_RESULT_LIMIT = 20;
// Rows read before ranking, so the closest names are not cut off by a
// word that also happens to sit inside many emails ("l" is in "gmail").
export const SEARCH_FETCH_LIMIT = 200;

export function parsePatientSearch(raw: string): PatientSearch {
  const digits = raw.replace(/[\s\-().+]/g, "");
  if (/^\d{4,}$/.test(digits)) {
    // Phones are stored with or without the country code.
    const forms = [digits];
    if (digits.length === 11 && digits.startsWith("1")) {
      forms.push(digits.slice(1));
    }
    return { kind: "phone", digits: forms };
  }

  // Commas and brackets separate words ("Licater, Ann"); % * \ " are
  // dropped. The database function takes any text literally — this is for
  // the fallback's PostgREST or() filter, where , ( ) end a value, % * are
  // wildcards, \ escapes and " quotes. _ stays: it is in real emails (in
  // the fallback it is a one-letter wildcard, which still matches itself).
  const words: string[] = [];
  for (const word of raw
    .toLowerCase()
    .replace(/[%*\\"]/g, "")
    .split(/[\s,()]+/)) {
    if (word && !words.includes(word)) words.push(word);
  }
  if (words.join("").length < 2) return { kind: "too-short" };
  return { kind: "words", words: words.slice(0, MAX_SEARCH_WORDS) };
}

// PostgREST says this when it does not know the function (PGRST202), and
// Postgres when the function or an extension it needs is missing (42883).
export function isMissingSearchFunction(code: string | undefined): boolean {
  return code === "PGRST202" || code === "42883";
}

// --- Fallback (no migration 0014) ---

// One or() filter per word; the route adds one per word and PostgREST
// ANDs them together.
export function wordFilter(word: string): string {
  return ["first_name", "last_name", "email"]
    .map((column) => `${column}.ilike.%${word}%`)
    .join(",");
}

export function phoneFilter(digits: string[]): string {
  return digits.map((d) => `phone_digits.like.%${d}%`).join(",");
}

interface Searchable {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
}

// How well one word fits a patient: a whole name, the start of a name,
// somewhere inside a name, only in the email.
function wordScore(word: string, names: string[], email: string): number {
  if (names.includes(word)) return 4;
  if (names.some((n) => n.startsWith(word))) return 3;
  if (names.some((n) => n.includes(word))) return 2;
  return email.includes(word) ? 1 : 0;
}

export function rankPatients<T extends Searchable>(
  rows: T[],
  words: string[]
): T[] {
  const scored = rows.map((row) => {
    const first = (row.first_name ?? "").trim().toLowerCase();
    const last = (row.last_name ?? "").trim().toLowerCase();
    const email = (row.email ?? "").toLowerCase();
    // The full names, plus each part of "Mary Ann" / "Jones-Smith".
    const names = [first, last, ...`${first} ${last}`.split(/[\s\-']+/)].filter(
      Boolean
    );
    const score = words.reduce(
      (sum, word) => sum + wordScore(word, names, email),
      0
    );
    return { row, score, last, first };
  });
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      a.last.localeCompare(b.last) ||
      a.first.localeCompare(b.first)
  );
  return scored.map((s) => s.row);
}
