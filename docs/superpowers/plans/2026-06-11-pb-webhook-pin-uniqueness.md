# PB Webhook + PIN Uniqueness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** New Practice Better patients flow into Supabase automatically via webhook, and every kiosk PIN is guaranteed unique.

**Architecture:** A signed webhook receiver at `/api/webhooks/practice-better` handles PB's verification handshake (GET) and `client.record.created` events (POST), fetching the full client record from the PB API and upserting into Supabase. A one-time script registers the subscription. The `setup-pin` PATCH gains a bcrypt-compare uniqueness guard, surfaced in the keypad UI as a 409. Shared PB auth logic moves to `src/lib/practice-better.ts`.

**Tech Stack:** Next.js App Router route handlers, Node `crypto` (HMAC-SHA256), `@supabase/supabase-js` service client, bcryptjs, plain Node script for registration.

**Verification:** The repo has no test framework (approved in spec) — each task verifies via `npx tsc --noEmit` / `npm run build` and manual curl with computed signatures.

**Schema facts (from the PB swagger doc, do not re-guess):**
- OAuth: `POST https://api.practicebetter.io/oauth2/token`, form-encoded `grant_type=client_credentials`, `scope=read`. `read` scope is sufficient for all endpoints used here, including webhook subscription creation.
- Client records: `GET /consultant/records/{recordId}` → `ClientRecord` with `id` (the record ID — this is what sessions filter by, so it is what we store as `pb_client_id`) and `profile` (`firstName`, `lastName`, `emailAddress`, `mobilePhone`, `homePhone`).
- Sessions: `GET /consultant/sessions?records=<recordId>&date_eq=YYYY-MM-DD` → `{ count, hasMore, items: ClientSession[] }`; each item has `sessionDate` (ISO date-time), `cancelled` (bool), `consultant.profile.firstName/lastName`.
- Webhook handshake: PB sends `GET <endpoint>?challenge=X&verification_token=Y`; respond 200 `{ "challenge": X, "timestamp": <unix seconds> }`.
- Event POSTs carry `PB-Signature: t=<unix>,v1=<hex>` where `v1 = HMAC-SHA256(secret, "<t>.<rawBody>")`; reject if |now−t| > 300s.

---

### Task 1: Shared Practice Better helper

**Files:**
- Create: `src/lib/practice-better.ts`

- [ ] **Step 1: Write the helper**

```ts
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
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/practice-better.ts
git commit -m "feat: add shared Practice Better API helper"
```

---

### Task 2: Fix sync script field extraction

**Files:**
- Modify: `scripts/sync-patients.js` (the upsert loop in `main()`)

The script currently maps `client.first_name` etc., but `/consultant/records` items are `ClientRecord` objects: names live under `profile`, and `id` is the record ID.

- [ ] **Step 1: Replace the per-client upsert payload**

In the `for (const client of clients)` loop, replace the object passed to `upsertPatient` with:

```js
      await upsertPatient(supabaseUrl, serviceKey, {
        pb_client_id: client.id,
        first_name: client.profile?.firstName ?? "",
        last_name: client.profile?.lastName ?? "",
        email: client.profile?.emailAddress ?? null,
        phone: client.profile?.mobilePhone ?? client.profile?.homePhone ?? null,
      });
```

- [ ] **Step 2: Syntax check**

Run: `node --check scripts/sync-patients.js`
Expected: no output (success)

- [ ] **Step 3: Commit**

```bash
git add scripts/sync-patients.js
git commit -m "fix: extract patient fields from ClientRecord profile shape"
```

---

### Task 3: Fix today's-appointments route to use /consultant/sessions

**Files:**
- Modify: `src/app/api/appointments/today/route.ts` (full rewrite)

The route still queries a nonexistent `/appointments?client_id=` endpoint. Real endpoint filters by client **record** IDs.

- [ ] **Step 1: Rewrite the route**

