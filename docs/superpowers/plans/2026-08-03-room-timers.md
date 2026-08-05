# Room Timers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A staff-only clinic room timer board at `/admin/rooms` — grid of room tiles with timestamp-derived countdown timers, color-coded status, cross-device realtime sync, and an alarm.

**Architecture:** Supabase `rooms` table is the source of truth; a running timer is stored as `timer_started_at` + `timer_duration_seconds` (+ `timer_paused_at`), so status/remaining is a pure function of the row and the current time — no server ticking. Mutations go through admin-guarded Next.js API routes which broadcast on a Supabase Realtime channel; clients refetch on broadcast, poll every 60 s as fallback, and tick locally every second.

**Tech Stack:** Next.js 15 App Router (React 18), Supabase (`@supabase/supabase-js` v2, service-role server-side + anon-key browser client for Realtime broadcast only), zod v4, Tailwind, lucide-react, vitest.

**Spec:** `docs/superpowers/specs/2026-08-03-room-timers-design.md`

## Global Constraints

- Prettier: `trailingComma: "es5"`, double quotes, semicolons. Lint gate: `npm run lint:strict` (zero warnings) must pass before each commit — Vercel builds fail on lint errors.
- All new API routes: guard with `isAdminAuthorized()` from `@/lib/admin-auth`, return `{ error: "Unauthorized" }` 401 otherwise; DB access only via `createServiceClient()` from `@/lib/supabase`.
- No patient data or PHI anywhere in this feature; no `console.log` of data.
- Dark theme only, Tailwind utility classes, `lucide-react` icons (matches `/admin/dashboard`).
- Status colors: Available = green, In Use = blue, Complete/Remove Needles = orange, Overtime = red.
- Constants: overtime grace 300 s, adjust step 60 s, duration clamp 60–3600 s, poll 60 s, chime repeat 45 s, grid 6 columns.
- Migration is idempotent SQL; RLS enabled, no policies. **The user must paste it into the Supabase SQL editor** — flag this at the end of Task 1 and in the final report.
- Next.js 15: dynamic route handler `params` is a Promise (`{ params }: { params: Promise<{ id: string }> }`).
- Commit messages end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: Migration `0008_rooms.sql`

**Files:**
- Create: `supabase/migrations/0008_rooms.sql`

**Interfaces:**
- Produces: `public.rooms` table; columns exactly as below — later tasks' `RoomRow` type mirrors them.

- [ ] **Step 1: Write the migration**

```sql
-- Clinic room timer board (/admin/rooms). Each row is a tile placed on a
-- grid (grid_row, grid_col). A running timer is stored as timestamps plus a
-- duration — status (Available / In Use / Complete / Overtime) is derived
-- from these at read time, never ticked server-side. Pausing sets
-- timer_paused_at; resuming rewrites timer_started_at so elapsed time is
-- preserved. All three timer_* columns null = room Available.
-- Safe to re-run.

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  grid_row int not null check (grid_row >= 0),
  grid_col int not null check (grid_col >= 0),
  practitioner_name text,
  default_duration_seconds int not null default 900,
  timer_started_at timestamptz,
  timer_duration_seconds int,
  timer_paused_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (grid_row, grid_col)
);

-- Service-role access only, same posture as patients/checkins
alter table public.rooms enable row level security;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/0008_rooms.sql
git commit -m "feat: rooms table migration for room timer board"
```

- [ ] **Step 3: Flag for the user** — this migration must be applied by hand (paste into the Supabase SQL editor). Note it in the task report and again at the end of the whole plan. Nothing else in Tasks 2–3 needs the table, but Task 4 onward does.

---

### Task 2: Pure timer logic — `src/lib/room-status.ts` (TDD)

**Files:**
- Create: `src/lib/room-status.ts`
- Test: `src/lib/room-status.test.ts`

**Interfaces:**
- Consumes: nothing (pure module).
- Produces (used by every later task):
  - `interface RoomRow { id: string; name: string; grid_row: number; grid_col: number; practitioner_name: string | null; default_duration_seconds: number; timer_started_at: string | null; timer_duration_seconds: number | null; timer_paused_at: string | null; updated_at: string }`
  - `type RoomStatus = "available" | "in_use" | "complete" | "overtime"`
  - `interface RoomState { status: RoomStatus; paused: boolean; remainingSeconds: number | null }`
  - `deriveRoomState(room: RoomRow, nowMs: number): RoomState`
  - `type TimerAction = "start" | "pause" | "resume" | "reset" | "adjust" | "clear"`
  - `timerActionUpdate(room: RoomRow, action: TimerAction, nowMs: number, deltaSeconds?: number): { ok: true; fields: Partial<RoomRow> } | { ok: false; error: string }`
  - `formatTimerDisplay(seconds: number): string` — `900 → "15:00"`, `-150 → "+2:30"`, `59 → "0:59"`
  - Constants: `OVERTIME_GRACE_SECONDS = 300`, `ADJUST_STEP_SECONDS = 60`, `MIN_DURATION_SECONDS = 60`, `MAX_DURATION_SECONDS = 3600`, `GRID_COLS = 6`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import {
  deriveRoomState,
  formatTimerDisplay,
  timerActionUpdate,
  OVERTIME_GRACE_SECONDS,
  RoomRow,
} from "./room-status";

