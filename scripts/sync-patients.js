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
  // PB returns records newest-first and paginates with a cursor:
  // before_id=<oldest id of the current page> fetches the next (older)
  // page. NOTE: after_id walks the other way (newer records) — using it
  // here re-fetches the newest page forever. skip/limit is capped at 500.
  const clients = [];
  const limit = 100;
  let beforeId = null;
  let total = null;

  while (true) {
    const params = new URLSearchParams({ limit: String(limit) });
    if (beforeId) params.set("before_id", beforeId);

    const res = await fetch(`${PB_BASE}/consultant/records?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`PB clients fetch failed: ${res.status} — ${body}`);
    }
    const data = await res.json();

    // count shrinks with the cursor window; the first page's count is the total
    if (total === null && typeof data.count === "number") total = data.count;

    const page = data.items ?? [];
    clients.push(...page);
    console.log(`Fetched ${clients.length}${total ? ` / ${total}` : ""} clients...`);

    if (!data.hasMore || page.length === 0) break;
    beforeId = page[page.length - 1].id;
  }

  return clients;
}

// Batch upsert: one request per 100 patients instead of one per patient.
// on_conflict=pb_client_id merges on the PB record id, so re-runs update
// existing rows instead of failing the unique constraint.
async function upsertPatients(supabaseUrl, serviceKey, patients) {
  const res = await fetch(
    `${supabaseUrl}/rest/v1/patients?on_conflict=pb_client_id`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(patients),
    }
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Upsert failed ${res.status}: ${body}`);
  }
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
    );
  }

  console.log("Connecting to Practice Better...");
  const token = await getPbToken();

  console.log("Fetching clients...");
  const clients = await fetchAllClients(token);

  // Dedupe by PB record id — a batch upsert fails outright if the same
  // key appears twice ("cannot affect row a second time")
  const unique = [...new Map(clients.map((c) => [c.id, c])).values()];
  if (unique.length !== clients.length) {
    console.warn(
      `Warning: ${clients.length - unique.length} duplicate records returned by PB — deduped`
    );
  }
  console.log(`Found ${unique.length} clients`);

  const rows = unique.map((client) => ({
    pb_client_id: client.id,
    first_name: client.profile?.firstName ?? "",
    last_name: client.profile?.lastName ?? "",
    email: client.profile?.emailAddress?.toLowerCase() ?? null,
    phone: client.profile?.mobilePhone ?? client.profile?.homePhone ?? null,
  }));

  let upserted = 0;
  let errors = 0;
  const batchSize = 100;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    try {
      await upsertPatients(supabaseUrl, serviceKey, batch);
      upserted += batch.length;
    } catch (batchErr) {
      // Batch failed — retry rows one at a time to isolate the bad ones
      console.warn(`Batch at ${i} failed (${batchErr.message}); retrying rows individually`);
      for (const row of batch) {
        try {
          await upsertPatients(supabaseUrl, serviceKey, [row]);
          upserted++;
        } catch (err) {
          console.error(`Error upserting client ${row.pb_client_id}:`, err.message);
          errors++;
        }
      }
    }
    console.log(`Upserted ${upserted} / ${rows.length}...`);
  }

  console.log(`Done. Upserted: ${upserted}, Errors: ${errors}`);
}

main().catch((err) => {
  console.error("Sync failed:", err);
  process.exit(1);
});
