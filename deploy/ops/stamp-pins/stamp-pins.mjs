// The working half of deploy/ops/stamp-pins.sh — read that file's header
// first: it says what the job is for and what it promises.
//
//   node stamp-pins.mjs count | stamp
//
// The rules are in lib.mjs (pure, tested by src/lib/stamp-pins.test.ts).
// This file talks to the database, through psql as the other ops scripts
// do, and does the one expensive thing: finding which PIN a hash is of.
//
// How nothing of a patient's can leave:
//  - the three statements below are fixed text. What changes — the id to
//    continue from, a hash, a fingerprint — is sent as a row of COPY data
//    on psql's standard input: never part of a statement (so it cannot
//    be in a statement the database logs with an error), never on a
//    command line, never in a file;
//  - psql's own words are never passed on. An error is shown as its
//    five-character code (dbFailure in lib.mjs);
//  - what is printed is built from counters and nothing else.

import { spawnSync } from "node:child_process";
import bcrypt from "bcryptjs";
import {
  askRow,
  dbErrorCode,
  dbFailure,
  estimate,
  findPin,
  keyId,
  parseCounts,
  parseHolders,
  parseOutcome,
  pinFingerprint,
  Stop,
  taskShare,
  usableCost,
  writeRow,
} from "./lib.mjs";

// ---------------------------------------------------------------- database

// How many PIN holders there are, how many already have a fingerprint
// made with this key, and the bcrypt cost of the others' hashes.
const COUNT_SQL = (keyIdRow) => String.raw`
create temp table stamp_ask (key_id text not null);
copy stamp_ask from stdin;
${keyIdRow}\.
with holders as (
  select p.pin, p.pin_lookup,
         left(coalesce(p.pin_lookup, ''), 8) = a.key_id as is_current
    from public.patients p cross join stamp_ask a
   where p.pin is not null
)
select 'holders ' || count(*) from holders
union all
select 'current ' || count(*) from holders where is_current
union all
select 'never ' || count(*) from holders where pin_lookup is null
union all
select 'cost ' || cost || ' ' || n
  from (
    select coalesce(
             substring(pin from '^\$2[aby]\$([0-9]{2})\$[./A-Za-z0-9]{53}$'),
             'other') as cost,
           count(*) as n
      from holders
     where not is_current
     group by 1
  ) by_cost;
`;

// This task's next few holders without a current fingerprint, in id
// order from where the last read ended. "Current" is the app's rule
// (isCurrentFingerprint): the fingerprint starts with this key's id. The
// share: a number made from the id, the same for every task, modulo the
// task count.
const READ_SQL = (row) => String.raw`
create temp table stamp_ask (
  key_id text not null, after uuid,
  task_index int not null, task_count int not null, at_most int not null
);
copy stamp_ask from stdin;
${row}\.
select p.id::text || ' ' || encode(convert_to(p.pin, 'UTF8'), 'hex')
  from public.patients p cross join stamp_ask a
 where p.pin is not null
   and left(coalesce(p.pin_lookup, ''), 8) <> a.key_id
   and ('x' || substr(md5(p.id::text), 1, 8))::bit(32)::bigint % a.task_count
       = a.task_index
   and (a.after is null or p.id > a.after)
 order by p.id
 limit (select at_most from stamp_ask);
`;

// Stamps ONE patient, as one transaction, and says what became of it:
//
//   stamped    the fingerprint is stored.
//   changed    not stored: since the read this patient's PIN was reset or
//              replaced, or the app stamped them itself. The row is
//              locked while this is decided, so nothing slips between
//              the look and the write.
//   duplicate  not stored: an EARLIER patient (by id) has the same PIN
//              and holds this fingerprint. The unique index allows one.
//   took-over  stored, and taken from a LATER patient with the same PIN.
//
// Why the earlier patient: with two patients on one PIN the kiosk finds
// the first by id (pin-server.ts reads holders in id order and stops at
// the first match). Whoever holds the fingerprint is who that PIN signs
// in from now on — so it goes to the same patient as before this job,
// whichever task gets there first. The other stays as they are today:
// without a fingerprint, compared the slow way.
//
// Only pin_lookup is written, never pin, so migration 0017's trigger
// (which clears pin_lookup when pin changes without it) leaves the new
// value alone.
const WRITE_SQL = (row) => String.raw`
create temp table stamp_in (
  id uuid not null, pin text not null, fp text not null, outcome text
);
copy stamp_in (id, pin, fp) from stdin;
${row}\.
do $stamp$
declare
  r record;
  result text;
begin
  select * into strict r from stamp_in;
  perform 1
     from public.patients p
    where p.id = r.id
      and p.pin = r.pin
      and left(coalesce(p.pin_lookup, ''), 8) <> left(r.fp, 8)
      for update;
  if not found then
    result := 'changed';
  else
    begin
      update public.patients set pin_lookup = r.fp where id = r.id;
      result := 'stamped';
    exception when unique_violation then
      result := 'duplicate';
    end;
    if result = 'duplicate' then
      begin
        update public.patients set pin_lookup = null
         where pin_lookup = r.fp and id > r.id;
        if found then
          update public.patients set pin_lookup = r.fp where id = r.id;
          result := 'took-over';
        end if;
      exception when unique_violation then
        result := 'duplicate';
      end;
    end if;
  end if;
  update stamp_in set outcome = result;
end
$stamp$;
select outcome from stamp_in;
`;