const T0 = Date.parse("2026-08-03T10:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();

const baseRoom: RoomRow = {
  id: "r1",
  name: "Room 1",
  grid_row: 0,
  grid_col: 0,
  practitioner_name: null,
  default_duration_seconds: 900,
  timer_started_at: null,
  timer_duration_seconds: null,
  timer_paused_at: null,
  updated_at: iso(T0),
};

const running = (overrides: Partial<RoomRow> = {}): RoomRow => ({
  ...baseRoom,
  timer_started_at: iso(T0),
  timer_duration_seconds: 900,
  ...overrides,
});

describe("deriveRoomState", () => {
  it("is available when no timer is set", () => {
    expect(deriveRoomState(baseRoom, T0)).toEqual({
      status: "available",
      paused: false,
      remainingSeconds: null,
    });
  });

  it("is in_use with correct remaining while running", () => {
    const s = deriveRoomState(running(), T0 + 60_000);
    expect(s.status).toBe("in_use");
    expect(s.paused).toBe(false);
    expect(s.remainingSeconds).toBe(840);
  });

  it("is complete at exactly zero remaining", () => {
    const s = deriveRoomState(running(), T0 + 900_000);
    expect(s.status).toBe("complete");
    expect(s.remainingSeconds).toBe(0);
  });

  it("counts up (negative remaining) while complete", () => {
    const s = deriveRoomState(running(), T0 + 1_050_000);
    expect(s.status).toBe("complete");
    expect(s.remainingSeconds).toBe(-150);
  });

  it("escalates to overtime once past the grace period", () => {
    const s = deriveRoomState(
      running(),
      T0 + (900 + OVERTIME_GRACE_SECONDS) * 1000
    );
    expect(s.status).toBe("overtime");
  });

  it("freezes remaining while paused, regardless of now", () => {
    const room = running({ timer_paused_at: iso(T0 + 300_000) });
    const s = deriveRoomState(room, T0 + 3_600_000);
    expect(s.status).toBe("in_use");
    expect(s.paused).toBe(true);
    expect(s.remainingSeconds).toBe(600);
  });
});

describe("timerActionUpdate", () => {
  it("start uses the room default duration", () => {
    const r = timerActionUpdate(baseRoom, "start", T0);
    expect(r).toEqual({
      ok: true,
      fields: {
        timer_started_at: iso(T0),
        timer_duration_seconds: 900,
        timer_paused_at: null,
      },
    });
  });

  it("start fails when a session is already active", () => {
    expect(timerActionUpdate(running(), "start", T0 + 1000).ok).toBe(false);
  });

  it("pause stamps timer_paused_at", () => {
    const r = timerActionUpdate(running(), "pause", T0 + 60_000);
    expect(r).toEqual({ ok: true, fields: { timer_paused_at: iso(T0 + 60_000) } });
  });

  it("pause fails once the timer has completed", () => {
    expect(timerActionUpdate(running(), "pause", T0 + 901_000).ok).toBe(false);
  });

  it("resume rewrites started_at preserving elapsed time", () => {
    const paused = running({ timer_paused_at: iso(T0 + 300_000) });
    const r = timerActionUpdate(paused, "resume", T0 + 500_000);
    expect(r).toEqual({
      ok: true,
      fields: {
        timer_started_at: iso(T0 + 200_000),
        timer_paused_at: null,
      },
    });
  });

  it("resume fails when not paused", () => {
    expect(timerActionUpdate(running(), "resume", T0).ok).toBe(false);
  });

  it("adjust on an available room edits the persisted default", () => {
    const r = timerActionUpdate(baseRoom, "adjust", T0, 60);
    expect(r).toEqual({ ok: true, fields: { default_duration_seconds: 960 } });
  });

  it("adjust clamps the default to the 60–3600 s range", () => {
    const short = { ...baseRoom, default_duration_seconds: 60 };
    const r = timerActionUpdate(short, "adjust", T0, -60);
    expect(r).toEqual({ ok: true, fields: { default_duration_seconds: 60 } });
  });

  it("adjust on a running room edits the session duration", () => {
    const r = timerActionUpdate(running(), "adjust", T0 + 60_000, 60);
    expect(r).toEqual({ ok: true, fields: { timer_duration_seconds: 960 } });
  });

  it("adjust cannot push remaining below zero", () => {
    const r = timerActionUpdate(running(), "adjust", T0 + 880_000, -60);
    expect(r.ok).toBe(false);
  });

  it("adjust on a completed room can add time back (returns to in_use)", () => {
    const r = timerActionUpdate(running(), "adjust", T0 + 950_000, 120);
    expect(r).toEqual({ ok: true, fields: { timer_duration_seconds: 1020 } });
  });

  it("adjust requires deltaSeconds", () => {
    expect(timerActionUpdate(baseRoom, "adjust", T0).ok).toBe(false);
  });

  it.each(["reset", "clear"] as const)("%s clears all session fields", (a) => {
    const paused = running({ timer_paused_at: iso(T0 + 100_000) });
    expect(timerActionUpdate(paused, a, T0 + 200_000)).toEqual({
      ok: true,
      fields: {
        timer_started_at: null,
        timer_duration_seconds: null,
        timer_paused_at: null,
      },
    });
  });
});

describe("formatTimerDisplay", () => {
  it("formats minutes and seconds", () => {
    expect(formatTimerDisplay(900)).toBe("15:00");
    expect(formatTimerDisplay(59)).toBe("0:59");
    expect(formatTimerDisplay(0)).toBe("0:00");
  });

  it("formats negative values as count-up with a plus sign", () => {
    expect(formatTimerDisplay(-150)).toBe("+2:30");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/room-status.test.ts`
Expected: FAIL — module `./room-status` not found.

- [ ] **Step 3: Implement `src/lib/room-status.ts`**

```ts
// Pure timer math for the room timer board. A running session is stored as
// timestamps + a duration; everything else (status, remaining, what a
// button press changes) is derived here so server routes and every client
// device agree without any ticking state.

export const OVERTIME_GRACE_SECONDS = 300;
export const ADJUST_STEP_SECONDS = 60;
export const MIN_DURATION_SECONDS = 60;
export const MAX_DURATION_SECONDS = 3600;
export const GRID_COLS = 6;

export interface RoomRow {
  id: string;
  name: string;
  grid_row: number;
  grid_col: number;
  practitioner_name: string | null;
  default_duration_seconds: number;
  timer_started_at: string | null;
  timer_duration_seconds: number | null;
  timer_paused_at: string | null;
  updated_at: string;
}

export type RoomStatus = "available" | "in_use" | "complete" | "overtime";

export interface RoomState {
  status: RoomStatus;
  paused: boolean;
  // Seconds left; negative counts up past zero. Null when available.
  remainingSeconds: number | null;
}

function elapsedSeconds(room: RoomRow, nowMs: number): number {
  const startedMs = Date.parse(room.timer_started_at!);
  const effectiveNow = room.timer_paused_at
    ? Date.parse(room.timer_paused_at)
    : nowMs;
  return Math.floor((effectiveNow - startedMs) / 1000);
}

export function deriveRoomState(room: RoomRow, nowMs: number): RoomState {
  if (room.timer_started_at === null || room.timer_duration_seconds === null) {
    return { status: "available", paused: false, remainingSeconds: null };
  }
  const remaining = room.timer_duration_seconds - elapsedSeconds(room, nowMs);
  if (remaining > 0) {
    return {
      status: "in_use",
      paused: room.timer_paused_at !== null,
      remainingSeconds: remaining,
    };
  }
  return {
    status: remaining > -OVERTIME_GRACE_SECONDS ? "complete" : "overtime",
    paused: false,
    remainingSeconds: remaining,
  };
}

export type TimerAction =
  | "start"
  | "pause"
  | "resume"
  | "reset"
  | "adjust"
  | "clear";

export type TimerUpdate =
  | { ok: true; fields: Partial<RoomRow> }
  | { ok: false; error: string };

const clampDuration = (s: number) =>
  Math.min(MAX_DURATION_SECONDS, Math.max(MIN_DURATION_SECONDS, s));

export function timerActionUpdate(
  room: RoomRow,
  action: TimerAction,
  nowMs: number,
  deltaSeconds?: number
): TimerUpdate {
  const state = deriveRoomState(room, nowMs);

  switch (action) {
    case "start":
      if (state.status !== "available") {
        return { ok: false, error: "Timer already running" };
      }
      return {
        ok: true,
        fields: {
          timer_started_at: new Date(nowMs).toISOString(),
          timer_duration_seconds: room.default_duration_seconds,
          timer_paused_at: null,
        },
      };

    case "pause":
      if (state.status !== "in_use" || state.paused) {
        return { ok: false, error: "No running timer to pause" };
      }
      return {
        ok: true,
        fields: { timer_paused_at: new Date(nowMs).toISOString() },
      };

    case "resume": {
      if (state.status !== "in_use" || !state.paused) {
        return { ok: false, error: "Timer is not paused" };
      }
      const elapsedMs =
        Date.parse(room.timer_paused_at!) - Date.parse(room.timer_started_at!);
      return {
        ok: true,
        fields: {
          timer_started_at: new Date(nowMs - elapsedMs).toISOString(),
          timer_paused_at: null,
        },
      };
    }

    case "adjust": {
      if (deltaSeconds === undefined || deltaSeconds === 0) {
        return { ok: false, error: "deltaSeconds required" };
      }
      if (state.status === "available") {
        return {
          ok: true,
          fields: {
            default_duration_seconds: clampDuration(
              room.default_duration_seconds + deltaSeconds
            ),
          },
        };
      }
      const next = Math.min(
        room.timer_duration_seconds! + deltaSeconds,
        MAX_DURATION_SECONDS
      );
      if (next < elapsedSeconds(room, nowMs)) {
        return { ok: false, error: "Cannot reduce below elapsed time" };
      }
      return { ok: true, fields: { timer_duration_seconds: next } };
    }

    case "reset":
    case "clear":
      return {
        ok: true,
        fields: {
          timer_started_at: null,
          timer_duration_seconds: null,
          timer_paused_at: null,
        },
      };
  }
}

export function formatTimerDisplay(seconds: number): string {
  const sign = seconds < 0 ? "+" : "";
  const abs = Math.abs(seconds);
  const m = Math.floor(abs / 60);
  const s = abs % 60;
  return `${sign}${m}:${String(s).padStart(2, "0")}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/room-status.test.ts`
Expected: all PASS. Also run the full suite once: `npm run test` — the existing `validation.test.ts` must still pass.

- [ ] **Step 5: Lint and commit**

```bash
npm run lint:strict
git add src/lib/room-status.ts src/lib/room-status.test.ts
git commit -m "feat: pure room timer state derivation and action logic"
```

---

### Task 3: Realtime helpers — server broadcast + browser client

**Files:**
- Create: `src/lib/rooms-realtime.ts`
- Create: `src/lib/supabase-browser.ts`

**Interfaces:**
- Consumes: env vars `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Produces:
  - `ROOMS_CHANNEL = "room-timers"`, `ROOMS_EVENT = "rooms-updated"` (exported consts)
  - `broadcastRoomsUpdated(): Promise<void>` — server-side, best-effort, never throws (Tasks 4–6 call it after every mutation)
  - `createBrowserClient(): SupabaseClient` (Task 7 subscribes with it)

No unit tests — both are thin I/O wrappers; behavior is verified end-to-end in Task 11's manual QA.

- [ ] **Step 1: Write `src/lib/rooms-realtime.ts`**

```ts
// Cross-device sync for the room timer board. After any rooms mutation the
// server posts to Supabase Realtime's REST broadcast endpoint (no websocket
// needed server-side); subscribed browsers refetch on the message.
// Best-effort by design: if a broadcast is lost, the clients' 60 s poll
// catches them up, and countdown accuracy never depends on it.

export const ROOMS_CHANNEL = "room-timers";
export const ROOMS_EVENT = "rooms-updated";

export async function broadcastRoomsUpdated(): Promise<void> {
  try {
    await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/realtime/v1/api/broadcast`,
      {
        method: "POST",
        headers: {
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: [{ topic: ROOMS_CHANNEL, event: ROOMS_EVENT, payload: {} }],
        }),
      }
    );
  } catch {
    // Swallow: polling is the fallback transport.
  }
}
```

- [ ] **Step 2: Write `src/lib/supabase-browser.ts`**

```ts
import { createClient } from "@supabase/supabase-js";

// Anon-key client for the browser. Used ONLY to subscribe to Realtime
// broadcast channels (no table access — RLS has no policies, so the anon
// key can read nothing; that posture is unchanged by this client).
export function createBrowserClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

- [ ] **Step 3: Lint and commit**

```bash
npm run lint:strict
git add src/lib/rooms-realtime.ts src/lib/supabase-browser.ts
git commit -m "feat: realtime broadcast helper and browser supabase client"
```

---

### Task 4: API — `GET` / `POST` `/api/admin/rooms`

**Files:**
- Create: `src/app/api/admin/rooms/route.ts`

**Interfaces:**
- Consumes: `isAdminAuthorized`, `createServiceClient`, `broadcastRoomsUpdated`, `RoomRow`.
- Produces:
  - `GET` → 200 `{ rooms: RoomRow[], serverTime: string }` (ordered by grid_row, grid_col; `serverTime` is ISO — clients use it for clock-skew offset)
  - `POST` body `{ name: string, gridRow: number, gridCol: number, practitionerName?: string }` → 201 `{ room: RoomRow }`; 400 invalid body; 409 cell occupied

- [ ] **Step 1: Write the route**

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase";
import { isAdminAuthorized } from "@/lib/admin-auth";
import { broadcastRoomsUpdated } from "@/lib/rooms-realtime";
import { GRID_COLS } from "@/lib/room-status";

// Room timer board data. GET returns every room plus the server clock so
// devices with skewed clocks still render identical countdowns.
export async function GET() {
  if (!(await isAdminAuthorized())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("rooms")
    .select("*")
    .order("grid_row")
    .order("grid_col");

  if (error) {
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
  return NextResponse.json({
    rooms: data ?? [],
    serverTime: new Date().toISOString(),
  });
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(40),
  gridRow: z.number().int().min(0).max(49),
  gridCol: z
    .number()
    .int()
    .min(0)
    .max(GRID_COLS - 1),
  practitionerName: z.string().trim().max(60).optional(),
});

export async function POST(req: Request) {
  if (!(await isAdminAuthorized())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("rooms")
    .insert({
      name: parsed.data.name,
      grid_row: parsed.data.gridRow,
      grid_col: parsed.data.gridCol,
      practitioner_name: parsed.data.practitionerName || null,
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "That cell is already occupied" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  await broadcastRoomsUpdated();
  return NextResponse.json({ room: data }, { status: 201 });
}
```

- [ ] **Step 2: Smoke-test locally**

Run `npm run dev`, sign in at `/admin/login`, then in the browser console on any admin page:

```js
await fetch("/api/admin/rooms").then((r) => r.json());
// → { rooms: [], serverTime: "2026-..." }
await fetch("/api/admin/rooms", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name: "Room 1", gridRow: 0, gridCol: 0 }),
}).then((r) => r.json());
// → { room: { id: "...", name: "Room 1", ... } }  (repeat → 409)
```

Also verify unauthenticated 401: `curl -s http://localhost:3000/api/admin/rooms` → `{"error":"Unauthorized"}`.
(Requires migration 0008 applied — see Task 1.)

- [ ] **Step 3: Lint and commit**

```bash
npm run lint:strict
git add src/app/api/admin/rooms/route.ts
git commit -m "feat: rooms collection API (list + create)"
```

---

### Task 5: API — `PATCH` / `DELETE` `/api/admin/rooms/[id]`

**Files:**
- Create: `src/app/api/admin/rooms/[id]/route.ts`

**Interfaces:**
- Consumes: same libs as Task 4.
- Produces:
  - `PATCH` body (all optional): `{ name?, gridRow?, gridCol?, practitionerName? (nullable), defaultDurationSeconds? }` → 200 `{ room: RoomRow }`; 400 invalid/empty; 404 unknown id; 409 cell occupied
  - `DELETE` → 200 `{ success: true }`; 404 unknown id

- [ ] **Step 1: Write the route**

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase";
import { isAdminAuthorized } from "@/lib/admin-auth";
import { broadcastRoomsUpdated } from "@/lib/rooms-realtime";
import {
  GRID_COLS,
  MAX_DURATION_SECONDS,
  MIN_DURATION_SECONDS,
} from "@/lib/room-status";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  gridRow: z.number().int().min(0).max(49).optional(),
  gridCol: z
    .number()
    .int()
    .min(0)
    .max(GRID_COLS - 1)
    .optional(),
  practitionerName: z.string().trim().max(60).nullable().optional(),
  defaultDurationSeconds: z
    .number()
    .int()
    .min(MIN_DURATION_SECONDS)
    .max(MAX_DURATION_SECONDS)
    .optional(),
});

// Edit-layout metadata updates. Timer actions live in ./timer — this route
// never touches the timer_* columns.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAdminAuthorized())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const fields: Record<string, unknown> = {};
  const d = parsed.data;
  if (d.name !== undefined) fields.name = d.name;
  if (d.gridRow !== undefined) fields.grid_row = d.gridRow;
  if (d.gridCol !== undefined) fields.grid_col = d.gridCol;
  if (d.practitionerName !== undefined) {
    fields.practitioner_name = d.practitionerName || null;
  }
  if (d.defaultDurationSeconds !== undefined) {
    fields.default_duration_seconds = d.defaultDurationSeconds;
  }
  if (Object.keys(fields).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }
  fields.updated_at = new Date().toISOString();

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("rooms")
    .update(fields)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "That cell is already occupied" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  await broadcastRoomsUpdated();
  return NextResponse.json({ room: data });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAdminAuthorized())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("rooms")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  await broadcastRoomsUpdated();
  return NextResponse.json({ success: true });
}
```

- [ ] **Step 2: Smoke-test locally** (signed-in browser console; use the room id from Task 4's smoke test)

```js
await fetch("/api/admin/rooms/<id>", {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ practitionerName: "Dr. Ryu", gridCol: 2 }),
}).then((r) => r.json());
// → { room: { ..., practitioner_name: "Dr. Ryu", grid_col: 2 } }
await fetch("/api/admin/rooms/<id>", { method: "DELETE" }).then((r) => r.json());
// → { success: true }  (repeat → 404)
```

- [ ] **Step 3: Lint and commit**

```bash
npm run lint:strict
git add "src/app/api/admin/rooms/[id]/route.ts"
git commit -m "feat: room update and delete API"
```

---

### Task 6: API — `POST` `/api/admin/rooms/[id]/timer`

**Files:**
- Create: `src/app/api/admin/rooms/[id]/timer/route.ts`

**Interfaces:**
- Consumes: `timerActionUpdate`, `TimerAction`, `RoomRow` from `@/lib/room-status`; libs as before.
- Produces: `POST` body `{ action: "start"|"pause"|"resume"|"reset"|"adjust"|"clear", deltaSeconds?: number }` → 200 `{ room: RoomRow }`; 400 invalid body; 404 unknown id; 409 action not valid for current state (e.g. start while running).

- [ ] **Step 1: Write the route**

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase";
import { isAdminAuthorized } from "@/lib/admin-auth";
import { broadcastRoomsUpdated } from "@/lib/rooms-realtime";
import {
  timerActionUpdate,
  ADJUST_STEP_SECONDS,
  RoomRow,
} from "@/lib/room-status";

const bodySchema = z.object({
  action: z.enum(["start", "pause", "resume", "reset", "adjust", "clear"]),
  deltaSeconds: z
    .literal(ADJUST_STEP_SECONDS)
    .or(z.literal(-ADJUST_STEP_SECONDS))
    .optional(),
});

// All timer state changes go through here: read the row, compute the new
// timer_* fields with the same pure logic clients use for display, write,
// broadcast. Last write wins if two devices act at once — both converge on
// the next refetch.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAdminAuthorized())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: room, error: readError } = await supabase
    .from("rooms")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (readError) {
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
  if (!room) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  const result = timerActionUpdate(
    room as RoomRow,
    parsed.data.action,
    Date.now(),
    parsed.data.deltaSeconds
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }

  const { data, error } = await supabase
    .from("rooms")
    .update({ ...result.fields, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  await broadcastRoomsUpdated();
  return NextResponse.json({ room: data });
}
```

- [ ] **Step 2: Smoke-test locally** (signed-in browser console; create a room first)

```js
const act = (id, action, deltaSeconds) =>
  fetch(`/api/admin/rooms/${id}/timer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, deltaSeconds }),
  }).then((r) => r.json());
