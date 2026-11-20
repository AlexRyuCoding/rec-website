import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DISPLAY_COOKIE,
  DISPLAY_COOKIE_MAX_AGE_S,
  isApprovable,
  parseDisplayCookie,
  verifySecret,
} from "./display-auth";

// Database side of waiting-room screen pairing (see display-auth.ts).

export type DisplayAuth =
  | { status: "ok" }
  // Paired cookie exists but staff have not typed the code in yet.
  | { status: "pending"; code: string }
  // No usable pairing: missing/garbled cookie, unknown or revoked screen,
  // wrong secret, or a code that expired unapproved. The screen re-pairs.
  | { status: "none" }
  // The database could not be asked. Deliberately distinct from "none":
  // "none" makes the TV request a new pairing, which replaces its cookie,
  // so a database blip reported as "none" would cost a working screen its
  // pairing. On "error" the screen just retries.
  | { status: "error" };

const LAST_SEEN_INTERVAL_MS = 60_000;

export async function authorizeDisplay(
  supabase: SupabaseClient,
  cookieValue: string | undefined,
  nowMs: number
): Promise<DisplayAuth> {
  const parsed = parseDisplayCookie(cookieValue);
  if (!parsed) return { status: "none" };

  const { data: row, error } = await supabase
    .from("display_devices")
    .select(
      "id, code, secret_hash, created_at, approved_at, revoked_at, last_seen_at"
    )
    .eq("id", parsed.id)
    .maybeSingle();
  if (error) return { status: "error" };
  if (!row) return { status: "none" };
  if (!verifySecret(parsed.secret, row.secret_hash)) return { status: "none" };
  if (row.revoked_at !== null) return { status: "none" };

  if (row.approved_at === null) {
    return isApprovable(row, nowMs)
      ? { status: "pending", code: row.code }
      : { status: "none" };
  }

  // "Last seen" on the dashboard tells staff a screen is alive; once a
  // minute is plenty and keeps the polling endpoint nearly read-only.
  const lastSeenMs = row.last_seen_at ? Date.parse(row.last_seen_at) : 0;
  if (nowMs - lastSeenMs > LAST_SEEN_INTERVAL_MS) {
    await supabase
      .from("display_devices")
      .update({ last_seen_at: new Date(nowMs).toISOString() })
      .eq("id", row.id);
  }
  return { status: "ok" };
}

export const displayCookieOptions = {
  name: DISPLAY_COOKIE,
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: DISPLAY_COOKIE_MAX_AGE_S,
};