// Worth another try: no connection, a statement that ran out of time, a
// lock that was not given, two writers in each other's way.
const PASSING = new Set(["40001", "40P01", "55P03", "57014", "53300"]);
const RETRY_AFTER_MS = [2_000, 5_000];
const PSQL_TIMEOUT_MS = 120_000;

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function psqlEnv() {
  const env = { ...process.env };
  // psql has no use for it.
  delete env.NEXTAUTH_SECRET;
  env.PGAPPNAME = "rac-stamp-pins";
  env.PGCONNECT_TIMEOUT = env.PGCONNECT_TIMEOUT || "20";
  // Never wait long on the live database, and no notices.
  env.PGOPTIONS =
    `${env.PGOPTIONS || ""} -c client_min_messages=warning` +
    " -c lock_timeout=10s -c statement_timeout=60s";
  return env;
}

// Runs one fixed script through psql and returns what it printed. psql's
// error output is read here and never passed on.
function psql(script) {
  let failure = "";
  for (let attempt = 0; ; attempt++) {
    const run = spawnSync(
      "psql",
      ["-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=sqlstate"],
      {
        input: script,
        encoding: "utf8",
        env: psqlEnv(),
        timeout: PSQL_TIMEOUT_MS,
        maxBuffer: 64 * 1024 * 1024,
      }
    );
    if (run.error && run.error.code === "ENOENT") {
      throw new Stop("psql is not installed here");
    }
    if (run.status === 0 && !run.error) return run.stdout;

    const stderr = run.stderr ?? "";
    failure = dbFailure(run.error ? null : run.status, stderr);
    const passing =
      run.error || run.status === 2 || PASSING.has(dbErrorCode(stderr));
    if (!passing || attempt >= RETRY_AFTER_MS.length) break;
    sleep(RETRY_AFTER_MS[attempt]);
  }
  throw new Stop(failure);
}

// ------------------------------------------------------------------- count

// One bcryptjs compare at cost 8 — the app's cost — on this machine, in
// milliseconds. Against a made-up hash.
function compareMs() {
  const hash = bcrypt.hashSync("a made-up value, not a PIN", 8);
  for (let i = 0; i < 5; i++) bcrypt.compareSync("warm-up", hash);
  const rounds = 40;
  const start = process.hrtime.bigint();
  for (let i = 0; i < rounds; i++) bcrypt.compareSync("made-up", hash);
  return Number(process.hrtime.bigint() - start) / 1e6 / rounds;
}

const wholeMinutes = (minutes) => Math.max(1, Math.ceil(minutes));
const cpuTime = (seconds) =>
  seconds < 2 * 3600
    ? `${wholeMinutes(seconds / 60)} CPU-minutes`
    : `${(seconds / 3600).toFixed(1)} CPU-hours`;

function count(say, secret, share) {
  // Run as several tasks, the answer would be printed once per task.
  if (share.index !== 0) {
    console.log(
      `stamp-pins task ${share.index + 1}/${share.count}:` +
        " the counting is left to the first task"
    );
    return;
  }
  const counts = parseCounts(psql(COUNT_SQL(`${keyId(secret)}\n`)));
  const without = counts.holders - counts.current;
  const otherKey = without - counts.never;
  const ms = compareMs();
  const time = estimate(counts.costs, ms, share.count);
  say(
    `pin_holders=${counts.holders} current=${counts.current}` +
      ` without=${without} never_stamped=${counts.never}` +
      ` other_key=${otherKey} unusable=${time.unusable}`
  );
  if (counts.holders === 0) {
    say("no patient has a PIN here. is this the right database?");
  }
  if (otherKey > 0) {
    say(
      "other_key is not 0: those fingerprints were made with another" +
        " NEXTAUTH_SECRET than this job has. that is expected after the" +
        " secret was replaced; otherwise this job has the wrong secret, and" +
        " stamping would undo the app's own work."
    );
  }
  say(
    `one compare takes ${ms.toFixed(1)} ms here: a holder is about` +
      ` ${Math.round(ms * 5)} s of one CPU, at most ${Math.round(ms * 10)} s`
  );
  say(
    `stamping ${time.usable} of them needs about` +
      ` ${cpuTime(time.averageCpuSeconds)} (at most` +
      ` ${cpuTime(time.maxCpuSeconds)}); as ${share.count} task(s) side by` +
      ` side about ${wholeMinutes(time.averageMinutes)} minutes (at most` +
      ` ${wholeMinutes(time.maxMinutes)}), the task with the most holders a` +
      " little longer"
  );
  say("nothing was changed");
}

