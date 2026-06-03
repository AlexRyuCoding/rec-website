# Patient Sign-In Redesign — ryuacupuncture.com

## Project Overview

Redesigning the hidden patient check-in page at /admin/patient-signin.
Patients check in physically using a 4-digit PIN. The page is kiosk-style —
admin unlocks it once at the start of the day, then patients use it
throughout the day unassisted.

## Tech Stack

- Framework: Next.js (App Router)
- Database: Supabase (PostgreSQL) via @supabase/ssr
- EHR: Practice Better API (REST, OAuth2)
- PIN hashing: bcryptjs
- All secrets in .env.local — never hardcoded

## Environment Variables (.env.local)

- NEXT_PUBLIC_SUPABASE_URL=
- NEXT_PUBLIC_SUPABASE_ANON_KEY=
- SUPABASE_SERVICE_ROLE_KEY=
- PB_CLIENT_ID=
- PB_CLIENT_SECRET=
- ADMIN_KIOSK_PASSWORD=

## Route Structure

- /admin/patient-signin — the kiosk page (protected by middleware)
- /api/auth/kiosk — verifies admin password, sets session cookie
- /api/patients/lookup — matches PIN, returns patient record
- /api/patients/setup-pin — creates PIN for new patient
- /api/appointments/today — fetches today's appointment from Practice Better
- /api/checkins — writes check-in record to Supabase

## Middleware

Protect /admin/patient-signin with Next.js middleware (middleware.ts).
Check for a valid kiosk session cookie. If missing, redirect to a simple
admin login page (/admin/login) where staff enter ADMIN_KIOSK_PASSWORD.
On success, set a secure httpOnly session cookie and redirect to the kiosk.

## Supabase Schema

### patients table

| column       | type      | notes                     |
| ------------ | --------- | ------------------------- |
| id           | uuid      | primary key               |
| first_name   | string    |                           |
| last_name    | string    |                           |
| email        | string    | unique                    |
| phone        | string    |                           |
| pin          | string    | bcrypt hashed, nullable   |
| pb_client_id | string    | Practice Better client ID |
| created_at   | timestamp | auto                      |

### checkins table

| column           | type      | notes                     |
| ---------------- | --------- | ------------------------- |
| id               | uuid      | primary key               |
| patient_id       | uuid      | foreign key → patients.id |
| checked_in_at    | timestamp | auto-set on insert        |
| appointment_time | string    | from Practice Better      |
| practitioner     | string    | from Practice Better      |

## Practice Better API

- Base URL: https://api.practicebetter.io/v1
- Auth: POST /oauth/token with client_id + client_secret → bearer token
- Token is short-lived — fetch a fresh one per API call server-side
- Get today's appointments for a client:
  GET /v1/appointments?client_id={pb_client_id}&date={today}
- All Practice Better calls happen in Next.js API routes (server-side only)

## Scripts

### scripts/sync-patients.js

- Authenticates with Practice Better API
- Fetches all clients (GET /v1/clients)
- Upserts into Supabase patients table using pb_client_id as the unique key
- Run manually from terminal: node scripts/sync-patients.js
- Safe to re-run — upsert won't duplicate records

## Page UI — /admin/patient-signin

### Admin Login Screen (/admin/login)

- Single password field + submit button
- Clean, minimal — staff-facing only

### Kiosk Screen (main UI) — two modes:

**Returning Patient**

- Numeric PIN pad (0–9) on screen — no physical keyboard needed
- Patient taps their 4-digit PIN
- On match: show name + appointment time + confirm button
- On confirm: log check-in, show "Thank you [first name]!" briefly, reset
- On no match: show "PIN not recognized, please see the front desk"

**New Patient**

- "First visit? Set up your PIN" button below the PIN pad
- Step 1: Enter phone number or email
  - If no match in DB: "Please see the front desk to get started"
  - If match but PIN already exists: "You already have a PIN, please use it
    or see the front desk"
  - If match and no PIN: proceed to step 2
- Step 2: Enter a 4-digit PIN (twice to confirm)
- On success: hash with bcrypt, save to patients table, proceed to
  appointment confirmation as a normal check-in

## Security Notes

- PINs hashed with bcryptjs (never stored plain text)
- All DB and API calls in server-side API routes only
- Supabase service role key used server-side only
- ADMIN_KIOSK_PASSWORD stored in .env.local
- Session cookie: httpOnly, secure, sameSite=strict
- No patient data logged to console
- /admin/\* routes protected by middleware.ts