```ts
import { NextResponse } from "next/server";
import { PB_BASE, getPbToken } from "@/lib/practice-better";

interface PbSession {
  sessionDate?: string;
  cancelled?: boolean;
  consultant?: {
    profile?: { firstName?: string; lastName?: string };
  };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const pb_client_id = searchParams.get("pb_client_id");

  if (!pb_client_id) {
    return NextResponse.json(
      { error: "pb_client_id required" },
      { status: 400 }
    );
  }

  try {
    const token = await getPbToken();
    // Clinic-local date — server may run in UTC
    const today = new Date().toLocaleDateString("en-CA", {
      timeZone: "America/Los_Angeles",
    });

    const params = new URLSearchParams({
      records: pb_client_id,
      date_eq: today,
    });
    const res = await fetch(`${PB_BASE}/consultant/sessions?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      console.error("PB sessions fetch failed:", res.status);
      return NextResponse.json({ appointment: null });
    }

    const data = await res.json();
    const sessions = ((data.items ?? []) as PbSession[])
      .filter((s) => !s.cancelled && s.sessionDate)
      .sort((a, b) => a.sessionDate!.localeCompare(b.sessionDate!));

    if (sessions.length === 0) {
      return NextResponse.json({ appointment: null });
    }

    const appt = sessions[0];
    const profile = appt.consultant?.profile;
    const practitionerName = profile
      ? `${profile.firstName ?? ""} ${profile.lastName ?? ""}`.trim() || null
      : null;

    const appointmentTime = new Date(appt.sessionDate!).toLocaleTimeString(
      "en-US",
      {
        hour: "numeric",
        minute: "2-digit",
        timeZone: "America/Los_Angeles",
      }
    );

    return NextResponse.json({
      appointment: {
        time: appointmentTime,
        practitioner: practitionerName,
      },
    });
  } catch (err) {
    console.error("Appointments fetch error:", err);
    return NextResponse.json({ appointment: null });
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/app/api/appointments/today/route.ts
git commit -m "fix: query PB consultant/sessions for today's appointment"
```

---

### Task 4: Webhook receiver route

**Files:**
- Create: `src/app/api/webhooks/practice-better/route.ts`

Note: `src/middleware.ts` matcher is `/admin/:path*`, so this route is publicly reachable — auth is the verification token (GET) and HMAC signature (POST). No patient data is logged anywhere in this handler.

- [ ] **Step 1: Write the route**

```ts
import { NextResponse } from "next/server";
import crypto from "crypto";
import { createServiceClient } from "@/lib/supabase";
import { fetchClientRecord } from "@/lib/practice-better";

// One-time endpoint verification handshake from Practice Better
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const challenge = searchParams.get("challenge");
  const token = searchParams.get("verification_token");
  const expected = process.env.PB_WEBHOOK_VERIFICATION_TOKEN;

  if (!expected || !challenge || token !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    challenge,
    timestamp: Math.floor(Date.now() / 1000),
  });
}

// PB-Signature: t=<unix seconds>,v1=<hex hmac of "<t>.<rawBody>">
function isValidSignature(
  header: string | null,
  rawBody: string,
  secret: string
): boolean {
  if (!header) return false;
  const parts = new Map(
    header.split(",").map((p) => p.split("=", 2) as [string, string])
  );
  const timestamp = parts.get("t");
  const signature = parts.get("v1");
  if (!timestamp || !signature) return false;

  const now = Math.floor(Date.now() / 1000);
  const ts = parseInt(timestamp, 10);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > 300) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  return (
    sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf)
  );
}

// The swagger doc doesn't define the event envelope, so check the
// plausible field names for the record ID.
function extractRecordId(event: Record<string, unknown>): string | null {
  const data = event.data as Record<string, unknown> | undefined;
  const resource = event.resource as Record<string, unknown> | undefined;
  const candidate =
    event.resourceId ?? event.resource_id ?? data?.id ?? resource?.id;
  return typeof candidate === "string" && candidate.length > 0
    ? candidate
    : null;
}

