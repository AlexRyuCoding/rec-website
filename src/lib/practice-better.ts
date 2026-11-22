export const PB_BASE = "https://api.practicebetter.io";
import { CLINIC_TZ } from "./clinic-time";
import { fetchWithTimeout } from "./fetch-timeout";

export { CLINIC_TZ };

// Every call here gives up after this long. A Practice Better request
// that never settles would otherwise hold a kiosk check-in (which waits
// for the appointment snapshot) until the platform kills the function;
// with a limit it fails open in a few seconds, as it does for an outage.
// One check-in makes two calls (token, then sessions), so the worst case
// is twice this.
export const PB_TIMEOUT_MS = 5_000;
// A page of 100 client records for the bulk sync is a bigger answer.
export const PB_LIST_TIMEOUT_MS = 20_000;

export async function getPbToken(): Promise<string> {
  if (!process.env.PB_CLIENT_ID || !process.env.PB_CLIENT_SECRET) {
    throw new Error("PB credentials not configured");
  }
  const res = await fetchWithTimeout(
    `${PB_BASE}/oauth2/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: process.env.PB_CLIENT_ID,
        client_secret: process.env.PB_CLIENT_SECRET,
        scope: "read",
      }),
    },
    PB_TIMEOUT_MS
  );
  if (!res.ok) throw new Error("Failed to get Practice Better token");
  const data = await res.json();
  return data.access_token as string;
}

// Per the OpenAPI spec (api-docs.practicebetter.io/swagger.json):
// ClientSession.service is a ProfessionalService whose display name is .name
interface PbSession {
  sessionDate?: string;
  cancelled?: boolean;
  service?: { name?: string };
  consultant?: {
    profile?: { firstName?: string; lastName?: string };
  };
}

export interface PbSessionInfo {
  /** ISO timestamp of the session start */
  sessionDate: string;
  practitioner: string | null;
  serviceName: string | null;
}

// The clinic's calendar day containing `now`, as Practice Better wants
// it asked for. PB's date filters compare full timestamps (spec example:
// 1970-01-01T12:30:00-04:00), so a bare YYYY-MM-DD date_eq only matches
// sessions at exactly midnight: the whole clinic-local day is queried
// instead. The server may run in UTC, so the day and its UTC offset are
// worked out in the clinic's timezone.
export function clinicDayBounds(now: Date): {
  // YYYY-MM-DD
  day: string;
  gte: string;
  lte: string;
  // The day's first moment, as a UTC timestamp (for our own tables).
  startIso: string;
} {
  const day = now.toLocaleDateString("en-CA", { timeZone: CLINIC_TZ });
  const offset =
    new Intl.DateTimeFormat("en-US", {
      timeZone: CLINIC_TZ,
      timeZoneName: "longOffset",
    })
      .formatToParts(now)
      .find((p) => p.type === "timeZoneName")
      ?.value.replace("GMT", "") || "-08:00";
  const gte = `${day}T00:00:00${offset}`;
  return {
    day,
    gte,
    lte: `${day}T23:59:59${offset}`,
    startIso: new Date(gte).toISOString(),
  };
}

/**
 * Earliest non-cancelled Practice Better session for a client today
 * (clinic-local date), or null if none / the fetch fails.
 */
export async function fetchTodaySession(
  pbClientId: string
): Promise<PbSessionInfo | null> {
  const token = await getPbToken();
  const { day: today, gte, lte } = clinicDayBounds(new Date());

  const params = new URLSearchParams({
    records: pbClientId,
    date_gte: gte,
    date_lte: lte,
  });
  const res = await fetchWithTimeout(
    `${PB_BASE}/consultant/sessions?${params}`,
    { headers: { Authorization: `Bearer ${token}` } },
    PB_TIMEOUT_MS
  );
  if (!res.ok) {
    console.error("PB sessions fetch failed:", res.status);
    return null;
  }

  const data = await res.json();
  const sessions = ((data.items ?? []) as PbSession[])
    .filter(
      (s) =>
        !s.cancelled &&
        s.sessionDate &&
        // belt and suspenders on the range query above
        new Date(s.sessionDate).toLocaleDateString("en-CA", {
          timeZone: CLINIC_TZ,
        }) === today
    )
    .sort((a, b) => a.sessionDate!.localeCompare(b.sessionDate!));
  if (sessions.length === 0) return null;

  const appt = sessions[0];
  const profile = appt.consultant?.profile;
  return {
    sessionDate: appt.sessionDate!,
    practitioner: profile
      ? `${profile.firstName ?? ""} ${profile.lastName ?? ""}`.trim() || null
      : null,
    serviceName: appt.service?.name ?? null,
  };
}

export interface PbClientRecord {
  id: string;
  profile?: {
    firstName?: string;
    lastName?: string;
    emailAddress?: string;
    mobilePhone?: string;
    homePhone?: string;
  };
}

export async function fetchClientRecord(
  recordId: string
): Promise<PbClientRecord | null> {
  const token = await getPbToken();
  const res = await fetchWithTimeout(
    `${PB_BASE}/consultant/records/${encodeURIComponent(recordId)}`,
    { headers: { Authorization: `Bearer ${token}` } },
    PB_TIMEOUT_MS
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`PB record fetch failed: ${res.status}`);
  return (await res.json()) as PbClientRecord;
}

// How many sessions Practice Better returns at most per request.
const SESSIONS_PAGE_LIMIT = 100;
// A clinic day is one page; the cap is only there so a surprise in the
// paging can never turn one refresh into a stream of requests.
const SESSIONS_MAX_PAGES = 4;

/**
 * Every Practice Better session of the clinic's day containing `now`, all
 * clients — the raw items, to be read with parsePbSessions (expected.ts).
 * `complete` is false if there were more than could be fetched. Throws if
 * Practice Better cannot be reached or refuses.
 *
 * Costs one token request plus one request per 100 sessions; callers go
 * through the shared cache in expected-server.ts, never straight here.
 */
export async function fetchDaySessionItems(
  now: Date
): Promise<{ items: unknown[]; complete: boolean }> {
  const token = await getPbToken();
  const { gte, lte } = clinicDayBounds(now);
  const items: unknown[] = [];
  const seen = new Set<string>();
  let cursor: string | null = null;

  for (let page = 0; page < SESSIONS_MAX_PAGES; page++) {
    const params = new URLSearchParams({
      date_gte: gte,
      date_lte: lte,
      limit: String(SESSIONS_PAGE_LIMIT),
    });
    if (cursor) params.set("before_id", cursor);
    const res = await fetchWithTimeout(
      `${PB_BASE}/consultant/sessions?${params}`,
      { headers: { Authorization: `Bearer ${token}` } },
      PB_LIST_TIMEOUT_MS
    );
    if (!res.ok) throw new Error(`PB day sessions fetch failed: ${res.status}`);
    const data = (await res.json()) as { items?: unknown[]; hasMore?: boolean };

    let added = 0;
    let lastId: string | null = null;
    for (const item of data.items ?? []) {
      const id = (item as { id?: unknown } | null)?.id;
      if (typeof id !== "string" || seen.has(id)) continue;
      seen.add(id);
      items.push(item);
      lastId = id;
      added++;
    }
    if (!data.hasMore) return { items, complete: true };
    // More to come, but this page brought nothing new: the cursor is not
    // moving (records taught us before_id / after_id walk opposite ways).
    // Stop rather than ask for the same page again.
    if (added === 0 || !lastId) return { items, complete: false };
    cursor = lastId;
  }
  return { items, complete: false };
}
