// The sign-in rows of the staff audit log: who signed in, who pressed
// Sign out, and which Google account that is not staff tried to sign in.
// Called from the NextAuth configuration (auth.ts). The rules — names,
// the cleaning of an address, how many refused rows — are in audit-log.ts.
//
// Signing in used to touch no database at all. Nothing here may change
// that for the person signing in: every function below always resolves,
// never throws, and gives up waiting after SIGNIN_LOG_TIMEOUT_MS. If the
// row cannot be written the sign-in (or the refusal) happens just the
// same, and one line in the server log says what kind of error it was —
// never the address.

import type { SupabaseClient } from "@supabase/supabase-js";
import { isAllowedAdminEmail } from "./admin-allowlist";
import {
  REFUSED_DETAIL,
  REFUSED_PER_HOUR,
  REFUSED_WINDOW_MS,
  refusedRowVerdict,
  signInAddress,
  StaffAction,
} from "./audit-log";
import { recordStaffAction } from "./audit-server";
import { errorLabel } from "./error-label";
import { sessionDayOver } from "./staff-session";
import { createServiceClient } from "./supabase";

// How long a sign-in waits for its row. A write takes a few hundredths of
// a second; a database that has not answered by now is not going to be
// waited for at the login screen.
export const SIGNIN_LOG_TIMEOUT_MS = 3000;

type GetDb = () => SupabaseClient;

class LogTimeout extends Error {
  name = "Timeout";
}

async function withoutBlocking(
  action: StaffAction,
  work: () => Promise<void>
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      work(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new LogTimeout()),
          SIGNIN_LOG_TIMEOUT_MS
        );
      }),
    ]);
  } catch (error) {
    console.error("audit log write failed:", action, errorLabel(error));
  } finally {
    clearTimeout(timer);
  }
}

// A staff member signed in with Google (NextAuth's signIn event: it runs
// only after the allowlist let the account through).
export function recordSignIn(
  email: unknown,
  getDb: GetDb = createServiceClient
): Promise<void> {
  return withoutBlocking("staff_signin", () =>
    recordStaffAction(getDb(), {
      staffEmail: signInAddress(email),
      action: "staff_signin",
      patientIds: [],
    })
  );
}

// Sign out was pressed (NextAuth's signOut event, which hands over the
// sign-in token the browser still held). A row is written only if that
// token was a working staff sign-in at that moment: on the staff list,
// and not from a day that has already ended. A sign-in that merely runs
// out at 3 am is not a sign-out and never comes through here.
export function recordSignOut(
  token: { email?: unknown; dayEnd?: unknown } | null | undefined,
  nowMs: number,
  getDb: GetDb = createServiceClient
): Promise<void> {
  const email = token?.email;
  if (
    typeof email !== "string" ||
    !isAllowedAdminEmail(email) ||
    sessionDayOver(token?.dayEnd, nowMs)
  ) {
    return Promise.resolve();
  }
  return withoutBlocking("staff_signout", () =>
    recordStaffAction(getDb(), {
      staffEmail: signInAddress(email),
      action: "staff_signout",
      patientIds: [],
    })
  );
}

// Refusals are looked back on and written ONE AT A TIME on this server:
// "read the last hour, then write" is two steps, and a burst arriving
// together would otherwise each read an empty hour and each write (200
// at once wrote 200 rows — found in review, 2026-11-23). Held per server
// instance, of which there are at most three; a limit across instances
// would need the count and the write in one database function.
let refusedInTurn: Promise<void> = Promise.resolve();

// A Google account that is not on the staff list tried to sign in and was
// refused. Anyone can cause this, so the row is bounded (refusedRowVerdict):
// if the look-back cannot be made, nothing is written. (A staff view that
// repeats is written when in doubt — recordStaffActionOnce — but staff
// cause those; strangers cause these.)
export function recordSignInRefused(
  email: unknown,
  nowMs: number,
  getDb: GetDb = createServiceClient
): Promise<void> {
  const turn = refusedInTurn.then(() => writeRefusedRow(email, nowMs, getDb));
  refusedInTurn = turn;
  return turn;
}

function writeRefusedRow(
  email: unknown,
  nowMs: number,
  getDb: GetDb
): Promise<void> {
  return withoutBlocking("signin_refused", async () => {
    const db = getDb();
    const address = signInAddress(email);
    const { data, error } = await db
      .from("staff_audit_log")
      .select("staff_email, at")
      .eq("action", "signin_refused")
      .gte("at", new Date(nowMs - REFUSED_WINDOW_MS).toISOString())
      .order("at", { ascending: false })
      .limit(REFUSED_PER_HOUR);
    if (error) {
      console.error(
        "refused sign-in not recorded: the limit could not be checked,",
        errorLabel(error)
      );
      return;
    }
    const verdict = refusedRowVerdict(data ?? [], address, nowMs);
    if (verdict === "full") {
      console.error(
        "refused sign-in not recorded: the hour's limit is reached"
      );
    }
    if (verdict !== "write") return;
    await recordStaffAction(db, {
      staffEmail: address,
      action: "signin_refused",
      patientIds: [],
      detail: REFUSED_DETAIL,
    });
  });
}