export async function POST(req: Request) {
  const secret = process.env.PB_WEBHOOK_SIGNING_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Webhook not configured" },
      { status: 500 }
    );
  }

  const rawBody = await req.text();
  if (!isValidSignature(req.headers.get("pb-signature"), rawBody, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const eventType = (event.eventType ??
    event.event_type ??
    event.type) as string | undefined;
  if (eventType !== "client.record.created") {
    return NextResponse.json({ received: true });
  }

  const recordId = extractRecordId(event);
  if (!recordId) {
    return NextResponse.json({ error: "Missing record id" }, { status: 400 });
  }

  try {
    const record = await fetchClientRecord(recordId);
    if (!record) {
      // Record deleted between event and fetch — nothing to sync
      return NextResponse.json({ received: true });
    }

    const supabase = createServiceClient();
    const { error } = await supabase.from("patients").upsert(
      {
        pb_client_id: record.id,
        first_name: record.profile?.firstName ?? "",
        last_name: record.profile?.lastName ?? "",
        email: record.profile?.emailAddress ?? null,
        phone:
          record.profile?.mobilePhone ?? record.profile?.homePhone ?? null,
      },
      { onConflict: "pb_client_id" }
    );
    if (error) {
      console.error("Webhook upsert failed:", error.code);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    // 500 → Practice Better retries delivery
    console.error("Webhook processing error:", err);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Manual signature verification against dev server**

Requires `PB_WEBHOOK_VERIFICATION_TOKEN` and `PB_WEBHOOK_SIGNING_SECRET` set to any test values in `.env.local`, dev server running (`npm run dev`).

```bash
# Handshake: valid token → 200 echoing challenge
curl -s "http://localhost:3000/api/webhooks/practice-better?challenge=abc123&verification_token=$PB_WEBHOOK_VERIFICATION_TOKEN"
# Expected: {"challenge":"abc123","timestamp":<now>}

# Handshake: wrong token → 401
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/api/webhooks/practice-better?challenge=abc123&verification_token=wrong"
# Expected: 401

# Event: valid signature, ignored event type → 200 {"received":true}
BODY='{"eventType":"invoice.paid","resourceId":"x"}'
TS=$(date +%s)
SIG=$(node -e "const c=require('crypto');console.log(c.createHmac('sha256',process.argv[1]).update(process.argv[2]+'.'+process.argv[3]).digest('hex'))" "$PB_WEBHOOK_SIGNING_SECRET" "$TS" "$BODY")
curl -s -X POST http://localhost:3000/api/webhooks/practice-better \
  -H "Content-Type: application/json" \
  -H "PB-Signature: t=$TS,v1=$SIG" -d "$BODY"
# Expected: {"received":true}

# Event: bad signature → 401
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/webhooks/practice-better \
  -H "PB-Signature: t=$TS,v1=deadbeef" -d "$BODY"
# Expected: 401

# Event: stale timestamp → 401
OLD=$((TS - 600))
OLDSIG=$(node -e "const c=require('crypto');console.log(c.createHmac('sha256',process.argv[1]).update(process.argv[2]+'.'+process.argv[3]).digest('hex'))" "$PB_WEBHOOK_SIGNING_SECRET" "$OLD" "$BODY")
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/webhooks/practice-better \
  -H "PB-Signature: t=$OLD,v1=$OLDSIG" -d "$BODY"
# Expected: 401
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/webhooks/practice-better/route.ts
git commit -m "feat: add signed Practice Better webhook receiver"
```

---

### Task 5: Webhook registration script

**Files:**
- Create: `scripts/setup-pb-webhook.js`

- [ ] **Step 1: Write the script**

```js
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
      eventTypes: ["client.record.created"],
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
```

- [ ] **Step 2: Syntax check**

Run: `node --check scripts/setup-pb-webhook.js`
Expected: no output (success)

- [ ] **Step 3: Verify the missing-token guard**

Run: `node -e "delete process.env.PB_WEBHOOK_VERIFICATION_TOKEN" && PB_WEBHOOK_VERIFICATION_TOKEN= node scripts/setup-pb-webhook.js`
Expected: prints the "PB_WEBHOOK_VERIFICATION_TOKEN is not set" guidance and exits 1. (Do NOT run the script with a real token until the route is deployed.)

- [ ] **Step 4: Commit**

```bash
git add scripts/setup-pb-webhook.js
git commit -m "feat: add one-time PB webhook registration script"
```

---

### Task 6: PIN uniqueness guard

**Files:**
- Modify: `src/app/api/patients/setup-pin/route.ts` (PATCH handler)

- [ ] **Step 1: Add the duplicate check before hashing/saving**

In the `PATCH` handler, after input validation and before `bcrypt.hash`, insert:

```ts
  const supabase = createServiceClient();

  // PIN lookup is by PIN alone, so each PIN must map to exactly one patient
  const { data: existing, error: pinFetchError } = await supabase
    .from("patients")
    .select("id, pin")
    .not("pin", "is", null)
    .neq("id", patient_id);

  if (pinFetchError) {
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  for (const other of existing ?? []) {
    if (await bcrypt.compare(pin, other.pin!)) {
      return NextResponse.json(
        { error: "That PIN is already taken — please choose a different one." },
        { status: 409 }
      );
    }
  }

  const hashed = await bcrypt.hash(pin, 8);
```

and delete the now-duplicated lines below (`const hashed = await bcrypt.hash(pin, 8);` and `const supabase = createServiceClient();` from the original).

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/app/api/patients/setup-pin/route.ts
git commit -m "feat: reject duplicate PINs at setup"
```

---

### Task 7: Keypad handles duplicate-PIN 409

**Files:**
- Modify: `src/components/signin-keypad.tsx`

A 409 should send the patient back to PIN creation (keeping their looked-up identity), not the dead-end error screen whose "Try Again" wipes everything. The `new_pin_create` screen must also actually display `errorMessage` — today the "PINs don't match" message is set but never rendered.

- [ ] **Step 1: Handle 409 in `submitNewPin`**

In `submitNewPin`, replace the `if (!res.ok) { ... }` block with:

```ts
      if (!res.ok) {
        if (res.status === 409) {
          setErrorMessage(
            data.error ??
              "That PIN is already taken — please choose a different one."
          );
          setNewPin("");
          setConfirmPin("");
          setScreen("new_pin_create");
          return;
        }
        setErrorMessage(
          data.error ?? "Failed to save PIN. Please see the front desk."
        );
        setScreen("error");
        return;
      }
```

- [ ] **Step 2: Clear stale message on new input and on contact-lookup success**

In `handleNewPinDigit`, at the top of the `new_pin_create` branch, clear the message when the patient starts a fresh PIN:

```ts
    if (screen === "new_pin_create" && newPin.length < 4) {
      if (newPin.length === 0) setErrorMessage("");
      const next = newPin + digit;
```

In `handleContactSubmit`, in the success branch (the final `else`), add `setErrorMessage("");` before `setScreen("new_pin_create");`.

- [ ] **Step 3: Render the message on the PIN-creation screen**

In the `new_pin_create` / `new_pin_confirm` JSX block, directly under the `<p className="text-2xl text-center">…</p>` heading, add:

```tsx
            {errorMessage && screen === "new_pin_create" && (
              <p className="text-lg text-red-600 dark:text-red-400 text-center max-w-sm">
                {errorMessage}
              </p>
            )}
```

- [ ] **Step 4: Typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: both succeed

- [ ] **Step 5: Commit**

```bash
git add src/components/signin-keypad.tsx
git commit -m "feat: surface duplicate-PIN error on PIN creation screen"
```

---

### Task 8: Documentation

**Files:**
- Modify: `CLAUDE.md` (Environment Variables, Route Structure, Scripts sections)

- [ ] **Step 1: Update CLAUDE.md**

Add to the env vars list:

```markdown
- PB_WEBHOOK_VERIFICATION_TOKEN= (self-generated; validates the one-time webhook handshake)
- PB_WEBHOOK_SIGNING_SECRET= (issued by PB at subscription creation; HMAC key for event POSTs)
```

Add to Route Structure:

```markdown
- /api/webhooks/practice-better — PB webhook: GET = verification handshake, POST = signed client.record.created events → upsert patient into Supabase
```

Add under Scripts:

```markdown
### scripts/setup-pb-webhook.js

- One-time: registers the PB webhook subscription for client.record.created
- Requires PB_WEBHOOK_VERIFICATION_TOKEN set locally AND deployed first
- Prints the signing secret once — store as PB_WEBHOOK_SIGNING_SECRET
- Run: node scripts/setup-pb-webhook.js [endpointUrl]
  (default endpoint: https://www.ryuacupuncture.com/api/webhooks/practice-better)
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document PB webhook route, script, and env vars"
```

---

### Task 9: Final verification

- [ ] **Step 1: Full build**

Run: `npm run build`
Expected: success

- [ ] **Step 2: Re-run the Task 4 curl matrix** (handshake 200/401, event 200, bad sig 401, stale ts 401) against the dev server.

- [ ] **Step 3: Confirm Supabase unique constraint**

The webhook upsert and sync script both rely on a unique constraint on `patients.pb_client_id`. Verify it exists in Supabase; if missing, run in the SQL editor:

```sql
alter table patients add constraint patients_pb_client_id_key unique (pb_client_id);
```

(This is a manual dashboard step — flag it to the user in the final summary.)

---

## Deployment runbook (user-facing, after merge)

1. Generate verification token: `openssl rand -hex 32` → set `PB_WEBHOOK_VERIFICATION_TOKEN` in `.env.local` and production env.
2. Deploy to production (route must be live at `https://www.ryuacupuncture.com/api/webhooks/practice-better`).
3. Run `node scripts/setup-pb-webhook.js` → copy printed `PB_WEBHOOK_SIGNING_SECRET` into `.env.local` and production env; redeploy/restart.
4. Initial bulk import: `node scripts/sync-patients.js`.
5. Create a test client in Practice Better → confirm a row appears in Supabase `patients`.