await act("<id>", "start"); // → timer_started_at set
await act("<id>", "start"); // → { error: "Timer already running" }
await act("<id>", "adjust", 60); // → timer_duration_seconds 960
await act("<id>", "pause"); // → timer_paused_at set
await act("<id>", "resume"); // → timer_paused_at null
await act("<id>", "clear"); // → all timer_* null
```

- [ ] **Step 3: Lint and commit**

```bash
npm run lint:strict
git add "src/app/api/admin/rooms/[id]/timer/route.ts"
git commit -m "feat: room timer action API"
```

---

### Task 7: Client data layer — `useRooms` hook

**Files:**
- Create: `src/app/admin/rooms/useRooms.ts`

**Interfaces:**
- Consumes: `RoomRow` from `@/lib/room-status`; `createBrowserClient`; `ROOMS_CHANNEL`, `ROOMS_EVENT`.
- Produces (Tasks 8–10 build on exactly this):

```ts
function useRooms(): {
  rooms: RoomRow[];
  serverNowMs: number; // skew-corrected clock, updates every second
  loading: boolean;
  connectionError: boolean;
  busyRoomIds: Set<string>;
  actionError: string; // last failed action message, "" when none
  timerAction: (roomId: string, action: TimerAction, deltaSeconds?: number) => Promise<void>;
  createRoom: (input: { name: string; gridRow: number; gridCol: number; practitionerName?: string }) => Promise<void>;
  updateRoom: (roomId: string, input: { name?: string; gridRow?: number; gridCol?: number; practitionerName?: string | null; defaultDurationSeconds?: number }) => Promise<void>;
  deleteRoom: (roomId: string) => Promise<void>;
}
```

Mutations never throw to the caller: on failure they set `actionError` (auto-cleared after 4 s) and refetch to resync.

- [ ] **Step 1: Write the hook**

```ts
"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { RoomRow, TimerAction } from "@/lib/room-status";
import { createBrowserClient } from "@/lib/supabase-browser";
import { ROOMS_CHANNEL, ROOMS_EVENT } from "@/lib/rooms-realtime";

