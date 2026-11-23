// The rules of the job that gives every existing PIN holder their
// fingerprint (deploy/ops/stamp-pins.sh). Pure: nothing here touches a
// database or prints. Plain JavaScript on Node's own modules, because the
// ops image has Node and nothing of the app's build.
//
// Tested by src/lib/stamp-pins.test.ts (npm test).

import { createHash, createHmac } from "node:crypto";

// An error whose words were written in this job, and so can be printed.
// Its message never quotes a value: it names what was wrong. Any other
// error is shown by its kind alone (stamp-pins.mjs).
export class Stop extends Error {}

// ------------------------------------------------------------ fingerprint
// A copy of src/lib/pin-lookup.ts, and it must stay one: the app looks a
// PIN up by ITS fingerprint, and on the slow way skips everyone whose
// fingerprint is current. A different value stamped here would put a
// patient where the kiosk can never find them. Three things hold the two
// together: src/lib/stamp-pins.test.ts runs both on all 10,000 PINs, the
// ops image is not built unless check-parity.mjs finds them equal
// (deploy/ops.Dockerfile), and src/lib/stamp-pins.integration.test.ts
// signs in through the app as a patient this job stamped.

const PURPOSE = "rac-pin-lookup-v1";
const KEY_ID_LENGTH = 8;

function needSecret(serverSecret) {
  if (typeof serverSecret !== "string" || serverSecret === "") {
    throw new Stop("the server secret is missing");
  }
}

function lookupKey(serverSecret) {
  return createHash("sha256").update(`${PURPOSE}:${serverSecret}`).digest();
}

/** The short id every fingerprint made under this secret starts with. */
export function keyId(serverSecret) {
  needSecret(serverSecret);
  return createHash("sha256")
    .update(`${PURPOSE}:id:${serverSecret}`)
    .digest("hex")
    .slice(0, KEY_ID_LENGTH);
}

export function pinFingerprint(pin, serverSecret) {
  needSecret(serverSecret);
  const mac = createHmac("sha256", lookupKey(serverSecret))
    .update(pin)
    .digest("hex");
  return keyId(serverSecret) + mac;
}

export function isCurrentFingerprint(stored, serverSecret) {
  return typeof stored === "string" && stored.startsWith(keyId(serverSecret));
}

// ------------------------------------------------------------- candidates
// Every PIN from 0000 to 9999, each once, in the order they are tried.
//
// The order only decides how soon a match is found; all 10,000 are tried
// before a hash is given up on. The PINs people are known to choose come
// first: one digit four times, runs, pairs, years of birth, dates. That
// comes from published studies of 4-digit PINs in general (DataGenetics,
// "PIN analysis", 2012; Bonneau, Preibusch and Anderson, "A birthday
// present every eleven wallets?", 2012) — NOT from this clinic's
// patients: nothing here was learned from, or checked against, real data.
// If the clinic's patients choose differently, the job is only slower.

const two = (n) => String(n).padStart(2, "0");
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function buildCandidates() {
  const seen = new Set();
  const order = [];
  const add = (pin) => {
    if (!seen.has(pin)) {
      seen.add(pin);
      order.push(pin);
    }
  };

  add("1234");
  // One digit four times.
  for (let a = 0; a <= 9; a++) add(`${a}${a}${a}${a}`);
  // Runs, up and down, and the keypad's middle column.
  for (let a = 0; a <= 6; a++) add(`${a}${a + 1}${a + 2}${a + 3}`);
  for (let a = 9; a >= 3; a--) add(`${a}${a - 1}${a - 2}${a - 3}`);
  add("2580");
  add("0852");
  // Pairs: 1212, 1122, 1221.
  for (let a = 0; a <= 9; a++) {
    for (let b = 0; b <= 9; b++) add(`${a}${b}${a}${b}`);
  }
  for (let a = 0; a <= 9; a++) {
    for (let b = 0; b <= 9; b++) add(`${a}${a}${b}${b}`);
  }
  for (let a = 0; a <= 9; a++) {
    for (let b = 0; b <= 9; b++) add(`${a}${b}${b}${a}`);
  }
  // Years.
  for (let year = 1900; year <= 2029; year++) add(String(year));
  // Dates: month then day, then day then month.
  for (let month = 1; month <= 12; month++) {
    for (let day = 1; day <= DAYS_IN_MONTH[month - 1]; day++) {
      add(two(month) + two(day));
    }
  }
  for (let month = 1; month <= 12; month++) {
    for (let day = 1; day <= DAYS_IN_MONTH[month - 1]; day++) {
      add(two(day) + two(month));
    }
  }
  // Everything else, in counting order.
  for (let n = 0; n <= 9999; n++) add(String(n).padStart(4, "0"));
  return order;
}

const CANDIDATES = Object.freeze(buildCandidates());

export function candidatePins() {
  return [...CANDIDATES];
}

