// Step 1 of pairing a device (waiting-room TV or check-in kiosk): the
// device asks for a code to show. The same steps for both kinds, each in
// its own table. Step 2 — staff typing the code in the dashboard — is
// /api/admin/displays/approve.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DeviceKind,
  DEVICES,
  formatDisplayCookie,
  generatePairCode,
  generateSecret,
  hashSecret,
  PAIR_MAX_PER_HOUR,
} from "./display-auth";
import { authorizeDisplay } from "./display-server";

const PENDING_RETENTION_MS = 24 * 60 * 60 * 1000;

export type PairingReply =
  // This device already holds an approved pairing.
  | { status: "paired" }
  // It is waiting for staff to type this code in.
  | { status: "pending"; code: string }
  // A new pairing: show the code, and set this cookie on the device.
  | { status: "created"; code: string; cookie: string }
  // Too many requests from this address, or the count could not be read.
  | { status: "limited" }
  // unknown: can't tell whether the device is already paired — a new
  //   pairing now would overwrite a possibly good cookie.
  // failed: the new pairing could not be written.
  | { status: "error"; reason: "unknown" | "failed" };

// Public by necessity (the device has no credentials yet), so:
// - it grants nothing by itself — the pairing is useless until a
//   signed-in staff member approves the code on the dashboard
// - it is rate limited per IP and fails closed, like the public forms
// - a device that already holds a live pairing keeps it: reloading the
//   page must not mint codes
export async function requestPairing(
  supabase: SupabaseClient,
  kind: DeviceKind,
  cookieValue: string | undefined,
  ip: string,
  nowMs: number
): Promise<PairingReply> {
  const table = DEVICES[kind].table;

  const existing = await authorizeDisplay(supabase, cookieValue, nowMs, kind);
  if (existing.status === "error")
    return { status: "error", reason: "unknown" };
  if (existing.status === "ok") return { status: "paired" };
  if (existing.status === "pending") {
    return { status: "pending", code: existing.code };
  }

  const hourAgo = new Date(nowMs - 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("created_ip", ip)
    .gte("created_at", hourAgo);
  if (countError || count === null || count >= PAIR_MAX_PER_HOUR) {
    return { status: "limited" };
  }

  // Codes nobody approved are clutter after a day.
  await supabase
    .from(table)
    .delete()
    .is("approved_at", null)
    .lt("created_at", new Date(nowMs - PENDING_RETENTION_MS).toISOString());

  const code = generatePairCode();
  const secret = generateSecret();
  const { data, error } = await supabase
    .from(table)
    .insert({ code, secret_hash: hashSecret(secret), created_ip: ip })
    .select("id")
    .single();
  if (error || !data) return { status: "error", reason: "failed" };

  return {
    status: "created",
    code,
    cookie: formatDisplayCookie(data.id, secret),
  };
}
