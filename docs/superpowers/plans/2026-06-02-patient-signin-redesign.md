# Patient Sign-In Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Google Sheets–backed kiosk check-in with Supabase + bcrypt PIN storage, Practice Better appointment lookup, and a new-patient PIN setup flow.

**Architecture:** Next.js middleware guards `/admin/*` behind an httpOnly kiosk session cookie set by `/api/auth/kiosk`. The kiosk UI (`signin-keypad.tsx`) is a state-machine component with two paths — returning patient (PIN → appointment confirmation → check-in log) and new patient (contact lookup → PIN creation → same confirmation). All DB and external API calls live in server-side API routes.

**Tech Stack:** Next.js 15 App Router, Supabase (service role), bcryptjs, Practice Better REST API (OAuth2 client credentials), Tailwind CSS, Motion (framer-motion)

---

## File Map

| Action   | Path                                          | Responsibility                                    |
|----------|-----------------------------------------------|---------------------------------------------------|
| Create   | `src/lib/supabase.ts`                         | Supabase service-role client factory              |
| Create   | `src/middleware.ts`                           | Redirect unauthenticated requests to admin login  |
| Create   | `src/app/admin/login/page.tsx`               | Admin password entry (staff-only, kiosk unlock)   |
| Create   | `src/app/api/auth/kiosk/route.ts`            | Verify admin password → set session cookie        |
| Create   | `src/app/api/patients/lookup/route.ts`       | POST PIN → patient record (bcrypt verify)         |
| Create   | `src/app/api/patients/setup-pin/route.ts`    | POST contact → patient; PATCH patient → set PIN   |
| Create   | `src/app/api/appointments/today/route.ts`    | GET Practice Better appointments for today        |
| Create   | `src/app/api/checkins/route.ts`              | POST check-in record to Supabase                  |
| Create   | `scripts/sync-patients.js`                   | Sync Practice Better clients → Supabase patients  |
| Modify   | `src/components/signin-keypad.tsx`           | Full state-machine rewrite (two patient flows)    |
| Modify   | `src/components/confirmation-modal.tsx`      | Add appointment time + practitioner display       |
| Modify   | `package.json`                               | Add @supabase/supabase-js, bcryptjs deps          |
| Delete   | `src/app/api/pin-signin/route.ts`            | Replaced by new routes                            |

---

## Task 1: Install Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install packages**

```bash
cd /Users/alexryu/rac-website
npm install @supabase/supabase-js bcryptjs
npm install --save-dev @types/bcryptjs
```

Expected: packages added to `node_modules`, `package.json` updated with `@supabase/supabase-js`, `bcryptjs`, `@types/bcryptjs`.

- [ ] **Step 2: Verify install**

```bash
node -e "require('@supabase/supabase-js'); require('bcryptjs'); console.log('OK')"
```

Expected output: `OK`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add supabase-js and bcryptjs dependencies"
```

---

## Task 2: Supabase Service Client

**Files:**
- Create: `src/lib/supabase.ts`

- [ ] **Step 1: Create the helper**

```typescript
// src/lib/supabase.ts
import { createClient } from "@supabase/supabase-js";

export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/alexryu/rac-website
npx tsc --noEmit
```

Expected: no errors about `src/lib/supabase.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/supabase.ts
git commit -m "feat: add Supabase service client helper"
```

---

## Task 3: Middleware + Admin Login

**Files:**
- Create: `src/middleware.ts`
- Create: `src/app/admin/login/page.tsx`
- Create: `src/app/api/auth/kiosk/route.ts`

The session cookie value is SHA-256(ADMIN_KIOSK_PASSWORD) so the middleware can verify it without storing server-side state. `crypto.subtle` is available in both Edge (middleware) and Node.js (API routes).

- [ ] **Step 1: Create middleware**

```typescript
// src/middleware.ts
import { NextRequest, NextResponse } from "next/server";