// ------------------------------------------------------------------ hashes
// What the app stores: bcryptjs, "$2b$08$" and 53 more characters (older
// libraries wrote $2a$ or $2y$ for the same thing).
const BCRYPT_SHAPE = /^\$2[aby]\$(\d\d)\$[./A-Za-z0-9]{53}$/;
// The app has only ever used cost 8. Each step doubles the work: 10,000
// tries at cost 12 would be half an hour of one patient's hash.
const MIN_COST = 4;
const MAX_COST = 10;

const usableCostNumber = (cost) =>
  Number.isInteger(cost) && cost >= MIN_COST && cost <= MAX_COST;

/** The cost of a hash the job can work on; null = it is never tried. */
export function usableCost(hash) {
  const shape = typeof hash === "string" ? BCRYPT_SHAPE.exec(hash) : null;
  if (!shape) return null;
  const cost = Number(shape[1]);
  return usableCostNumber(cost) ? cost : null;
}

/**
 * The PIN this hash was made from, or null when none of the 10,000 is it.
 * `compare(pin, hash)` is bcryptjs's compareSync. Every candidate is tried
 * at most once, so this always ends.
 */
export function findPin(hash, compare) {
  for (const pin of CANDIDATES) {
    let matches;
    try {
      matches = compare(pin, hash);
    } catch {
      // The library could not read the hash at all.
      return null;
    }
    if (matches === true) return pin;
  }
  return null;
}

// ------------------------------------------------------------------- tasks
// Cloud Run runs a job as COUNT tasks side by side and tells each its
// INDEX. A task takes the holders whose id falls in its share (the
// database works that out — see READ_SQL in stamp-pins.mjs). With neither
// variable set — one task, or a computer — the share is everyone.
const MAX_TASKS = 10_000;

const wholeNumber = (text) =>
  typeof text === "string" && /^(0|[1-9]\d{0,5})$/.test(text)
    ? Number(text)
    : null;

export function taskShare(env) {
  const rawIndex = env.CLOUD_RUN_TASK_INDEX;
  const rawCount = env.CLOUD_RUN_TASK_COUNT;
  if (rawIndex === undefined && rawCount === undefined) {
    return { index: 0, count: 1 };
  }
  const index = wholeNumber(rawIndex);
  const count = wholeNumber(rawCount);
  if (
    index === null ||
    count === null ||
    count < 1 ||
    count > MAX_TASKS ||
    index >= count
  ) {
    // A wrong share would leave patients to no task, silently.
    throw new Stop(
      "CLOUD_RUN_TASK_INDEX and CLOUD_RUN_TASK_COUNT do not name a task"
    );
  }
  return { index, count };
}

// ---------------------------------------------- rows handed to the database
// Nothing read from the database is ever written into a statement. What
// the job has to say travels as one row of COPY data, and a value goes in
// only if it is exactly the shape expected — so it cannot hold a tab, a
// line end or a backslash, the only characters COPY reads specially. The
// errors below name the field and never quote the value.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const KEY_ID = /^[0-9a-f]{8}$/;
const FINGERPRINT = /^[0-9a-f]{72}$/;
const MAX_CHUNK = 1000;

function must(holds, field) {
  if (!holds) throw new Stop(`refusing an unexpected ${field}`);
}
const isCount = (n, least, most) =>
  Number.isInteger(n) && n >= least && n <= most;

/** The row that asks for this task's next few holders. */
export function askRow({ keyId: id, after, index, count, limit }) {
  must(typeof id === "string" && KEY_ID.test(id), "key id");
  must(
    after === null || (typeof after === "string" && UUID.test(after)),
    "place to continue from"
  );
  must(isCount(count, 1, MAX_TASKS), "task count");
  must(isCount(index, 0, count - 1), "task index");
  must(isCount(limit, 1, MAX_CHUNK), "chunk size");
  return `${id}\t${after ?? "\\N"}\t${index}\t${count}\t${limit}\n`;
}

/** The row that stamps one patient: who, the hash that was read, the fingerprint. */
export function writeRow({ id, hash, fingerprint }) {
  must(typeof id === "string" && UUID.test(id), "patient id");
  must(usableCost(hash) !== null, "hash");
  must(
    typeof fingerprint === "string" && FINGERPRINT.test(fingerprint),
    "fingerprint"
  );
  return `${id}\t${hash}\t${fingerprint}\n`;
}

// -------------------------------------------- what the database answers
const lines = (stdout) => stdout.split("\n").filter((line) => line !== "");

/**
 * "<id> <the hash, as hex>" a line. Hex, so that a stored value holding
 * anything at all — a tab, a line end — still reads back as one line.
 */
export function parseHolders(stdout) {
  return lines(stdout).map((line) => {
    const cut = line.indexOf(" ");
    const id = line.slice(0, cut);
    const hex = line.slice(cut + 1);
    if (cut === -1 || !UUID.test(id) || !/^([0-9a-f]{2})*$/.test(hex)) {
      throw new Stop("the database's list of holders could not be read");
    }
    return { id, hash: Buffer.from(hex, "hex").toString("utf8") };
  });
}

export const OUTCOMES = ["stamped", "took-over", "duplicate", "changed"];

