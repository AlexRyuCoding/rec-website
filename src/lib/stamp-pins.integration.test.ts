// The whole point of the stamping job (deploy/ops/stamp-pins.sh), end to
// end: after it has run, the APP finds a patient by PIN the fast way, and
// a wrong PIN is answered "not found" without being compared against
// anyone. Before it, a wrong PIN costs one bcrypt compare per PIN holder
// — about ten seconds at the kiosk on the live site.
//
// It goes the way the runbook has the owner go: the job refuses to stamp
// until a patient has signed in at the kiosk (the app's own fingerprint
// is its evidence that the job's secret is the site's), then counts,
// then stamps.
//
// Run with `npm run test:rest`, which builds the ops image (as Cloud
// Build does) and starts Postgres + PostgREST. The job here is that
// image's own copy, with its Node and its bcryptjs, connecting to the
// database with a password as it does on Cloud SQL; the sign-in is the
// app's own findPatientByPin, through createServiceClient().
// Made-up patients, PINs and secret; the rows are removed afterwards.
import { spawnSync } from "child_process";
import bcrypt from "bcryptjs";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { pinFingerprint } from "./pin-lookup";
import { findPatientByPin } from "./pin-server";
import { createServiceClient } from "./supabase";

const RUN = `stamp-${Date.now().toString(36)}`;
// Made up. The app reads it from NEXTAUTH_SECRET; the job is given the
// same value, as both get the same secret on Cloud Run.
const SECRET = `made-up-secret-${RUN}`;

const db = () => createServiceClient();

// The job, in the ops image, beside the test's database.
function stampPins(mode: "count" | "stamp") {
  const project = process.env.TEST_REST_COMPOSE_PROJECT;
  const file = process.env.TEST_REST_COMPOSE_FILE;
  if (!project || !file) {
    throw new Error(
      "TEST_REST_COMPOSE_PROJECT is not set — run this with `npm run test:rest`"
    );
  }
  const run = spawnSync(
    "docker",
    // prettier-ignore
    [
      "compose", "-p", project, "-f", file, "--profile", "ops",
      // A fixed name: a made-up one could hold, by chance, the digits
      // this test then looks for in what was printed.
      "run", "--rm", "-T", "--name", `${project}-stamp-pins`,
      // By name only: the value travels in the environment.
      "-e", "NEXTAUTH_SECRET",
      "ops", "/app/deploy/ops/stamp-pins.sh", mode,
    ],
    {
      encoding: "utf8",
      env: { ...process.env, NEXTAUTH_SECRET: SECRET },
      timeout: 240_000,
    }
  );
  return {
    status: run.status,
    stdout: run.stdout ?? "",
    stderr: run.stderr ?? "",
  };
}

interface Holder {
  name: string;
  pin: string;
  cost: number;
}
// The one who signs in at the kiosk before the job is run.
const REGULAR: Holder = { name: "Ada", pin: "2580", cost: 4 };
// The ones the job is for: as the app makes them (cost 8), and two quick.
const UNSTAMPED: Holder[] = [
  { name: "Opal", pin: "1975", cost: 8 },
  { name: "Quill", pin: "8351", cost: 4 },
  { name: "Wren", pin: "0704", cost: 4 },
];
const HOLDERS = [REGULAR, ...UNSTAMPED];
const WRONG_PIN = "6392";

const rows = new Map<string, { id: string; pin: string }>();

async function removeRows() {
  await db().from("patients").delete().like("pb_client_id", `${RUN}-%`);
}
async function lookupOf(name: string) {
  const { data, error } = await db()
    .from("patients")
    .select("pin, pin_lookup")
    .eq("id", rows.get(name)!.id)
    .single();
  expect(error).toBeNull();
  return data as { pin: string | null; pin_lookup: string | null };
}
// Nothing of a patient's, and not the secret, in what the job printed.
function expectCountsOnly(said: string) {
  for (const holder of HOLDERS) {
    const { id, pin } = rows.get(holder.name)!;
    for (const theirs of [id, pin, holder.name, holder.pin]) {
      expect(said).not.toContain(theirs);
    }
    expect(said).not.toContain(pinFingerprint(holder.pin, SECRET));
  }
  expect(said).not.toContain(SECRET);
  expect(said).not.toContain("Madeupson");
}

