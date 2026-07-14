// One-time setup: registers the Practice Better webhook subscription.
// Prerequisites:
//   1. Generate a token: openssl rand -hex 32
//   2. Set PB_WEBHOOK_VERIFICATION_TOKEN in .env.local AND in production env
//   3. Deploy the site so /api/webhooks/practice-better is live
//   4. Run: node scripts/setup-pb-webhook.js [endpointUrl]
// PB verifies the endpoint live during this call, then returns the signing
// secret exactly once — store it as PB_WEBHOOK_SIGNING_SECRET.
require("dotenv").config({ path: ".env.local" });

const PB_BASE = "https://api.practicebetter.io";
const ENDPOINT_URL =
  process.argv[2] ??
  "https://www.ryuacupuncture.com/api/webhooks/practice-better";

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

async function main() {
  const verificationToken = process.env.PB_WEBHOOK_VERIFICATION_TOKEN;
  if (!verificationToken) {
    console.error(
      "PB_WEBHOOK_VERIFICATION_TOKEN is not set in .env.local.\n" +
        "Generate one (openssl rand -hex 32), set it locally AND in the\n" +
        "production environment, deploy, then re-run this script."
    );
    process.exit(1);
  }

  console.log(`Registering webhook for ${ENDPOINT_URL} ...`);
  const token = await getPbToken();

  const res = await fetch(`${PB_BASE}/webhooks/subscription`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      endpointUrl: ENDPOINT_URL,
      eventTypes: ["client.record.created", "client.record.updated"],
      verificationToken,
      description: "ryuacupuncture.com kiosk patient sync",
    }),
  });

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    console.error(`Subscription failed: ${res.status}`);
    console.error(JSON.stringify(body, null, 2));
    console.error(
      "A 400 usually means endpoint verification failed — confirm the\n" +
        "route is deployed and PB_WEBHOOK_VERIFICATION_TOKEN matches in prod."
    );
    process.exit(1);
  }

  console.log(`Subscription created: ${body.id} (status: ${body.status})`);
  console.log("");
  console.log("SIGNING SECRET — shown only once, store it now:");
  console.log("");
  console.log(`  PB_WEBHOOK_SIGNING_SECRET=${body.plaintextSigningSecret}`);
  console.log("");
  console.log("Add it to .env.local and the production environment.");
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
