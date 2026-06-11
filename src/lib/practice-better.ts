export const PB_BASE = "https://api.practicebetter.io";

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