beforeAll(async () => {
  if (!process.env.DB_REST_URL || !process.env.DB_REST_JWT) {
    throw new Error(
      "DB_REST_URL and DB_REST_JWT are not set — run this with `npm run test:rest`"
    );
  }
  // The job stamps every PIN holder in the database: this test must be
  // looking at its own patients and nobody else's.
  const others = await db()
    .from("patients")
    .select("id", { count: "exact", head: true })
    .not("pin", "is", null);
  expect(others.error).toBeNull();
  expect(others.count).toBe(0);

  let n = 0;
  for (const holder of HOLDERS) {
    const pin = await bcrypt.hash(holder.pin, holder.cost);
    const { data, error } = await db()
      .from("patients")
      .insert({
        first_name: holder.name,
        last_name: "Madeupson",
        pb_client_id: `${RUN}-${++n}`,
        pin,
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    rows.set(holder.name, { id: data!.id, pin });
  }
  // One without a PIN: never touched.
  const none = await db()
    .from("patients")
    .insert({
      first_name: "Nopin",
      last_name: "Madeupson",
      pb_client_id: `${RUN}-${++n}`,
    });
  expect(none.error).toBeNull();
}, 60_000);

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
afterAll(removeRows);

describe("the stamping job, then the app's own sign-in", () => {
  it("before: a wrong PIN is compared against every PIN holder", async () => {
    vi.stubEnv("NEXTAUTH_SECRET", SECRET);
    const compare = vi.spyOn(bcrypt, "compare");
    expect(await findPatientByPin(db(), WRONG_PIN)).toBeNull();
    expect(compare).toHaveBeenCalledTimes(HOLDERS.length);
  });

  it("the job refuses to stamp while no patient has signed in — nothing shows its secret is the site's", async () => {
    const { status, stdout, stderr } = stampPins("stamp");
    expect(stderr).toMatch(
      /^stamp-pins task 1\/1 stopped: refusing to stamp, nothing was written: no patient/m
    );
    expect(status).toBe(1);
    for (const holder of HOLDERS) {
      expect((await lookupOf(holder.name)).pin_lookup).toBeNull();
    }
    expectCountsOnly(stdout + stderr);
  }, 120_000);

  it("a patient signs in at the kiosk: the app stamps her, with the site's secret", async () => {
    vi.stubEnv("NEXTAUTH_SECRET", SECRET);
    const found = await findPatientByPin(db(), REGULAR.pin);
    expect(found).toMatchObject({ id: rows.get(REGULAR.name)!.id });
    expect((await lookupOf(REGULAR.name)).pin_lookup).toBe(
      pinFingerprint(REGULAR.pin, SECRET)
    );
  });

  it("count says how many have no current fingerprint, and changes nothing", () => {
    const { status, stdout, stderr } = stampPins("count");
    expect(stderr + stdout).toContain(
      "stamp-pins count: pin_holders=4 current=1 without=3 never_stamped=3 other_key=0 unusable=0"
    );
    expect(stdout).not.toContain("would refuse");
    expect(stdout).toContain("stamp-pins count: nothing was changed");
    expect(status).toBe(0);
  }, 120_000);

  it("the job stamps the other three, and prints nothing of theirs", async () => {
    const { status, stdout, stderr } = stampPins("stamp");
    expect(stdout).toMatch(
      /^stamp-pins task 1\/1 done: seen=3 stamped=3 took_over=0 same_pin=0 no_match=0 unusable=0 changed=0 minutes=\d+$/m
    );
    expect(status).toBe(0);

    for (const holder of HOLDERS) {
      const after = await lookupOf(holder.name);
      // Exactly what the app would have stored at this patient's next
      // sign-in — and the hash is the one it was.
      expect(after.pin_lookup).toBe(pinFingerprint(holder.pin, SECRET));
      expect(after.pin).toBe(rows.get(holder.name)!.pin);
    }
    expectCountsOnly(stdout + stderr);
  }, 240_000);

  it("after: each stamped patient signs in with ONE compare — the fast way", async () => {
    vi.stubEnv("NEXTAUTH_SECRET", SECRET);
    for (const holder of HOLDERS) {
      const compare = vi.spyOn(bcrypt, "compare");
      const found = await findPatientByPin(db(), holder.pin);
      expect(found).toMatchObject({
        id: rows.get(holder.name)!.id,
        first_name: holder.name,
      });
      // The fingerprint found them; the one compare is the confirmation
      // against their own hash. Nobody else was tried.
      expect(compare).toHaveBeenCalledTimes(1);
      compare.mockRestore();
    }
  });

  it("after: a wrong PIN is 'not found' without being compared against anyone", async () => {
    vi.stubEnv("NEXTAUTH_SECRET", SECRET);
    const compare = vi.spyOn(bcrypt, "compare");
    const started = performance.now();
    expect(await findPatientByPin(db(), WRONG_PIN)).toBeNull();
    const took = performance.now() - started;
    expect(compare).not.toHaveBeenCalled();
    // Two small queries. (Before the job: a compare per holder.)
    expect(took).toBeLessThan(1_000);
  });

  it("a second run of the job finds nobody left and changes nothing", async () => {
    const before = await Promise.all(HOLDERS.map((h) => lookupOf(h.name)));
    const { status, stdout } = stampPins("stamp");
    expect(stdout).toMatch(/^stamp-pins task 1\/1 done: seen=0 stamped=0 /m);
    expect(status).toBe(0);
    expect(await Promise.all(HOLDERS.map((h) => lookupOf(h.name)))).toEqual(
      before
    );
  }, 120_000);
});
