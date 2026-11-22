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
