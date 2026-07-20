export const PB_BASE = "https://api.practicebetter.io";
export const CLINIC_TZ = "America/Los_Angeles";

export async function getPbToken(): Promise<string> {
  if (!process.env.PB_CLIENT_ID || !process.env.PB_CLIENT_SECRET) {
    throw new Error("PB credentials not configured");
  }
  const res = await fetch(`${PB_BASE}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: process.env.PB_CLIENT_ID,
      client_secret: process.env.PB_CLIENT_SECRET,
      scope: "read",
    }),
  });
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

/**
 * Earliest non-cancelled Practice Better session for a client today
 * (clinic-local date), or null if none / the fetch fails.
 */
export async function fetchTodaySession(
  pbClientId: string
): Promise<PbSessionInfo | null> {
  const token = await getPbToken();
  // Clinic-local date — server may run in UTC
  const now = new Date();
  const today = now.toLocaleDateString("en-CA", { timeZone: CLINIC_TZ });
  // PB's date filters compare full timestamps (spec example:
  // 1970-01-01T12:30:00-04:00), so a bare YYYY-MM-DD date_eq only matches
  // sessions at exactly midnight. Query the whole clinic-local day instead.
  const offset =
    new Intl.DateTimeFormat("en-US", {
      timeZone: CLINIC_TZ,
      timeZoneName: "longOffset",
    })
      .formatToParts(now)
      .find((p) => p.type === "timeZoneName")
      ?.value.replace("GMT", "") || "-08:00";

  const params = new URLSearchParams({
    records: pbClientId,
    date_gte: `${today}T00:00:00${offset}`,
    date_lte: `${today}T23:59:59${offset}`,
  });
  const res = await fetch(`${PB_BASE}/consultant/sessions?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
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
  const res = await fetch(
    `${PB_BASE}/consultant/records/${encodeURIComponent(recordId)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`PB record fetch failed: ${res.status}`);
  return (await res.json()) as PbClientRecord;
}
