const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.local" });

const PB_BASE = "https://api.practicebetter.io/v1";

async function getPbToken() {
  const res = await fetch(`${PB_BASE}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: process.env.PB_CLIENT_ID,
      client_secret: process.env.PB_CLIENT_SECRET,
    }),
  });
  if (!res.ok) throw new Error(`PB auth failed: ${res.status}`);
  const data = await res.json();
  return data.access_token;
}

async function fetchAllClients(token) {
  const clients = [];
  let url = `${PB_BASE}/clients`;

  while (url) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`PB clients fetch failed: ${res.status}`);
    const data = await res.json();

    // Adjust the key below to match the actual PB response shape.
    const page = data.data ?? data.clients ?? [];
    clients.push(...page);

    // Handle pagination — adjust to actual PB pagination mechanism.
    url = data.meta?.next_page_url ?? data.links?.next ?? null;
  }

  return clients;
}

async function main() {
  console.log("Connecting to Practice Better...");
  const token = await getPbToken();

  console.log("Fetching clients...");
  const clients = await fetchAllClients(token);
  console.log(`Found ${clients.length} clients`);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  let upserted = 0;
  let errors = 0;

  for (const client of clients) {
    const { error } = await supabase.from("patients").upsert(
      {
        pb_client_id: client.id,
        first_name: client.first_name ?? "",
        last_name: client.last_name ?? "",
        email: client.email ?? null,
        phone: client.phone ?? null,
      },
      { onConflict: "pb_client_id", ignoreDuplicates: false }
    );

    if (error) {
      console.error(`Error upserting client ${client.id}:`, error.message);
      errors++;
    } else {
      upserted++;
    }
  }

  console.log(`Done. Upserted: ${upserted}, Errors: ${errors}`);
}

main().catch((err) => {
  console.error("Sync failed:", err);
  process.exit(1);
});