/** What became of one write (WRITE_SQL in stamp-pins.mjs says each). */
export function parseOutcome(stdout) {
  const said = lines(stdout);
  if (said.length !== 1 || !OUTCOMES.includes(said[0])) {
    throw new Stop("the database's answer to a write could not be read");
  }
  return said[0];
}

/** COUNT_SQL's lines: "holders 12", "current 3", "never 7", "cost 08 9". */
export function parseCounts(stdout) {
  const counts = { costs: {} };
  for (const line of lines(stdout)) {
    const total = /^(holders|current|never) (\d+)$/.exec(line);
    const cost = /^cost (\d\d|other) (\d+)$/.exec(line);
    if (total) counts[total[1]] = Number(total[2]);
    else if (cost) counts.costs[cost[1]] = Number(cost[2]);
    else throw new Stop("the database's counts could not be read");
  }
  for (const name of ["holders", "current", "never"]) {
    if (!Number.isInteger(counts[name])) {
      throw new Stop("the database's counts could not be read");
    }
  }
  return counts;
}

/**
 * A failed psql, as one line that holds nothing of a row. Postgres's
 * error text can quote the row it stopped at, so only the five-character
 * code is kept (psql is run with VERBOSITY=sqlstate, which prints
 * "ERROR:  23505" and nothing more — this does not rely on it).
 */
export function dbFailure(status, stderr) {
  if (status === null) return "database error (psql did not finish)";
  const code = dbErrorCode(stderr);
  if (code !== null) return `database error ${code} (psql exit ${status})`;
  // psql's own exit code for "no connection".
  if (status === 2) {
    return "the database could not be reached (psql exit 2)";
  }
  return `database error (psql exit ${status})`;
}

/** The code of the last error in psql's error output, or null. */
export function dbErrorCode(stderr) {
  const codes = [
    ...String(stderr).matchAll(
      /(?:ERROR|FATAL|PANIC):[ \t]+([0-9A-Z]{5})[ \t]*$/gm
    ),
  ];
  return codes.length > 0 ? codes[codes.length - 1][1] : null;
}

// ------------------------------------------------- is the secret the site's?
/**
 * Why `stamp` must not run on a database with these counts — one line —
 * or null when nothing stands in its way.
 *
 * A fingerprint made with another secret than the site's is useless to
 * the kiosk, and stamping with one would replace the fingerprints the
 * app made itself: nobody locked out, but everyone back on the slow way
 * until the job is run again with the right secret. The job cannot check
 * its secret. What it can see is the app's own work: a patient who has
 * signed in since fingerprints exist carries one that starts with the id
 * of the site's key. So:
 *
 *  - a fingerprint that is NOT under this job's key means this job's
 *    secret may not be the site's — or that the secret was replaced.
 *    The job cannot tell which; the caller says so with `secretIsNew`
 *    (the mode `stamp-after-new-secret`), and then this is accepted;
 *  - no fingerprint under this job's key at all, with holders still to
 *    stamp, means there is no evidence either way. One sign-in at the
 *    kiosk makes it. This holds after a new secret too: nothing else
 *    shows that the job was given the NEW one.
 *
 * `counts` is parseCounts()'s: holders, current, never.
 */
export function stampRefusal({ holders, current, never }, secretIsNew = false) {
  const without = holders - current;
  const otherKey = without - never;
  if (otherKey > 0 && !secretIsNew) {
    return (
      `${otherKey} fingerprint(s) here were made with another NEXTAUTH_SECRET` +
      " than this job has, so this job's secret may not be the site's." +
      " only if the secret really was replaced: run stamp-after-new-secret"
    );
  }
  if (without > 0 && current === 0) {
    return (
      "no patient here has a fingerprint made with this job's" +
      " NEXTAUTH_SECRET yet, so nothing shows that it is the site's." +
      " sign in once at the kiosk with a PIN you know, then count again"
    );
  }
  return null;
}

// ---------------------------------------------------------------- estimate
/**
 * How long the stamping will take. `costs` is how many unstamped holders
 * there are per bcrypt cost ({"08": 412, other: 1}); `msPerCompare` is one
 * compare at cost 8 on this machine. A holder is 10,000 compares at most
 * and half of that on average if PINs were spread evenly; the order of
 * candidatePins() should only make it quicker, and is not counted on.
 */
export function estimate(costs, msPerCompare, tasks) {
  let usable = 0;
  let unusable = 0;
  // In units of "a holder at cost 8".
  let work = 0;
  for (const [key, holders] of Object.entries(costs)) {
    const cost = /^\d\d$/.test(key) ? Number(key) : NaN;
    if (usableCostNumber(cost)) {
      usable += holders;
      work += holders * 2 ** (cost - 8);
    } else {
      unusable += holders;
    }
  }
  const averageCpuSeconds = (work * 5_000 * msPerCompare) / 1000;
  const maxCpuSeconds = (work * 10_000 * msPerCompare) / 1000;
  return {
    usable,
    unusable,
    averageCpuSeconds,
    maxCpuSeconds,
    averageMinutes: averageCpuSeconds / tasks / 60,
    maxMinutes: maxCpuSeconds / tasks / 60,
  };
}