async function expectedToken(): Promise<string> {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest(
    "SHA-256",
    enc.encode(process.env.ADMIN_KIOSK_PASSWORD!)
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/admin/login") return NextResponse.next();

  const session = request.cookies.get("kiosk_session");
  const token = await expectedToken();

  if (session?.value !== token) {
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
```

- [ ] **Step 2: Create kiosk auth API route**

```typescript
// src/app/api/auth/kiosk/route.ts
import { NextResponse } from "next/server";

async function makeToken(): Promise<string> {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest(
    "SHA-256",
    enc.encode(process.env.ADMIN_KIOSK_PASSWORD!)
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function POST(req: Request) {
  const { password } = await req.json();

  if (!password || password !== process.env.ADMIN_KIOSK_PASSWORD) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  const token = await makeToken();
  const response = NextResponse.json({ success: true });
  response.cookies.set("kiosk_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 60 * 60 * 24, // 24 hours
    path: "/",
  });
  return response;
}
```

- [ ] **Step 3: Create admin login page**

```typescript
// src/app/admin/login/page.tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/kiosk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        router.push("/admin/patient-signin");
      } else {
        setError("Incorrect password.");
      }
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-brand-background">
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-4 w-full max-w-sm p-8 border border-brand-foreground rounded-xl shadow-md bg-brand-background"
      >
        <h1 className="text-2xl font-semibold text-center">Staff Login</h1>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Enter kiosk password"
          className="px-4 py-3 border border-brand-foreground rounded-lg text-lg bg-transparent focus:outline-none focus:ring-2 focus:ring-[#2A9E8F]"
          autoFocus
        />
        {error && <p className="text-red-500 text-sm text-center">{error}</p>}
        <button
          type="submit"
          disabled={loading || !password}
          className="py-3 rounded-lg bg-[#2A9E8F] text-white text-lg font-medium hover:bg-[#238B7E] disabled:opacity-50 transition-colors"
        >
          {loading ? "Verifying..." : "Unlock Kiosk"}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Verify the app still compiles**

```bash
cd /Users/alexryu/rac-website && npm run build 2>&1 | tail -20
```

Expected: build succeeds (or only pre-existing errors).

- [ ] **Step 5: Manual test — middleware redirect**

Start the dev server (`npm run dev`), open `http://localhost:3000/admin/patient-signin` in a browser. Should redirect to `/admin/login`. Enter the correct `ADMIN_KIOSK_PASSWORD` from `.env.local`. Should redirect back to `/admin/patient-signin`.

- [ ] **Step 6: Commit**

```bash
git add src/middleware.ts src/app/admin/login/page.tsx src/app/api/auth/kiosk/route.ts
git commit -m "feat: add kiosk middleware + admin login page"
```

---

## Task 4: Patient Lookup API

**Files:**
- Create: `src/app/api/patients/lookup/route.ts`

Fetches all patients with a non-null PIN from Supabase, then bcrypt-compares the input PIN against each stored hash. Returns the first match without the hash. 

> **Performance note:** bcryptjs runs on the main thread; for a clinic with 50–100 PINs at cost=8, expect ~1–3s lookup time. This is acceptable for a kiosk. If the patient list grows beyond ~200 with PINs, add a fast `pin_lookup_hash` index column to avoid iterating all rows.

- [ ] **Step 1: Create the route**

```typescript
// src/app/api/patients/lookup/route.ts
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { createServiceClient } from "@/lib/supabase";

export async function POST(req: Request) {
  const { pin } = await req.json();

  if (!pin || !/^\d{4}$/.test(pin)) {
    return NextResponse.json({ error: "PIN must be exactly 4 digits" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: patients, error } = await supabase
    .from("patients")
    .select("id, first_name, last_name, pin, pb_client_id")
    .not("pin", "is", null);

  if (error) {
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  for (const patient of patients ?? []) {
    const match = await bcrypt.compare(pin, patient.pin!);
    if (match) {
      return NextResponse.json({
        id: patient.id,
        first_name: patient.first_name,
        last_name: patient.last_name,
        pb_client_id: patient.pb_client_id,
      });
    }
  }

  return NextResponse.json(
    { error: "PIN not recognized, please see the front desk" },
    { status: 404 }
  );
}
```

- [ ] **Step 2: Manual test**

With the dev server running, open a terminal and run:

```bash
# Replace 1234 with a real PIN you've set in the patients table
curl -X POST http://localhost:3000/api/patients/lookup \
  -H "Content-Type: application/json" \
  -d '{"pin":"1234"}'
```

Expected on match: `{"id":"...","first_name":"...","last_name":"...","pb_client_id":"..."}`  
Expected on no match: `{"error":"PIN not recognized, please see the front desk"}` with status 404.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/patients/lookup/route.ts
git commit -m "feat: add patient PIN lookup API route"
```

---

## Task 5: Practice Better Appointments API

**Files:**
- Create: `src/app/api/appointments/today/route.ts`

Fetches a fresh OAuth2 token per request (short-lived tokens per CLAUDE.md), then queries today's appointments for the given `pb_client_id`.

> **Important:** The exact Practice Better API response shape needs verification. The fields `start_time` and `staff` below are assumptions. Test with a real `pb_client_id` after deploy and adjust field names if needed.

- [ ] **Step 1: Create the route**

```typescript
// src/app/api/appointments/today/route.ts
import { NextResponse } from "next/server";

const PB_BASE = "https://api.practicebetter.io/v1";

async function getPbToken(): Promise<string> {
  const res = await fetch(`${PB_BASE}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: process.env.PB_CLIENT_ID,
      client_secret: process.env.PB_CLIENT_SECRET,
    }),
  });
  if (!res.ok) throw new Error("Failed to get Practice Better token");
  const data = await res.json();
  return data.access_token as string;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const pb_client_id = searchParams.get("pb_client_id");

  if (!pb_client_id) {
    return NextResponse.json({ error: "pb_client_id required" }, { status: 400 });
  }

  try {
    const token = await getPbToken();
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

    const res = await fetch(
      `${PB_BASE}/appointments?client_id=${encodeURIComponent(pb_client_id)}&date=${today}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!res.ok) {
      return NextResponse.json({ appointment: null });
    }

    const data = await res.json();
    // Practice Better returns { data: [...] } or { appointments: [...] }
    // Adjust the key below once you verify with a real response.
    const appointments: Array<Record<string, unknown>> =
      (data.data ?? data.appointments ?? []) as Array<Record<string, unknown>>;

    if (appointments.length === 0) {
      return NextResponse.json({ appointment: null });
    }

    const appt = appointments[0];
    // Adjust field names below to match actual PB API response.
    const startRaw = (appt.start_time ?? appt.start ?? appt.starts_at ?? "") as string;
    const practitioner = appt.staff as Record<string, string> | undefined
      ?? appt.practitioner as Record<string, string> | undefined;
    const practitionerName = practitioner
      ? `${practitioner.first_name ?? ""} ${practitioner.last_name ?? ""}`.trim()
      : null;

    const appointmentTime = startRaw
      ? new Date(startRaw).toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          timeZone: "America/Los_Angeles",
        })
      : null;

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

- [ ] **Step 2: Manual test with a real pb_client_id**

```bash
# Replace pb123 with a real Practice Better client ID from your patients table
curl "http://localhost:3000/api/appointments/today?pb_client_id=pb123"
```

Expected: `{"appointment":{"time":"10:00 AM","practitioner":"Alex Ryu"}}` or `{"appointment":null}`.  
If field names are wrong (null when you expect a result), check the actual response by temporarily logging `data` in the route and adjust the field name comments.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/appointments/today/route.ts
git commit -m "feat: add Practice Better appointments API route"
```

---

## Task 6: Check-Ins API

**Files:**
- Create: `src/app/api/checkins/route.ts`

- [ ] **Step 1: Create the route**

```typescript
// src/app/api/checkins/route.ts
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

export async function POST(req: Request) {
  const { patient_id, appointment_time, practitioner } = await req.json();

  if (!patient_id) {
    return NextResponse.json({ error: "patient_id required" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { error } = await supabase.from("checkins").insert({
    patient_id,
    appointment_time: appointment_time ?? null,
    practitioner: practitioner ?? null,
  });

  if (error) {
    return NextResponse.json({ error: "Failed to log check-in" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 2: Manual test**

```bash
# Replace the uuid with a real patient id from your Supabase patients table
curl -X POST http://localhost:3000/api/checkins \
  -H "Content-Type: application/json" \
  -d '{"patient_id":"<uuid>","appointment_time":"10:00 AM","practitioner":"Alex Ryu"}'
```

Expected: `{"success":true}` and a new row in `checkins` table in Supabase dashboard.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/checkins/route.ts
git commit -m "feat: add check-in logging API route"
```

---

## Task 7: Patient Setup-PIN API

**Files:**
- Create: `src/app/api/patients/setup-pin/route.ts`

Two operations on one route:
- `POST` with `{ contact }` → look up patient by phone or email, return status
- `PATCH` with `{ patient_id, pin }` → hash PIN, save to patients table, return patient info

Phone matching normalizes both the stored value and input to digits only.

- [ ] **Step 1: Create the route**

```typescript
// src/app/api/patients/setup-pin/route.ts
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { createServiceClient } from "@/lib/supabase";

function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, "");
}

export async function POST(req: Request) {
  const { contact } = await req.json();

  if (!contact || contact.trim().length < 3) {
    return NextResponse.json({ error: "Enter a valid phone number or email" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const normalized = normalizePhone(contact.trim());
  const isPhone = /^\d{7,15}$/.test(normalized);

  let query = supabase
    .from("patients")
    .select("id, first_name, last_name, pin, pb_client_id");

  if (isPhone) {
    // Fetch all and filter by normalized phone — Supabase doesn't support inline transforms
    const { data: patients, error } = await query;
    if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

    const patient = (patients ?? []).find(
      (p) => normalizePhone(p.phone ?? "") === normalized
    );

    if (!patient) {
      return NextResponse.json({ status: "not_found" });
    }
    if (patient.pin) {
      return NextResponse.json({ status: "has_pin" });
    }
    return NextResponse.json({ status: "ok", patient_id: patient.id, first_name: patient.first_name });
  } else {
    // Email lookup
    const { data: patients, error } = await query.eq("email", contact.trim().toLowerCase());
    if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

    if (!patients || patients.length === 0) {
      return NextResponse.json({ status: "not_found" });
    }
    const patient = patients[0];
    if (patient.pin) {
      return NextResponse.json({ status: "has_pin" });
    }
    return NextResponse.json({ status: "ok", patient_id: patient.id, first_name: patient.first_name });
  }
}

export async function PATCH(req: Request) {
  const { patient_id, pin } = await req.json();

  if (!patient_id || !pin || !/^\d{4}$/.test(pin)) {
    return NextResponse.json({ error: "patient_id and 4-digit pin required" }, { status: 400 });
  }

  const hashed = await bcrypt.hash(pin, 8);
  const supabase = createServiceClient();

  const { data: patient, error } = await supabase
    .from("patients")
    .update({ pin: hashed })
    .eq("id", patient_id)
    .select("id, first_name, last_name, pb_client_id")
    .single();

  if (error || !patient) {
    return NextResponse.json({ error: "Failed to save PIN" }, { status: 500 });
  }

  return NextResponse.json({
    id: patient.id,
    first_name: patient.first_name,
    last_name: patient.last_name,
    pb_client_id: patient.pb_client_id,
  });
}
```

- [ ] **Step 2: Manual test — POST (contact lookup)**

```bash
# Test with a real email in your patients table
curl -X POST http://localhost:3000/api/patients/setup-pin \
  -H "Content-Type: application/json" \
  -d '{"contact":"patient@example.com"}'
```

Expected responses:
- Patient found, no PIN: `{"status":"ok","patient_id":"...","first_name":"..."}`
- Patient has PIN: `{"status":"has_pin"}`
- No patient: `{"status":"not_found"}`

- [ ] **Step 3: Manual test — PATCH (set PIN)**

```bash
# Use a real patient_id with no PIN set
curl -X PATCH http://localhost:3000/api/patients/setup-pin \
  -H "Content-Type: application/json" \
  -d '{"patient_id":"<uuid>","pin":"5678"}'
```

Expected: `{"id":"...","first_name":"...","last_name":"...","pb_client_id":"..."}` and `pin` column in Supabase now shows a bcrypt hash.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/patients/setup-pin/route.ts
git commit -m "feat: add patient setup-pin API route"
```

---

## Task 8: Redesign Confirmation Modal

**Files:**
- Modify: `src/components/confirmation-modal.tsx`

Add `firstName`, `appointmentTime`, `practitioner` props. Change success message to "Thank you, [firstName]!". The `name` prop becomes `firstName` + `lastName`.

- [ ] **Step 1: Replace the modal**

```typescript
// src/components/confirmation-modal.tsx
"use client";

import { useEffect, useState } from "react";

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onDeny: () => void;
  firstName: string;
  lastName: string;
  appointmentTime: string | null;
  practitioner: string | null;
  errorMessage?: string;
}

export default function ConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  onDeny,
  firstName,
  lastName,
  appointmentTime,
  practitioner,
  errorMessage,
}: ConfirmationModalProps) {
  const [showSuccess, setShowSuccess] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
    } else {
      const timer = setTimeout(() => setIsVisible(false), 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  useEffect(() => {
    if (showSuccess) {
      const timer = setTimeout(() => {
        setShowSuccess(false);
        onClose();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [showSuccess, onClose]);

  if (!isVisible && !isOpen) return null;

  const handleConfirm = () => {
    setShowSuccess(true);
    setTimeout(onConfirm, 3000);
  };

  const displayName = `${firstName} ${lastName.charAt(0)}.`;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm transition-opacity duration-300 ${
        isOpen ? "opacity-100" : "opacity-0"
      }`}
    >
      <div
        className={`fixed inset-0 bg-black/30 backdrop-blur-sm transition-all duration-300 ${
          isOpen ? "opacity-100" : "opacity-0 backdrop-blur-none"
        }`}
        onClick={onClose}
      />
      <div
        className={`relative bg-[var(--background)] dark:bg-gray-800 border border-gray-200 dark:border-gray-400 p-6 mx-4 sm:mx-auto rounded-lg max-w-md w-full z-10 transition-all duration-300 ${
          isOpen ? "translate-y-0 opacity-100" : "translate-y-24 opacity-0"
        }`}
      >
        <div className="text-center mb-10">
          {errorMessage ? (
            <p className="text-2xl text-red-600 dark:text-red-400">{errorMessage}</p>
          ) : showSuccess ? (
            <p className="text-4xl">
              Thank you, <strong>{firstName}</strong>!
              <br />
              <br />
              You&apos;re checked in.
            </p>
          ) : firstName ? (
            <>
              <h2 className="text-4xl font-semibold mb-6">Is this you?</h2>
              <p className="text-3xl mb-3">{displayName}</p>
              {appointmentTime && (
                <p className="text-xl text-gray-600 dark:text-gray-300">
                  Appointment at {appointmentTime}
                  {practitioner ? ` with ${practitioner}` : ""}
                </p>
              )}
            </>
          ) : null}
        </div>

        {!showSuccess && !errorMessage && firstName && (
          <div className="flex items-center justify-center gap-4 text-2xl">
            <button
              onClick={handleConfirm}
              className="px-6 py-2 bg-[#2A9E8F] hover:bg-[#238B7E] text-white rounded-full transition-colors"
            >
              Yes, Sign In
            </button>
            <button
              onClick={onDeny}
              className="px-6 py-2 bg-gray-300 hover:bg-gray-400 dark:bg-gray-400 dark:hover:bg-gray-600 rounded-full transition-colors"
            >
              No
            </button>
          </div>
        )}
        {errorMessage && (
          <div className="flex justify-center">
            <button
              onClick={onClose}
              className="px-6 py-2 bg-gray-300 hover:bg-gray-400 dark:bg-gray-400 dark:hover:bg-gray-600 rounded-full transition-colors"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd /Users/alexryu/rac-website && npx tsc --noEmit 2>&1 | grep confirmation-modal
```

Expected: no errors (the old `name` prop is now `firstName`/`lastName` — the keypad update in Task 9 will fix call sites).

- [ ] **Step 3: Commit**

```bash
git add src/components/confirmation-modal.tsx
git commit -m "feat: update confirmation modal with appointment display"
```

---

## Task 9: Redesign SignInKeypad

**Files:**
- Modify: `src/components/signin-keypad.tsx`

Full state-machine rewrite. Replaces the old Google Sheets flow with the Supabase APIs. Manages two patient paths: returning (PIN → appointment → confirm → check-in) and new (contact → PIN creation × 2 → appointment → confirm → check-in).

**State machine:**
```
"pin_entry"          → patient enters 4-digit PIN
"verifying"          → POST /api/patients/lookup
"confirmed"          → modal: show name + appointment, await confirm
"checking_in"        → POST /api/checkins (triggered by modal confirm callback)
"error"              → show inline error, retry button resets to pin_entry
"new_contact"        → new patient: enter phone or email
"new_contact_lookup" → POST /api/patients/setup-pin
"new_pin_create"     → new patient enters PIN
"new_pin_confirm"    → new patient re-enters PIN for confirmation
"new_pin_saving"     → PATCH /api/patients/setup-pin
```
After `checking_in` completes, set `screen` to `"pin_entry"` and reset all fields (the modal handles the 3-second success display and calls `onClose`).

- [ ] **Step 1: Replace signin-keypad.tsx**

```typescript
// src/components/signin-keypad.tsx
"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import ConfirmationModal from "./confirmation-modal";

type Screen =
  | "pin_entry"
  | "verifying"
  | "confirmed"
  | "error"
  | "new_contact"
  | "new_contact_lookup"
  | "new_pin_create"
  | "new_pin_confirm"
  | "new_pin_saving";

interface PatientInfo {
  id: string;
  first_name: string;
  last_name: string;
  pb_client_id: string | null;
}

interface AppointmentInfo {
  time: string | null;
  practitioner: string | null;
}

export default function SignInKeypad() {
  const [screen, setScreen] = useState<Screen>("pin_entry");
  const [pin, setPin] = useState("");
  const [contact, setContact] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [patient, setPatient] = useState<PatientInfo | null>(null);
  const [appointment, setAppointment] = useState<AppointmentInfo | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);

  // --- Returning patient: PIN entry ---

  const handlePinDigit = (digit: string) => {
    if (pin.length >= 4) return;
    const next = pin + digit;
    setPin(next);
    if (next.length === 4) submitPin(next);
  };

  const handlePinBackspace = () => setPin((p) => p.slice(0, -1));
  const handlePinClear = () => setPin("");

  const submitPin = async (entered: string) => {
    setScreen("verifying");
    try {
      const res = await fetch("/api/patients/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: entered }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(data.error ?? "PIN not recognized, please see the front desk");
        setPin("");
        setScreen("error");
        return;
      }
      setPatient(data);
      await fetchAppointment(data.pb_client_id);
      setIsModalOpen(true);
      setScreen("confirmed");
    } catch {
      setErrorMessage("Something went wrong. Please see the front desk.");
      setPin("");
      setScreen("error");
    }
  };

  const fetchAppointment = async (pb_client_id: string | null) => {
    if (!pb_client_id) return;
    try {
      const res = await fetch(`/api/appointments/today?pb_client_id=${encodeURIComponent(pb_client_id)}`);
      const data = await res.json();
      setAppointment(data.appointment ?? null);
    } catch {
      setAppointment(null);
    }
  };

  // --- Check-in (called from modal confirm) ---

  const handleConfirmCheckin = async () => {
    if (!patient) return;
    try {
      await fetch("/api/checkins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_id: patient.id,
          appointment_time: appointment?.time ?? null,
          practitioner: appointment?.practitioner ?? null,
        }),
      });
    } catch {
      // Non-fatal: check-in logging failure shouldn't block the patient
    }
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setPin("");
    setPatient(null);
    setAppointment(null);
    setErrorMessage("");
    setScreen("pin_entry");
  };

  const handleModalDeny = () => {
    setIsModalOpen(false);
    setPin("");
    setPatient(null);
    setAppointment(null);
    setScreen("pin_entry");
  };

  // --- New patient: contact lookup ---

  const handleContactSubmit = async () => {
    if (!contact.trim()) return;
    setScreen("new_contact_lookup");
    try {
      const res = await fetch("/api/patients/setup-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact: contact.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(data.error ?? "Something went wrong.");
        setScreen("error");
        return;
      }
      if (data.status === "not_found") {
        setErrorMessage("We couldn't find your record. Please see the front desk to get started.");
        setScreen("error");
      } else if (data.status === "has_pin") {
        setErrorMessage("You already have a PIN. Please use it, or see the front desk.");
        setScreen("error");
      } else {
        setPatient({ id: data.patient_id, first_name: data.first_name, last_name: "", pb_client_id: null });
        setScreen("new_pin_create");
      }
    } catch {
      setErrorMessage("Something went wrong. Please see the front desk.");
      setScreen("error");
    }
  };

  // --- New patient: PIN creation ---

  const handleNewPinDigit = (digit: string) => {
    if (screen === "new_pin_create" && newPin.length < 4) {
      const next = newPin + digit;
      setNewPin(next);
      if (next.length === 4) setScreen("new_pin_confirm");
    } else if (screen === "new_pin_confirm" && confirmPin.length < 4) {
      const next = confirmPin + digit;
      setConfirmPin(next);
      if (next.length === 4) submitNewPin(next);
    }
  };

  const handleNewPinBackspace = () => {
    if (screen === "new_pin_create") setNewPin((p) => p.slice(0, -1));
    else if (screen === "new_pin_confirm") setConfirmPin((p) => p.slice(0, -1));
  };

  const handleNewPinClear = () => {
    if (screen === "new_pin_create") setNewPin("");
    else if (screen === "new_pin_confirm") setConfirmPin("");
  };

  const submitNewPin = async (entered: string) => {
    if (entered !== newPin) {
      setErrorMessage("PINs don't match. Let's try again.");
      setNewPin("");
      setConfirmPin("");
      setScreen("new_pin_create");
      return;
    }
    setScreen("new_pin_saving");
    try {
      const res = await fetch("/api/patients/setup-pin", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patient_id: patient!.id, pin: entered }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(data.error ?? "Failed to save PIN. Please see the front desk.");
        setScreen("error");
        return;
      }
      const fullPatient: PatientInfo = data;
      setPatient(fullPatient);
      await fetchAppointment(fullPatient.pb_client_id);
      setIsModalOpen(true);
      setScreen("confirmed");
    } catch {
      setErrorMessage("Something went wrong. Please see the front desk.");
      setScreen("error");
    }
  };

  // --- Reset ---

  const reset = () => {
    setScreen("pin_entry");
    setPin("");
    setContact("");
    setNewPin("");
    setConfirmPin("");
    setPatient(null);
    setAppointment(null);
    setErrorMessage("");
    setIsModalOpen(false);
  };

  // --- PIN display helper ---

  const pinDots = (value: string) =>
    Array.from({ length: 4 }, (_, i) => (
      <div
        key={i}
        className={`w-6 h-6 rounded-full border-2 border-brand-foreground dark:border-white transition-colors ${
          i < value.length ? "bg-[#2A9E8F]" : "bg-transparent"
        }`}
      />
    ));

  // --- Keypad ---

  const currentPinValue = screen === "new_pin_confirm" ? confirmPin : screen === "new_pin_create" ? newPin : pin;
  const keypadDisabled = !["pin_entry", "new_pin_create", "new_pin_confirm"].includes(screen);

  const Keypad = () => (
    <motion.div layout className="grid grid-cols-3 gap-4 mb-4">
      {["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"].map((num) => (
        <button
          key={num}
          onClick={() =>
            screen === "pin_entry" ? handlePinDigit(num) : handleNewPinDigit(num)
          }
          disabled={keypadDisabled || currentPinValue.length >= 4}
          className="py-3 text-5xl bg-brand-background dark:bg-[var(--background)] hover:bg-brand-muted dark:hover:bg-gray-600 border border-brand-foreground dark:border-brand-background rounded-xl disabled:opacity-50 transition-colors"
        >
          {num}
        </button>
      ))}
      <button
        onClick={screen === "pin_entry" ? handlePinBackspace : handleNewPinBackspace}
        disabled={keypadDisabled}
        className="col-span-1 text-5xl bg-[#fcdf97] dark:bg-[#E9C46A] hover:bg-[#E9C46A] dark:hover:bg-[#e8b63c] border rounded-xl disabled:opacity-50 transition-colors"
      >
        ⌫
      </button>
      <button
        onClick={screen === "pin_entry" ? handlePinClear : handleNewPinClear}
        disabled={keypadDisabled}
        className="col-span-1 py-3 text-2xl bg-red-300 dark:bg-red-400 hover:bg-red-400 dark:hover:bg-red-600 border rounded-xl disabled:opacity-50 transition-colors"
      >
        CLEAR
      </button>
    </motion.div>
  );

  return (
    <div className="flex flex-col items-center justify-center gap-8">
      <AnimatePresence mode="wait">

        {/* PIN entry — returning patient */}
        {screen === "pin_entry" && (
          <motion.div
            key="pin_entry"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center gap-8 w-full"
          >
            <p className="text-2xl text-center">Enter your 4-digit PIN to sign in.</p>
            <motion.div
              layout
              className="w-full max-w-[380px] sm:max-w-[480px] p-4 rounded-lg shadow-lg bg-brand-background dark:bg-[var(--background)] border border-brand-foreground dark:border-white"
            >
              <div className="flex justify-center gap-4 mb-6 py-4">
                {pinDots(pin)}
              </div>
              <Keypad />
            </motion.div>
            <button
              onClick={() => setScreen("new_contact")}
              className="text-lg text-[#2A9E8F] underline underline-offset-2 hover:text-[#238B7E] transition-colors"
            >
              First visit? Set up your PIN
            </button>
          </motion.div>
        )}

        {/* Verifying / loading */}
        {(screen === "verifying" || screen === "new_contact_lookup" || screen === "new_pin_saving") && (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center gap-4"
          >
            <motion.div
              className="w-12 h-12 border-4 border-[#2A9E8F] border-t-transparent rounded-full"
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            />
            <p className="text-2xl">
              {screen === "verifying" ? "Verifying PIN..." :
               screen === "new_pin_saving" ? "Setting up your PIN..." :
               "Looking you up..."}
            </p>
          </motion.div>
        )}

        {/* Error */}
        {screen === "error" && (
          <motion.div
            key="error"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center gap-6 max-w-sm text-center"
          >
            <p className="text-2xl text-red-600 dark:text-red-400">{errorMessage}</p>
            <button
              onClick={reset}
              className="px-8 py-3 rounded-full bg-[#2A9E8F] text-white text-xl hover:bg-[#238B7E] transition-colors"
            >
              Try Again
            </button>
          </motion.div>
        )}

        {/* New patient: contact entry */}
        {screen === "new_contact" && (
          <motion.div
            key="new_contact"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center gap-6 w-full max-w-sm"
          >
            <p className="text-2xl text-center">Enter your phone number or email.</p>
            <input
              type="text"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleContactSubmit()}
              placeholder="555-123-4567 or email"
              className="w-full px-4 py-3 border border-brand-foreground rounded-lg text-xl bg-transparent focus:outline-none focus:ring-2 focus:ring-[#2A9E8F]"
              autoFocus
            />
            <div className="flex gap-4 w-full">
              <button
                onClick={reset}
                className="flex-1 py-3 rounded-full border border-brand-foreground text-xl hover:bg-brand-muted transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleContactSubmit}
                disabled={!contact.trim()}
                className="flex-1 py-3 rounded-full bg-[#2A9E8F] text-white text-xl hover:bg-[#238B7E] disabled:opacity-50 transition-colors"
              >
                Continue
              </button>
            </div>
          </motion.div>
        )}

        {/* New patient: PIN creation */}
        {(screen === "new_pin_create" || screen === "new_pin_confirm") && (
          <motion.div
            key="new_pin"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center gap-6 w-full"
          >
            <p className="text-2xl text-center">
              {screen === "new_pin_create"
                ? `Hi ${patient?.first_name}! Choose a 4-digit PIN.`
                : "Re-enter your PIN to confirm."}
            </p>
            <motion.div
              layout
              className="w-full max-w-[380px] sm:max-w-[480px] p-4 rounded-lg shadow-lg bg-brand-background dark:bg-[var(--background)] border border-brand-foreground dark:border-white"
            >
              <div className="flex justify-center gap-4 mb-6 py-4">
                {pinDots(currentPinValue)}
              </div>
              <Keypad />
            </motion.div>
            <button
              onClick={() => {
                if (screen === "new_pin_confirm") {
                  setConfirmPin("");
                  setScreen("new_pin_create");
                } else {
                  reset();
                }
              }}
              className="text-lg text-gray-500 underline underline-offset-2 hover:text-gray-700 transition-colors"
            >
              {screen === "new_pin_confirm" ? "Back" : "Cancel"}
            </button>
          </motion.div>
        )}

      </AnimatePresence>

      <ConfirmationModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        onConfirm={handleConfirmCheckin}
        onDeny={handleModalDeny}
        firstName={patient?.first_name ?? ""}
        lastName={patient?.last_name ?? ""}
        appointmentTime={appointment?.time ?? null}
        practitioner={appointment?.practitioner ?? null}
      />
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd /Users/alexryu/rac-website && npx tsc --noEmit
```

Expected: no type errors. If `motion/react` types throw, add `// @ts-expect-error` above the import temporarily and file a follow-up.

- [ ] **Step 3: Visual test — returning patient flow**

With dev server running, go to `http://localhost:3000/admin/patient-signin`.  
1. Enter a 4-digit PIN that exists in Supabase (with a bcrypt hash in the `pin` column) → spinner → modal opens with name + appointment.  
2. Tap "Yes, Sign In" → "Thank you, [name]!" for 3 seconds → returns to PIN entry screen.  
3. Enter wrong PIN → inline error with "Try Again" button → clicking resets to PIN entry.

- [ ] **Step 4: Visual test — new patient flow**

1. Tap "First visit? Set up your PIN" → contact input screen.  
2. Enter phone/email not in DB → "Please see the front desk" error.  
3. Enter phone/email of patient with no PIN → "Choose a 4-digit PIN" screen.  
4. Enter 4 digits → "Re-enter PIN" screen.  
5. Enter same 4 digits → spinner → modal with name + appointment.  
6. Tap "Yes, Sign In" → check-in logged → success → reset.  
7. For mismatch: enter different PIN on confirm step → "PINs don't match" → back to creation step.

- [ ] **Step 5: Commit**

```bash
git add src/components/signin-keypad.tsx
git commit -m "feat: redesign kiosk keypad with returning and new patient flows"
```

---

## Task 10: Sync Patients Script

**Files:**
- Create: `scripts/sync-patients.js`

Authenticates with Practice Better, fetches all clients, upserts into Supabase. Handles basic pagination if Practice Better returns a `next_cursor` or `meta.next_page` field.

> **Note:** Adjust `PB_BASE`, the `/clients` response key, and pagination fields to match the actual Practice Better API after a test run.

- [ ] **Step 1: Create the script**

```javascript
// scripts/sync-patients.js
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
```

- [ ] **Step 2: Install dotenv (if not already present)**

```bash
cd /Users/alexryu/rac-website && node -e "require('dotenv')" 2>/dev/null || npm install dotenv
```

- [ ] **Step 3: Run the sync**

```bash
cd /Users/alexryu/rac-website && node scripts/sync-patients.js
```

Expected output:
```
Connecting to Practice Better...
Fetching clients...
Found N clients
Done. Upserted: N, Errors: 0
```

Verify in Supabase dashboard → Table Editor → `patients` table that rows were created with `pb_client_id`, `first_name`, `last_name`, `email`, `phone` columns populated.

If field names are wrong (all first_names show as empty), temporarily add `console.log(clients[0])` after fetching and adjust the field names in the upsert accordingly.

- [ ] **Step 4: Commit**

```bash
git add scripts/sync-patients.js
git commit -m "feat: add Practice Better → Supabase patient sync script"
```

---

## Task 11: Remove Old Google Sheets Route

**Files:**
- Delete: `src/app/api/pin-signin/route.ts`

- [ ] **Step 1: Remove the route and its dependencies**

```bash
rm /Users/alexryu/rac-website/src/app/api/pin-signin/route.ts
```

- [ ] **Step 2: Uninstall googleapis**

```bash
cd /Users/alexryu/rac-website && npm uninstall googleapis
```

- [ ] **Step 3: Remove SPREADSHEET_ID and GOOGLE_SHEETS_CREDENTIALS from .env.local**

Edit `.env.local` and remove these lines (keep the Supabase and PB env vars):
- `SPREADSHEET_ID=...`
- `GOOGLE_SHEETS_CREDENTIALS_PATH=...`
- `GOOGLE_SHEETS_CREDENTIALS_B64=...`

Do the same in any Vercel / hosting environment dashboard.

- [ ] **Step 4: Verify build**

```bash
cd /Users/alexryu/rac-website && npm run build 2>&1 | tail -20
```

Expected: clean build with no references to `googleapis` or `pin-signin`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove Google Sheets integration and old pin-signin route"
```

---

## Spec Coverage Self-Review

| Requirement | Task |
|-------------|------|
| /admin/patient-signin protected by middleware | Task 3 |
| /admin/login staff password page | Task 3 |
| /api/auth/kiosk sets httpOnly session cookie | Task 3 |
| /api/patients/lookup — bcrypt PIN match | Task 4 |
| /api/appointments/today — Practice Better OAuth2 | Task 5 |
| /api/checkins — Supabase insert | Task 6 |
| /api/patients/setup-pin — contact lookup + PIN hash | Task 7 |
| Returning patient: PIN → name + appt → confirm → log | Task 9 |
| New patient: contact → "first visit" → PIN × 2 → confirm | Task 9 |
| "PIN not recognized" inline error | Task 9 |
| "Please see front desk" for unknown contact | Task 9 |
| "You already have a PIN" for existing PIN | Task 9 |
| "Thank you [first name]!" 3-sec success then reset | Tasks 8 + 9 |
| PINs bcrypt hashed, never plain text | Tasks 4, 7 |
| Service role key server-side only | Tasks 4, 6, 7 |
| scripts/sync-patients.js | Task 10 |
| Remove Google Sheets integration | Task 11 |
