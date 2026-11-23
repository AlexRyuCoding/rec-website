// The app's own queries against a real PostgREST and a real Postgres —
// the pair that replaces Supabase's REST layer on Google Cloud. Run with
// `npm run test:rest` (scripts/test-rest.sh starts both in Docker, with
// every migration applied); it is not part of `npm test`.
//
// What this is for: the version pinned in deploy/versions.env was chosen
// by these cases, not copied from Supabase. A case that fails is a real
// difference between this PostgREST and the one the app was written
// against: change the pinned version or PostgREST's settings, never the
// app's query code.
//
// Every case goes through createServiceClient() unless it says otherwise,
// uses made-up names, and removes its rows.
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { parsePatientSearch } from "./patient-search";
import { searchPatients } from "./patient-search-server";
import { createServiceClient, fetchAllPatientsWithPins } from "./supabase";
import { applyFlowChange } from "./visits-server";

const URL_ = process.env.DB_REST_URL;
const JWT = process.env.DB_REST_JWT;
// Marks this run's rows, so they can be found again and removed.
const RUN = `it-${Date.now().toString(36)}`;
const STAFF = `${RUN}@example.com`;

const NOTHING_LISTENING = "http://127.0.0.1:54339";

const db = () => createServiceClient();
let n = 0;
const patient = (extra: Record<string, unknown> = {}) => ({
  first_name: "Madeup",
  last_name: "Person",
  pb_client_id: `${RUN}-${++n}`,
  ...extra,
});

async function removeRows() {
  const client = db();
  // Check-ins go with their patients (on delete cascade).
  await client.from("patients").delete().like("pb_client_id", `${RUN}-%`);
  await client.from("rooms").delete().like("name", `${RUN}%`);
  await client.from("staff_audit_log").delete().eq("staff_email", STAFF);
}

beforeAll(() => {
  if (!URL_ || !JWT) {
    throw new Error(
      "DB_REST_URL and DB_REST_JWT are not set — run this with `npm run test:rest`"
    );
  }
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await removeRows();
});
afterAll(removeRows);

