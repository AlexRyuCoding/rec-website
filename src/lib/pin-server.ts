// Finding a patient by PIN, and saving a new PIN. Rules and the reason
// for the fingerprint: pin-lookup.ts. The fingerprint lives in
// patients.pin_lookup (migration 0017).

import type { SupabaseClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";
import { isCurrentFingerprint, pinFingerprint } from "./pin-lookup";
import { fetchAllPatientsWithPins, PinRow } from "./supabase";

const PIN_COLUMNS = "id, pin, first_name, last_name, pb_client_id";
const PAGE_SIZE = 1000;
// bcrypt work factor for a new PIN (unchanged).
const PIN_HASH_ROUNDS = 8;

interface PinHolder extends PinRow {
  pin_lookup?: string | null;
}

interface PinOptions {
  // The server-only secret the fingerprint key is derived from. Without
  // one there are no fingerprints and every lookup is the slow way.
  secret?: string | undefined;
  hashRounds?: number;
}

const liveSecret = () => process.env.NEXTAUTH_SECRET || undefined;

// Every patient with a PIN, with their fingerprint. Throws if the
// database cannot be read.
async function fetchHoldersWithLookup(
  supabase: SupabaseClient
): Promise<PinHolder[]> {
  const rows: PinHolder[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("patients")
      .select(`${PIN_COLUMNS}, pin_lookup`)
      .not("pin", "is", null)
      .order("id")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error("pin holders fetch failed");
    rows.push(...((data ?? []) as PinHolder[]));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

// The patient whose PIN this is, or null. Throws only when the patients
// cannot be read at all.
//
// 1. Fast: one indexed query for the PIN's fingerprint, confirmed against
//    that patient's bcrypt hash.
// 2. Slow, for whoever has no current fingerprint yet (a PIN made before
//    migration 0017, or before a secret rotation): compare against each
//    of their hashes. A patient found this way is stamped with the
//    fingerprint, so it happens once per patient.
//
// Patients whose fingerprint is current and different are skipped in
// step 2: their PIN is provably not this one. skipPatientId leaves one
// patient out altogether ("is this PIN used by anyone else?").
async function matchPin(
  supabase: SupabaseClient,
  pin: string,
  options: PinOptions,
  skipPatientId?: string
): Promise<PinRow | null> {
  const secret = "secret" in options ? options.secret : liveSecret();
  const fingerprint = secret ? pinFingerprint(pin, secret) : null;

  // Without a server secret there are no fingerprints: every PIN holder
  // is compared (how it worked before fingerprints).
  const indexed = fingerprint !== null;
  if (fingerprint) {
    const { data, error } = await supabase
      .from("patients")
      .select(PIN_COLUMNS)
      .eq("pin_lookup", fingerprint)
      .not("pin", "is", null)
      .limit(2);
    if (error) throw new Error("pin lookup failed");
    for (const row of (data ?? []) as PinRow[]) {
      if (row.id === skipPatientId) continue;
      if (await bcrypt.compare(pin, row.pin)) return row;
    }
  }

  const holders: PinHolder[] = indexed
    ? await fetchHoldersWithLookup(supabase)
    : await fetchAllPatientsWithPins(supabase);

  for (const row of holders) {
    if (row.id === skipPatientId) continue;
    if (indexed && isCurrentFingerprint(row.pin_lookup, secret!)) continue;
    if (!(await bcrypt.compare(pin, row.pin))) continue;
    if (indexed) {
      // Best effort: a failed stamp only means the slow way next time.
      try {
        await supabase
          .from("patients")
          .update({ pin_lookup: fingerprint })
          .eq("id", row.id);
      } catch {
        // ignore
      }
    }
    return {
      id: row.id,
      pin: row.pin,
      first_name: row.first_name,
      last_name: row.last_name,
      pb_client_id: row.pb_client_id,
    };
  }
  return null;
}

export function findPatientByPin(
  supabase: SupabaseClient,
  pin: string,
  options: PinOptions = {}
): Promise<PinRow | null> {
  return matchPin(supabase, pin, options);
}

// PIN lookup is by PIN alone, so each PIN must belong to one patient.
export async function pinUsedByAnother(
  supabase: SupabaseClient,
  pin: string,
  patientId: string,
  options: PinOptions = {}
): Promise<boolean> {
  return (await matchPin(supabase, pin, options, patientId)) !== null;
}

export interface SavedPinPatient {
  id: string;
  first_name: string;
  last_name: string;
  pb_client_id: string | null;
}

// Saves a new PIN for a patient who has none (never an overwrite: the
// write only lands while pin is null).
// - "taken": the database's unique index on the fingerprint refused it —
//   another patient saved the same PIN a moment ago.
// - "error": not saved (including: the patient has a PIN by now).
export async function saveNewPin(
  supabase: SupabaseClient,
  patientId: string,
  pin: string,
  options: PinOptions = {}
): Promise<SavedPinPatient | "taken" | "error"> {
  const secret = "secret" in options ? options.secret : liveSecret();
  const hashed = await bcrypt.hash(pin, options.hashRounds ?? PIN_HASH_ROUNDS);

  const write = (fields: Record<string, string>) =>
    supabase
      .from("patients")
      .update(fields)
      .eq("id", patientId)
      .is("pin", null)
      .select("id, first_name, last_name, pb_client_id")
      .single();

  // One write: the hash and its fingerprint land together or not at all.
  // (Without a server secret there is no fingerprint to write.)
  const { data, error } = await write(
    secret
      ? { pin: hashed, pin_lookup: pinFingerprint(pin, secret) }
      : { pin: hashed }
  );
  if (error?.code === "23505") return "taken";
  if (error || !data) return "error";
  return savedPatient(data);
}

// Only what the kiosk needs next — the hash and fingerprint stay here.
function savedPatient(row: SavedPinPatient): SavedPinPatient {
  return {
    id: row.id,
    first_name: row.first_name,
    last_name: row.last_name,
    pb_client_id: row.pb_client_id,
  };
}