// ------------------------------------------------------------------- stamp

// Tasks start together; a second apart, they do not all open their first
// connection to a small database at the same moment.
const START_APART_MS = 1_000;
const DEFAULT_CHUNK = 5;

function chunkSize(env) {
  if (env.STAMP_CHUNK === undefined) return DEFAULT_CHUNK;
  if (!/^[1-9]\d{0,2}$/.test(env.STAMP_CHUNK)) {
    throw new Stop("STAMP_CHUNK must be a number from 1 to 999");
  }
  return Number(env.STAMP_CHUNK);
}

function stamp(say, secret, share, limit) {
  const started = Date.now();
  const key = keyId(secret);
  const tally = {
    seen: 0,
    stamped: 0,
    took_over: 0,
    same_pin: 0,
    no_match: 0,
    unusable: 0,
    changed: 0,
  };
  const line = () =>
    Object.entries(tally)
      .map(([name, n]) => `${name}=${n}`)
      .join(" ") + ` minutes=${Math.round((Date.now() - started) / 60_000)}`;

  if (share.count > 1) sleep(share.index * START_APART_MS);

  // Each read asks for holders AFTER the last one seen, so every holder
  // is looked at once in a run — also the ones that cannot be stamped,
  // which would otherwise be read again for ever.
  let after = null;
  for (;;) {
    const holders = parseHolders(
      psql(READ_SQL(askRow({ keyId: key, after, ...share, limit })))
    );
    if (holders.length === 0) break;
    for (const { id, hash } of holders) {
      after = id;
      tally.seen++;
      if (usableCost(hash) === null) {
        tally.unusable++;
        continue;
      }
      const pin = findPin(hash, bcrypt.compareSync);
      if (pin === null) {
        tally.no_match++;
        continue;
      }
      const fingerprint = pinFingerprint(pin, secret);
      const outcome = parseOutcome(
        psql(WRITE_SQL(writeRow({ id, hash, fingerprint })))
      );
      if (outcome === "stamped") tally.stamped++;
      else if (outcome === "took-over") {
        tally.stamped++;
        tally.took_over++;
      } else if (outcome === "duplicate") tally.same_pin++;
      else tally.changed++;
    }
    say(`so far: ${line()}`);
  }
  say(`done: ${line()}`);
}

// -------------------------------------------------------------------- main

function main() {
  const mode = process.argv[2];
  if (process.argv.length !== 3 || (mode !== "count" && mode !== "stamp")) {
    console.error("usage: stamp-pins.mjs count | stamp");
    return 2;
  }
  // Every line says which part of the job wrote it, and a line about a
  // failure has "stopped:" in it — what the runbook's log searches use.
  let who = mode === "count" ? "stamp-pins count:" : "stamp-pins stamp";
  const say = (text) => console.log(`${who} ${text}`);
  try {
    // An empty secret would count and stamp under a key nobody uses.
    const secret = process.env.NEXTAUTH_SECRET;
    if (typeof secret !== "string" || secret === "") {
      throw new Stop("NEXTAUTH_SECRET is not set");
    }
    const share = taskShare(process.env);
    if (mode === "count") {
      count(say, secret, share);
    } else {
      who = `stamp-pins task ${share.index + 1}/${share.count}`;
      stamp(say, secret, share, chunkSize(process.env));
    }
    return 0;
  } catch (error) {
    // Only words written in this job are printed. Anything else — a
    // fault in the code, the library — is named by its kind alone: a
    // message could quote what was being handled.
    const said =
      error instanceof Stop
        ? error.message
        : `an unexpected error (${error instanceof Error ? error.constructor.name : "not an Error"})`;
    console.error(`${who} stopped: ${said}`);
    return 1;
  }
}

process.exitCode = main();