describe("reading and writing rows", () => {
  it("maybeSingle() on no match is null without an error", async () => {
    const res = await db()
      .from("patients")
      .select("id")
      .eq("pb_client_id", `${RUN}-nobody`)
      .maybeSingle();
    expect(res.data).toBeNull();
    expect(res.error).toBeNull();
  });

  it("an insert hands the row back, with the generated phone_digits", async () => {
    const { data, error } = await db()
      .from("patients")
      .insert(patient({ phone: "(555) 010-0142" }))
      .select()
      .single();
    expect(error).toBeNull();
    expect(data.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(data.phone_digits).toBe("5550100142");
  });

  it("a second patient with the same pin_lookup is refused as 23505", async () => {
    const lookup = `k1:${RUN}-same`;
    const first = await db()
      .from("patients")
      .insert(patient({ pin: "made-up-hash", pin_lookup: lookup }));
    expect(first.error).toBeNull();
    const second = await db()
      .from("patients")
      .insert(patient({ pin: "made-up-hash-2", pin_lookup: lookup }));
    expect(second.error?.code).toBe("23505");
  });

  it("upsert on pb_client_id changes the row instead of adding one", async () => {
    const row = patient({ first_name: "Before" });
    const one = await db()
      .from("patients")
      .upsert(row, { onConflict: "pb_client_id" });
    expect(one.error).toBeNull();
    const two = await db()
      .from("patients")
      .upsert({ ...row, first_name: "After" }, { onConflict: "pb_client_id" });
    expect(two.error).toBeNull();
    const { data, error } = await db()
      .from("patients")
      .select("first_name")
      .eq("pb_client_id", row.pb_client_id);
    expect(error).toBeNull();
    expect(data).toEqual([{ first_name: "After" }]);
  });

  it("an update hands the changed row back; a delete removes it", async () => {
    const row = patient();
    await db().from("patients").insert(row);
    const updated = await db()
      .from("patients")
      .update({ last_name: "Changed" })
      .eq("pb_client_id", row.pb_client_id)
      .select("last_name")
      .single();
    expect(updated.error).toBeNull();
    expect(updated.data).toEqual({ last_name: "Changed" });
    const removed = await db()
      .from("patients")
      .delete()
      .eq("pb_client_id", row.pb_client_id);
    expect(removed.error).toBeNull();
    const after = await db()
      .from("patients")
      .select("id")
      .eq("pb_client_id", row.pb_client_id)
      .maybeSingle();
    expect(after).toMatchObject({ data: null, error: null });
  });
});

describe("the 1,000-row cap and counting", () => {
  it("fetchAllPatientsWithPins pages past the cap: 1,001 of 1,001", async () => {
    const rows = Array.from({ length: 1001 }, () =>
      patient({ pin: "made-up-hash" })
    );
    const inserted = await db().from("patients").insert(rows);
    expect(inserted.error).toBeNull();

    // The cap itself: one request never returns more than 1,000 rows.
    const capped = await db()
      .from("patients")
      .select("id")
      .like("pb_client_id", `${RUN}-%`);
    expect(capped.error).toBeNull();
    expect(capped.data).toHaveLength(1000);

    const all = await fetchAllPatientsWithPins(db());
    const mine = all.filter((p) => p.pb_client_id?.startsWith(`${RUN}-`));
    expect(mine).toHaveLength(1001);
  });

  it("count: exact with head: true gives a number and no rows", async () => {
    await db().from("patients").insert([patient(), patient(), patient()]);
    const res = await db()
      .from("patients")
      .select("id", { count: "exact", head: true })
      .like("pb_client_id", `${RUN}-%`);
    expect(res.error).toBeNull();
    expect(res.count).toBe(3);
    expect(res.data).toBeNull();
  });

  it("count: exact beside a page of rows counts the whole match", async () => {
    await db().from("patients").insert([patient(), patient(), patient()]);
    const res = await db()
      .from("patients")
      .select("id", { count: "exact" })
      .like("pb_client_id", `${RUN}-%`)
      .order("id")
      .range(0, 1);
    expect(res.error).toBeNull();
    expect(res.data).toHaveLength(2);
    expect(res.count).toBe(3);
  });
});

describe("filters", () => {
  it("contains() finds an audit row by one of its patient ids", async () => {
    const a = "00000000-0000-4000-8000-0000000000b1";
    const b = "00000000-0000-4000-8000-0000000000b2";
    const added = await db()
      .from("staff_audit_log")
      .insert({
        staff_email: STAFF,
        action: "patient_search",
        patient_ids: [a, b],
        detail: "made up",
      });
    expect(added.error).toBeNull();
    const found = await db()
      .from("staff_audit_log")
      .select("patient_ids")
      .eq("staff_email", STAFF)
      .contains("patient_ids", [b]);
    expect(found.error).toBeNull();
    expect(found.data).toEqual([{ patient_ids: [a, b] }]);
    const none = await db()
      .from("staff_audit_log")
      .select("id")
      .eq("staff_email", STAFF)
      .contains("patient_ids", ["00000000-0000-4000-8000-0000000000b3"]);
    expect(none.data).toEqual([]);
  });

  it("in, gte, lt, is, order and limit in one query on checkins", async () => {
    const people = await db()
      .from("patients")
      .insert([patient(), patient(), patient()])
      .select("id");
    expect(people.error).toBeNull();
    const [p1, p2, p3] = people.data!.map((p) => p.id);
    const at = (hour: number) => `2026-03-0${hour}T12:00:00+00:00`;
    const added = await db()
      .from("checkins")
      .insert([
        { patient_id: p1, checked_in_at: at(1) },
        { patient_id: p1, checked_in_at: at(2) },
        { patient_id: p2, checked_in_at: at(3), done_at: at(4) },
        { patient_id: p2, checked_in_at: at(4) },
        { patient_id: p2, checked_in_at: at(5) },
        { patient_id: p3, checked_in_at: at(3) },
      ]);
    expect(added.error).toBeNull();

    const res = await db()
      .from("checkins")
      .select("patient_id, checked_in_at")
      .in("patient_id", [p1, p2])
      .gte("checked_in_at", at(2))
      .lt("checked_in_at", at(5))
      .is("done_at", null)
      .order("checked_in_at", { ascending: false })
      .limit(5);
    expect(res.error).toBeNull();
    expect(
      res.data!.map((c) => [c.patient_id, new Date(c.checked_in_at).getTime()])
    ).toEqual([
      [p2, new Date(at(4)).getTime()],
      [p1, new Date(at(2)).getTime()],
    ]);
  });
});

describe("the two database functions", () => {
  it("searchPatients ignores accents and forgives a close spelling", async () => {
    // Proves unaccent and pg_trgm are installed and usable by the app's
    // role (they live in the "extensions" schema, which the function
    // names in its own search path).
    const row = patient({ first_name: "José", last_name: `Licater${RUN}` });
    await db().from("patients").insert(row);
    const search = parsePatientSearch(`jose licatr${RUN}`);
    if (search.kind === "too-short") throw new Error("search too short");
    const outcome = await searchPatients(db(), search);
    expect(outcome).not.toBe("error");
    if (outcome === "error") return;
    expect(outcome.patients).toHaveLength(1);
    expect(outcome.patients[0]).toMatchObject({
      first_name: "José",
      last_name: `Licater${RUN}`,
      has_pin: false,
    });
    expect(outcome.patients[0]).not.toHaveProperty("pin");
  });

  it("applyFlowChange writes a visit and its room together", async () => {
    const person = await db()
      .from("patients")
      .insert(patient())
      .select("id")
      .single();
    const room = await db()
      .from("rooms")
      .insert({
        name: `${RUN} room`,
        grid_row: 90,
        grid_col: 0,
        turnover_started_at: "2026-03-01T12:00:00+00:00",
      })
      .select("id")
      .single();
    expect(room.error).toBeNull();
    const visit = await db()
      .from("checkins")
      .insert({ patient_id: person.data!.id, room_id: room.data!.id })
      .select("id")
      .single();
    expect(visit.error).toBeNull();

    const result = await applyFlowChange(db(), {
      updates: [
        { id: visit.data!.id, fields: { done_at: "2026-03-01T13:00:00Z" } },
      ],
      room: { id: room.data!.id, fields: { turnover_started_at: null } },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.room).toMatchObject({
      id: room.data!.id,
      turnover_started_at: null,
    });
    const after = await db()
      .from("checkins")
      .select("done_at")
      .eq("id", visit.data!.id)
      .single();
    expect(new Date(after.data!.done_at).toISOString()).toBe(
      "2026-03-01T13:00:00.000Z"
    );
  });

  it("a function that does not exist is PGRST202 — what the app checks for", async () => {
    const res = await db().rpc("no_such_function_anywhere", { a: 1 });
    expect(res.error?.code).toBe("PGRST202");
  });
});

describe("without the app's token", () => {
  // Plain fetch on purpose: this is what anything other than the app sends.
  it("no token is refused with 401 — there is no anonymous role at all", async () => {
    const res = await fetch(`${URL_}/patients`);
    expect(res.status).toBe(401);
    // PostgREST's own refusal, before the database is asked anything.
    expect((await res.json()).code).toBe("PGRST302");
  });

  it("a token that is not one is refused with 401", async () => {
    const res = await fetch(`${URL_}/patients`, {
      headers: { Authorization: "Bearer not-a-jwt" },
    });
    expect(res.status).toBe(401);
  });

  it("a well-formed token signed with another secret is refused with 401", async () => {
    const [header, payload] = JWT!.split(".");
    const res = await fetch(`${URL_}/patients`, {
      headers: {
        Authorization: `Bearer ${header}.${payload}.${"A".repeat(43)}`,
      },
    });
    expect(res.status).toBe(401);
  });

  it("neither can a write or a function call get through", async () => {
    const write = await fetch(`${URL_}/patients`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patient()),
    });
    expect(write.status).toBe(401);
    const call = await fetch(`${URL_}/rpc/search_patients`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ search_words: ["madeup"] }),
    });
    expect(call.status).toBe(401);
    const none = await db()
      .from("patients")
      .select("id", { count: "exact", head: true })
      .like("pb_client_id", `${RUN}-%`);
    expect(none.count).toBe(0);
  });
});

describe("when PostgREST is not answering", () => {
  it("a query resolves with an error and does not throw", async () => {
    // Nothing listens there: a sidecar that is restarting looks the same.
    // (Not port 1, which fetch refuses to try at all.) The read takes
    // about 7 s: supabase-js tries a read again three times, 1, 2 and 4 s
    // apart, before giving the error — as it does against Supabase.
    vi.stubEnv("DB_REST_URL", NOTHING_LISTENING);
    const res = await createServiceClient().from("rooms").select("*");
    expect(res.data).toBeNull();
    expect(res.error).not.toBeNull();
    const call = await createServiceClient().rpc("search_patients", {});
    expect(call.data).toBeNull();
    expect(call.error).not.toBeNull();
  });
});