const POLL_MS = 60_000;

// Data layer for the room timer board. Server rows + a skew-corrected
// 1 s clock; realtime broadcast triggers refetch, with polling and
// focus/online refetch as fallback. Display math stays in room-status.ts.
export function useRooms() {
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectionError, setConnectionError] = useState(false);
  const [actionError, setActionError] = useState("");
  const [busyRoomIds, setBusyRoomIds] = useState<Set<string>>(new Set());
  const [tickMs, setTickMs] = useState(() => Date.now());
  const offsetRef = useRef(0);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/rooms");
      if (!res.ok) throw new Error();
      const data = (await res.json()) as {
        rooms: RoomRow[];
        serverTime: string;
      };
      offsetRef.current = Date.parse(data.serverTime) - Date.now();
      setRooms(data.rooms);
      setConnectionError(false);
    } catch {
      setConnectionError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const supabase = createBrowserClient();
    const channel = supabase
      .channel(ROOMS_CHANNEL)
      .on("broadcast", { event: ROOMS_EVENT }, () => {
        refresh();
      })
      .subscribe();
    const poll = setInterval(refresh, POLL_MS);
    const onWake = () => refresh();
    window.addEventListener("online", onWake);
    document.addEventListener("visibilitychange", onWake);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(poll);
      window.removeEventListener("online", onWake);
      document.removeEventListener("visibilitychange", onWake);
    };
  }, [refresh]);

  useEffect(() => {
    const t = setInterval(() => setTickMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const mutate = useCallback(
    async (roomId: string | null, path: string, init: RequestInit) => {
      if (roomId) {
        setBusyRoomIds((prev) => new Set(prev).add(roomId));
      }
      try {
        const res = await fetch(path, {
          headers: { "Content-Type": "application/json" },
          ...init,
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setActionError(data.error ?? "Something went wrong");
          setTimeout(() => setActionError(""), 4000);
        }
      } catch {
        setActionError("Connection problem");
        setTimeout(() => setActionError(""), 4000);
      } finally {
        if (roomId) {
          setBusyRoomIds((prev) => {
            const next = new Set(prev);
            next.delete(roomId);
            return next;
          });
        }
        await refresh();
      }
    },
    [refresh]
  );

  const timerAction = useCallback(
    (roomId: string, action: TimerAction, deltaSeconds?: number) =>
      mutate(roomId, `/api/admin/rooms/${roomId}/timer`, {
        method: "POST",
        body: JSON.stringify({ action, deltaSeconds }),
      }),
    [mutate]
  );

  const createRoom = useCallback(
    (input: {
      name: string;
      gridRow: number;
      gridCol: number;
      practitionerName?: string;
    }) =>
      mutate(null, "/api/admin/rooms", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    [mutate]
  );

  const updateRoom = useCallback(
    (
      roomId: string,
      input: {
        name?: string;
        gridRow?: number;
        gridCol?: number;
        practitionerName?: string | null;
        defaultDurationSeconds?: number;
      }
    ) =>
      mutate(roomId, `/api/admin/rooms/${roomId}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    [mutate]
  );

  const deleteRoom = useCallback(
    (roomId: string) =>
      mutate(roomId, `/api/admin/rooms/${roomId}`, { method: "DELETE" }),
    [mutate]
  );

  return {
    rooms,
    serverNowMs: tickMs + offsetRef.current,
    loading,
    connectionError,
    busyRoomIds,
    actionError,
    timerAction,
    createRoom,
    updateRoom,
    deleteRoom,
  };
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors from the new file (pre-existing errors, if any, are out of scope).

- [ ] **Step 3: Lint and commit**

```bash
npm run lint:strict
git add src/app/admin/rooms/useRooms.ts
git commit -m "feat: useRooms client data hook with realtime sync"
```

---

### Task 8: Live view — `RoomTile` + page

**Files:**
- Create: `src/app/admin/rooms/RoomTile.tsx`
- Create: `src/app/admin/rooms/page.tsx`

**Interfaces:**
- Consumes: `useRooms`, `deriveRoomState`, `formatTimerDisplay`, `ADJUST_STEP_SECONDS`, `GRID_COLS`, `RoomState`, `RoomRow`, `TimerAction`.
- Produces:
  - `RoomTile` props: `{ room: RoomRow; state: RoomState; busy: boolean; onAction: (action: TimerAction, deltaSeconds?: number) => void }`
  - Page renders the grid; Task 9 adds alarm hooks into this page; Task 10 adds the edit-mode branch (the page already holds `editMode` state and renders `<LayoutEditor …>` when true — Task 10 creates that component; until then keep the toggle button but render live view only).

- [ ] **Step 1: Write `RoomTile.tsx`**

```tsx
"use client";
import { Check, Minus, Pause, Play, Plus, RotateCcw } from "lucide-react";
import {
  ADJUST_STEP_SECONDS,
  formatTimerDisplay,
  RoomRow,
  RoomState,
  TimerAction,
} from "@/lib/room-status";

const STATUS_STYLES: Record<
  RoomState["status"],
  { card: string; label: string }
> = {
  available: { card: "bg-emerald-700", label: "Available" },
  in_use: { card: "bg-sky-800", label: "In Use" },
  complete: { card: "bg-amber-600", label: "Remove Needles" },
  overtime: { card: "bg-rose-700", label: "Overtime" },
};

export default function RoomTile({
  room,
  state,
  busy,
  onAction,
}: {
  room: RoomRow;
  state: RoomState;
  busy: boolean;
  onAction: (action: TimerAction, deltaSeconds?: number) => void;
}) {
  const style = STATUS_STYLES[state.status];
  const displaySeconds =
    state.remainingSeconds ?? room.default_duration_seconds;
  const sessionActive = state.status !== "available";

  return (
    <div
      className={`${style.card} rounded-2xl p-4 text-white shadow-lg transition-colors duration-500 flex flex-col gap-3 select-none`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold truncate">{room.name}</h2>
        {room.practitioner_name && (
          <span className="text-xs text-white/70 truncate">
            {room.practitioner_name}
          </span>
        )}
      </div>

      <div className="flex items-center justify-center gap-3">
        <button
          aria-label="Less time"
          disabled={busy}
          onClick={() => onAction("adjust", -ADJUST_STEP_SECONDS)}
          className="rounded-full bg-white/15 p-2 hover:bg-white/25 disabled:opacity-40"
        >
          <Minus className="h-5 w-5" />
        </button>
        <span
          className={`text-4xl font-bold tabular-nums ${
            state.paused ? "animate-pulse" : ""
          }`}
        >
          {formatTimerDisplay(displaySeconds)}
        </span>
        <button
          aria-label="More time"
          disabled={busy}
          onClick={() => onAction("adjust", ADJUST_STEP_SECONDS)}
          className="rounded-full bg-white/15 p-2 hover:bg-white/25 disabled:opacity-40"
        >
          <Plus className="h-5 w-5" />
        </button>
      </div>

      <div className="flex items-center justify-center gap-2">
        {state.status === "available" && (
          <button
            disabled={busy}
            onClick={() => onAction("start")}
            className="flex items-center gap-1.5 rounded-xl bg-white/20 px-4 py-2 font-medium hover:bg-white/30 disabled:opacity-40"
          >
            <Play className="h-4 w-4" /> Start
          </button>
        )}
        {state.status === "in_use" && (
          <button
            disabled={busy}
            onClick={() => onAction(state.paused ? "resume" : "pause")}
            className="flex items-center gap-1.5 rounded-xl bg-white/20 px-4 py-2 font-medium hover:bg-white/30 disabled:opacity-40"
          >
            {state.paused ? (
              <>
                <Play className="h-4 w-4" /> Resume
              </>
            ) : (
              <>
                <Pause className="h-4 w-4" /> Pause
              </>
            )}
          </button>
        )}
        {sessionActive && (
          <>
            <button
              aria-label="Reset timer"
              disabled={busy}
              onClick={() => onAction("reset")}
              className="rounded-xl bg-white/15 p-2.5 hover:bg-white/25 disabled:opacity-40"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
            <button
              aria-label="Clear room"
              disabled={busy}
              onClick={() => onAction("clear")}
              className="rounded-xl bg-white/90 p-2.5 text-emerald-700 hover:bg-white disabled:opacity-40"
            >
              <Check className="h-5 w-5" />
            </button>
          </>
        )}
      </div>

      <p className="text-center text-xs font-semibold uppercase tracking-widest text-white/80">
        {state.paused ? "Paused" : style.label}
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Write `page.tsx`**

```tsx
"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Pencil, X } from "lucide-react";
import { deriveRoomState, GRID_COLS } from "@/lib/room-status";
import { useRooms } from "./useRooms";
import RoomTile from "./RoomTile";

export default function RoomsPage() {
  const {
    rooms,
    serverNowMs,
    loading,
    connectionError,
    busyRoomIds,
    actionError,
    timerAction,
    createRoom,
    updateRoom,
    deleteRoom,
  } = useRooms();
  const [editMode, setEditMode] = useState(false);

  return (
    <main className="min-h-screen bg-neutral-950 p-4 text-white sm:p-6">
      <header className="mx-auto mb-6 flex max-w-5xl items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/dashboard"
            className="rounded-lg bg-white/10 p-2 hover:bg-white/20"
            aria-label="Back to dashboard"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-xl font-semibold">Rooms</h1>
        </div>
        <div className="flex items-center gap-2">
          {connectionError && (
            <span className="text-xs text-amber-400">Reconnecting…</span>
          )}
          <button
            onClick={() => setEditMode((v) => !v)}
            className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 text-sm hover:bg-white/20"
          >
            {editMode ? (
              <>
                <X className="h-4 w-4" /> Done
              </>
            ) : (
              <>
                <Pencil className="h-4 w-4" /> Edit layout
              </>
            )}
          </button>
        </div>
      </header>

      {actionError && (
        <p className="mx-auto mb-4 max-w-5xl rounded-lg bg-rose-900/60 px-4 py-2 text-sm">
          {actionError}
        </p>
      )}

      {loading ? (
        <p className="mx-auto max-w-5xl text-white/60">Loading…</p>
      ) : rooms.length === 0 && !editMode ? (
        <p className="mx-auto max-w-5xl text-white/60">
          No rooms yet — tap “Edit layout” to add your first room.
        </p>
      ) : (
        <div className="mx-auto max-w-5xl overflow-x-auto pb-2">
          <div
            className="grid gap-3"
            style={{
              gridTemplateColumns: `repeat(${GRID_COLS}, minmax(150px, 1fr))`,
            }}
          >
            {rooms.map((room) => (
              <div
                key={room.id}
                style={{
                  gridRowStart: room.grid_row + 1,
                  gridColumnStart: room.grid_col + 1,
                }}
              >
                <RoomTile
                  room={room}
                  state={deriveRoomState(room, serverNowMs)}
                  busy={busyRoomIds.has(room.id)}
                  onAction={(action, deltaSeconds) =>
                    timerAction(room.id, action, deltaSeconds)
                  }
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
```

Note for the implementer: tiles are positioned with `gridRowStart`/`gridColumnStart` from the room's cell (one tile = one cell) — this is what makes the board mirror the clinic floor plan, gaps included. The `minmax(150px, 1fr)` column width plus the `overflow-x-auto` wrapper keeps tiles legible on phones (the board scrolls sideways instead of shrinking).

- [ ] **Step 3: Verify in the browser**

`npm run dev`, sign in, visit `/admin/rooms`. Create a room via the Task 4 console snippet if none exist. Verify: tile renders at its cell, Start begins a live countdown, ± adjusts, Pause freezes and pulses, timer reaching 0:00 flips the tile to orange "Remove Needles" with `+0:01` count-up (set a short duration via `adjust` calls or a temporary 60 s default), ✓ clears. Open a second browser window: actions in one appear in the other within ~1 s.

- [ ] **Step 4: Lint and commit**

```bash
npm run lint:strict
git add src/app/admin/rooms/RoomTile.tsx src/app/admin/rooms/page.tsx
git commit -m "feat: room timer live board at /admin/rooms"
```

---

### Task 9: Alarm, enable-sound banner, wake lock

**Files:**
- Create: `src/app/admin/rooms/useAlarm.ts`
- Modify: `src/app/admin/rooms/page.tsx` (add hook + banner)

**Interfaces:**
- Consumes: `RoomRow[]`, `serverNowMs`, `deriveRoomState`.
- Produces: `useAlarm(rooms: RoomRow[], serverNowMs: number): { soundEnabled: boolean; enableSound: () => void }` — while any room is complete/overtime and sound is enabled, plays a soft two-tone chime immediately and every 45 s. Also requests a screen wake lock.

- [ ] **Step 1: Write `useAlarm.ts`**

```ts
"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { deriveRoomState, RoomRow } from "@/lib/room-status";

const CHIME_REPEAT_MS = 45_000;

// Gentle two-tone chime (A5 → E5 sine, soft envelope) generated with the
// Web Audio API — no audio asset. Browsers block audio until the user
// interacts with the page, so the page shows an enable-sound button that
// calls enableSound() (creating the AudioContext inside the tap handler).
function playChime(ctx: AudioContext) {
  const note = (freq: number, at: number) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, ctx.currentTime + at);
    gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + at + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + at + 1.2);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime + at);
    osc.stop(ctx.currentTime + at + 1.3);
  };
  note(880, 0);
  note(659.25, 0.35);
}

export function useAlarm(rooms: RoomRow[], serverNowMs: number) {
  const [soundEnabled, setSoundEnabled] = useState(false);
  const ctxRef = useRef<AudioContext | null>(null);
  const alarming = rooms.some((room) => {
    const status = deriveRoomState(room, serverNowMs).status;
    return status === "complete" || status === "overtime";
  });

  const enableSound = useCallback(() => {
    if (!ctxRef.current) {
      ctxRef.current = new AudioContext();
    }
    ctxRef.current.resume();
    setSoundEnabled(true);
  }, []);

  useEffect(() => {
    if (!alarming || !soundEnabled || !ctxRef.current) return;
    const ctx = ctxRef.current;
    playChime(ctx);
    const interval = setInterval(() => playChime(ctx), CHIME_REPEAT_MS);
    return () => clearInterval(interval);
  }, [alarming, soundEnabled]);

  // Keep the display awake where the browser allows it (tablets on a wall).
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const request = async () => {
      try {
        lock = (await navigator.wakeLock?.request("screen")) ?? null;
      } catch {
        // Unsupported or denied — staff set device sleep to "never" instead.
      }
    };
    request();
    const onVisible = () => {
      if (document.visibilityState === "visible") request();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      lock?.release().catch(() => {});
    };
  }, []);

  return { soundEnabled, enableSound };
}
```

- [ ] **Step 2: Wire into `page.tsx`**

Add imports and hook call:

```tsx
import { Bell } from "lucide-react";
import { useAlarm } from "./useAlarm";
// inside RoomsPage(), after useRooms():
const { soundEnabled, enableSound } = useAlarm(rooms, serverNowMs);
```

Add the banner directly under the `<header>` (before the `actionError` block):

```tsx
{!soundEnabled && (
  <button
    onClick={enableSound}
    className="mx-auto mb-4 flex w-full max-w-5xl items-center gap-2 rounded-lg bg-sky-900/60 px-4 py-2 text-sm hover:bg-sky-900"
  >
    <Bell className="h-4 w-4" /> Tap to enable the timer chime on this device
  </button>
)}
```

TypeScript note: `navigator.wakeLock` may need a narrow cast depending on the DOM lib version — if `tsc` complains, type it as `(navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock`.

- [ ] **Step 3: Verify in the browser**

Tap the banner (it disappears), start a short timer (use ± to reach 1:00), wait for 0:00 → chime plays, tile turns orange; chime repeats after 45 s; ✓ clear silences it. Reload → banner is back (per-session by design).

- [ ] **Step 4: Lint and commit**

```bash
npm run lint:strict
git add src/app/admin/rooms/useAlarm.ts src/app/admin/rooms/page.tsx
git commit -m "feat: timer chime alarm and screen wake lock"
```

---

### Task 10: Layout editor

**Files:**
- Create: `src/app/admin/rooms/LayoutEditor.tsx`
- Modify: `src/app/admin/rooms/page.tsx` (render it when `editMode`)

**Interfaces:**
- Consumes: `RoomRow`, `GRID_COLS`, `MIN_DURATION_SECONDS`, `MAX_DURATION_SECONDS`, and `createRoom`/`updateRoom`/`deleteRoom` from `useRooms` (passed as props).
- Produces: `LayoutEditor` props:

```ts
{
  rooms: RoomRow[];
  onCreate: (input: { name: string; gridRow: number; gridCol: number; practitionerName?: string }) => Promise<void>;
  onUpdate: (roomId: string, input: { name?: string; gridRow?: number; gridCol?: number; practitionerName?: string | null; defaultDurationSeconds?: number }) => Promise<void>;
  onDelete: (roomId: string) => Promise<void>;
}
```

- [ ] **Step 1: Write `LayoutEditor.tsx`**

Behavior: grid of all cells for rows `0..maxRow+1` (always one spare empty row). Tapping an empty cell: if a room is armed for moving, move it there; otherwise open the create panel for that cell. Tapping a room opens the edit panel (rename, practitioner, default minutes, Move, Delete). "Move" arms move mode — highlighted hint, next empty-cell tap calls `onUpdate(id, { gridRow, gridCol })`.

```tsx
"use client";
import { useState } from "react";
import { Move, Trash2 } from "lucide-react";
import {
  GRID_COLS,
  MAX_DURATION_SECONDS,
  MIN_DURATION_SECONDS,
  RoomRow,
} from "@/lib/room-status";

interface PanelState {
  mode: "create" | "edit";
  room?: RoomRow;
  gridRow: number;
  gridCol: number;
}

export default function LayoutEditor({
  rooms,
  onCreate,
  onUpdate,
  onDelete,
}: {
  rooms: RoomRow[];
  onCreate: (input: {
    name: string;
    gridRow: number;
    gridCol: number;
    practitionerName?: string;
  }) => Promise<void>;
  onUpdate: (
    roomId: string,
    input: {
      name?: string;
      gridRow?: number;
      gridCol?: number;
      practitionerName?: string | null;
      defaultDurationSeconds?: number;
    }
  ) => Promise<void>;
  onDelete: (roomId: string) => Promise<void>;
}) {
  const [panel, setPanel] = useState<PanelState | null>(null);
  const [movingRoom, setMovingRoom] = useState<RoomRow | null>(null);
  const [name, setName] = useState("");
  const [practitioner, setPractitioner] = useState("");
  const [minutes, setMinutes] = useState(15);
  const [saving, setSaving] = useState(false);

  const maxRow = rooms.reduce((m, r) => Math.max(m, r.grid_row), 0);
  const rowCount = maxRow + 2;
  const byCell = new Map(rooms.map((r) => [`${r.grid_row}:${r.grid_col}`, r]));

  const openCreate = (gridRow: number, gridCol: number) => {
    setName("");
    setPractitioner("");
    setPanel({ mode: "create", gridRow, gridCol });
  };

  const openEdit = (room: RoomRow) => {
    setName(room.name);
    setPractitioner(room.practitioner_name ?? "");
    setMinutes(Math.round(room.default_duration_seconds / 60));
    setPanel({
      mode: "edit",
      room,
      gridRow: room.grid_row,
      gridCol: room.grid_col,
    });
  };

  const tapEmptyCell = async (gridRow: number, gridCol: number) => {
    if (movingRoom) {
      setSaving(true);
      await onUpdate(movingRoom.id, { gridRow, gridCol });
      setSaving(false);
      setMovingRoom(null);
      return;
    }
    openCreate(gridRow, gridCol);
  };

  const submitPanel = async () => {
    if (!panel || !name.trim()) return;
    setSaving(true);
    if (panel.mode === "create") {
      await onCreate({
        name: name.trim(),
        gridRow: panel.gridRow,
        gridCol: panel.gridCol,
        practitionerName: practitioner.trim() || undefined,
      });
    } else if (panel.room) {
      await onUpdate(panel.room.id, {
        name: name.trim(),
        practitionerName: practitioner.trim() || null,
        defaultDurationSeconds: Math.min(
          MAX_DURATION_SECONDS,
          Math.max(MIN_DURATION_SECONDS, minutes * 60)
        ),
      });
    }
    setSaving(false);
    setPanel(null);
  };

  return (
    <div className="mx-auto max-w-5xl">
      {movingRoom && (
        <p className="mb-3 rounded-lg bg-sky-900/60 px-4 py-2 text-sm">
          Moving “{movingRoom.name}” — tap an empty cell, or{" "}
          <button className="underline" onClick={() => setMovingRoom(null)}>
            cancel
          </button>
        </p>
      )}

      <div className="overflow-x-auto pb-2">
        <div
          className="grid gap-3"
          style={{
            gridTemplateColumns: `repeat(${GRID_COLS}, minmax(120px, 1fr))`,
          }}
        >
          {Array.from({ length: rowCount * GRID_COLS }, (_, i) => {
          const gridRow = Math.floor(i / GRID_COLS);
          const gridCol = i % GRID_COLS;
          const room = byCell.get(`${gridRow}:${gridCol}`);
          if (room) {
            return (
              <button
                key={i}
                disabled={saving}
                onClick={() => openEdit(room)}
                className={`min-h-24 rounded-2xl p-3 text-left ${
                  movingRoom?.id === room.id
                    ? "bg-sky-700 ring-2 ring-sky-300"
                    : "bg-neutral-700 hover:bg-neutral-600"
                }`}
              >
                <span className="block truncate font-medium">{room.name}</span>
                {room.practitioner_name && (
                  <span className="block truncate text-xs text-white/60">
                    {room.practitioner_name}
                  </span>
                )}
              </button>
            );
          }
          return (
            <button
              key={i}
              disabled={saving}
              aria-label={`Empty cell row ${gridRow + 1} column ${gridCol + 1}`}
              onClick={() => tapEmptyCell(gridRow, gridCol)}
              className="min-h-24 rounded-2xl border-2 border-dashed border-neutral-800 hover:border-neutral-600"
            />
          );
          })}
        </div>
      </div>

      {panel && (
        <div className="fixed inset-0 z-10 flex items-end justify-center bg-black/60 p-4 sm:items-center">
          <div className="w-full max-w-sm rounded-2xl bg-neutral-900 p-5">
            <h2 className="mb-4 text-lg font-semibold">
              {panel.mode === "create" ? "New room" : "Edit room"}
            </h2>
            <label className="mb-3 block text-sm">
              Name
              <input
                autoFocus
                value={name}
                maxLength={40}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-lg bg-neutral-800 px-3 py-2"
              />
            </label>
            <label className="mb-3 block text-sm">
              Practitioner (optional)
              <input
                value={practitioner}
                maxLength={60}
                onChange={(e) => setPractitioner(e.target.value)}
                className="mt-1 w-full rounded-lg bg-neutral-800 px-3 py-2"
              />
            </label>
            {panel.mode === "edit" && (
              <label className="mb-3 block text-sm">
                Default minutes
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={minutes}
                  onChange={(e) => setMinutes(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg bg-neutral-800 px-3 py-2"
                />
              </label>
            )}
            <div className="mt-4 flex items-center gap-2">
              <button
                disabled={saving || !name.trim()}
                onClick={submitPanel}
                className="rounded-lg bg-white px-4 py-2 font-medium text-neutral-900 disabled:opacity-40"
              >
                Save
              </button>
              <button
                onClick={() => setPanel(null)}
                className="rounded-lg bg-white/10 px-4 py-2"
              >
                Cancel
              </button>
              {panel.mode === "edit" && panel.room && (
                <>
                  <button
                    aria-label="Move room"
                    onClick={() => {
                      setMovingRoom(panel.room!);
                      setPanel(null);
                    }}
                    className="ml-auto rounded-lg bg-white/10 p-2.5"
                  >
                    <Move className="h-4 w-4" />
                  </button>
                  <button
                    aria-label="Delete room"
                    disabled={saving}
                    onClick={async () => {
                      setSaving(true);
                      await onDelete(panel.room!.id);
                      setSaving(false);
                      setPanel(null);
                    }}
                    className="rounded-lg bg-rose-900/70 p-2.5"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire into `page.tsx`**

Import it, and replace the grid block with an edit-mode branch:

```tsx
import LayoutEditor from "./LayoutEditor";
// in the JSX, where the loading/empty/grid branch is:
{loading ? (
  <p className="mx-auto max-w-5xl text-white/60">Loading…</p>
) : editMode ? (
  <LayoutEditor
    rooms={rooms}
    onCreate={createRoom}
    onUpdate={updateRoom}
    onDelete={deleteRoom}
  />
) : rooms.length === 0 ? (
  /* …empty-state paragraph unchanged… */
) : (
  /* …live grid unchanged… */
)}
```

- [ ] **Step 3: Verify in the browser**

Edit layout → tap empty cell → create "Room 2" → appears immediately and in the second browser window. Tap it → rename, set practitioner, change default minutes → Save. Move it to another cell; move onto an occupied cell target is impossible (occupied cells open their own edit panel). Delete a room. Exit edit mode → live view reflects everything.

- [ ] **Step 4: Lint and commit**

```bash
npm run lint:strict
git add src/app/admin/rooms/LayoutEditor.tsx src/app/admin/rooms/page.tsx
git commit -m "feat: room layout editor (create, edit, move, delete)"
```

---

### Task 11: Dashboard link, build gate, manual QA

**Files:**
- Modify: `src/app/admin/dashboard/page.tsx` (header area — add a link to `/admin/rooms`)

**Interfaces:**
- Consumes: existing dashboard header markup (read the file first; it already imports `Link` from `next/link` and icons from `lucide-react`).
- Produces: a "Rooms" button in the dashboard header.

- [ ] **Step 1: Add the link**

Find the dashboard header (near the existing tab buttons / sign-out control) and add, styled to match the neighboring buttons:

```tsx
import { Timer } from "lucide-react";
// …
<Link
  href="/admin/rooms"
  className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 text-sm hover:bg-white/20"
>
  <Timer className="h-4 w-4" /> Rooms
</Link>
```

Match the exact class names of adjacent header buttons when they differ from the above.

- [ ] **Step 2: Full gates**

Run: `npm run test` → all pass. `npm run lint:strict` → clean. `npm run build` → succeeds (this is what Vercel runs).

- [ ] **Step 3: Manual QA checklist** (two browser windows, both signed in)

- Start in window A → countdown appears in window B within ~1 s, same value.
- ± / pause / resume / reset / clear each sync both ways.
- Kill the dev server, restart — windows recover via poll/refetch without reload weirdness.
- Timer to 0:00 → both windows show orange "Remove Needles", chime on whichever has sound enabled; +5 min later → red Overtime.
- Layout edits (create/move/rename/delete) appear live in the other window.
- Phone-width viewport (devtools): tiles stay legible (≥150px) and the board scrolls horizontally instead of shrinking.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/dashboard/page.tsx
git commit -m "feat: link room timer board from dashboard"
```

- [ ] **Step 5: Final report to the user** — remind them: migration `supabase/migrations/0008_rooms.sql` must be pasted into the Supabase SQL editor (it hasn't been auto-applied), and each device needs one tap on the sound banner per session.
