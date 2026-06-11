require("dotenv").config({ path: ".env.local" });

const PB_BASE = "https://api.practicebetter.io";

async function getPbToken() {
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
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`PB auth failed: ${res.status} — ${body}`);
  }
  const data = await res.json();
  return data.access_token;
}

async function fetchAllClients(token) {
  const clients = [];
  let afterId = null;
  const limit = 100;

  while (true) {
    const params = new URLSearchParams({ limit: String(limit) });
    if (afterId) params.set("after_id", afterId);

    const url = `${PB_BASE}/consultant/records?${params}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`PB clients fetch failed: ${res.status} — ${body}`);
    }
    const data = await res.json();

    const page = data.items ?? [];
    clients.push(...page);

    if (!data.hasMore || page.length === 0) break;
    afterId = page[page.length - 1].id;
  }

  return clients;
}

async function upsertPatient(supabaseUrl, serviceKey, patient) {
  const res = await fetch(`${supabaseUrl}/rest/v1/patients`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(patient),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Upsert failed ${res.status}: ${body}`);
  }
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  console.log("Connecting to Practice Better...");
  const token = await getPbToken();

  console.log("Fetching clients...");
  const clients = await fetchAllClients(token);
  console.log(`Found ${clients.length} clients`);

  let upserted = 0;
  let errors = 0;

  for (const client of clients) {
    try {
      await upsertPatient(supabaseUrl, serviceKey, {
        pb_client_id: client.id,
        first_name: client.profile?.firstName ?? "",
        last_name: client.profile?.lastName ?? "",
        email: client.profile?.emailAddress ?? null,
        phone: client.profile?.mobilePhone ?? client.profile?.homePhone ?? null,
      });
      upserted++;
    } catch (err) {
      console.error(`Error upserting client ${client.id}:`, err.message);
      errors++;
    }
  }

  console.log(`Done. Upserted: ${upserted}, Errors: ${errors}`);
}

main().catch((err) => {
  console.error("Sync failed:", err);
  process.exit(1);
});
