// How long does a WRONG PIN take when it has to be compared against every
// patient who has no fingerprint yet (the slow path of
// src/lib/pin-server.ts), and how late do other things on the same
// server run meanwhile? Made-up hashes only; no database, no network.
//
//   node scripts/bench-pin-slow-path.mjs                     1,000 holders
//   node scripts/bench-pin-slow-path.mjs --holders 300
//   node scripts/bench-pin-slow-path.mjs --width 4           compares at a time
//   node scripts/bench-pin-slow-path.mjs --engines old,native
//   node scripts/bench-pin-slow-path.mjs --hashes /tmp/h.json   keep / reuse the hashes
//
// Engines:
//   old      bcryptjs, one compare after another on the main thread — the
//            code before this benchmark existed
//   native   the `bcrypt` package (C++), compares on Node's helper threads,
//            `width` at a time, through firstMatch() — the code in use
//   workers  bcryptjs inside `width` worker threads, through firstMatch() —
//            the alternative that was measured and not chosen
//
// The hashes are made by bcryptjs at cost 8, like every PIN stored so far,
// so "native" is also shown to verify them (the last holder's real PIN
// must be found, and found on that holder).
//
// Inside the site's image (it has no bcryptjs and no source files, so
// both are lent to it; the hashes are made once, outside):
//
//   node scripts/bench-pin-slow-path.mjs --hashes /tmp/pin-bench.json --engines none
//   docker run --rm --cpus 1 -w /app \
//     -v "$PWD/scripts:/bench/scripts:ro" \
//     -v "$PWD/src/lib/pin-match.ts:/bench/src/lib/pin-match.ts:ro" \
//     -v "$PWD/node_modules/bcryptjs:/app/node_modules/bcryptjs:ro" \
//     -v /tmp/pin-bench.json:/tmp/pin-bench.json:ro \
//     <image> node /bench/scripts/bench-pin-slow-path.mjs --hashes /tmp/pin-bench.json
//
// Needs Node 22.18 or newer (it loads a .ts file as it is).

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { availableParallelism } from "node:os";
import path from "node:path";
import { Worker } from "node:worker_threads";
import { firstMatch } from "../src/lib/pin-match.ts";

// Packages are looked up from where the command is run (the repository,
// or /app in the image), not from where this file lies.
const require = createRequire(path.join(process.cwd(), "package.json"));

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? fallback : args[at + 1];
};
const HOLDERS = Number(option("holders", "1000"));
const COST = 8;
const WRONG_PIN = "0000";
const hashFile = option("hashes", "");
const engines = option("engines", "old,native,workers")
  .split(",")
  .filter((name) => name && name !== "none");
const poolSize = Number(process.env.UV_THREADPOOL_SIZE) || 4;
const width = Number(
  option(
    "width",
    String(Math.max(1, Math.min(availableParallelism(), poolSize)))
  )
);

// ---------------------------------------------------------------- hashes
// Holder i has the PIN 1000 + i (so nobody has "0000").
function loadHolders() {
  if (hashFile && existsSync(hashFile)) {
    const kept = JSON.parse(readFileSync(hashFile, "utf8"));
    if (kept.cost === COST && kept.holders.length >= HOLDERS) {
      return kept.holders.slice(0, HOLDERS);
    }
  }
  const bcryptjs = require("bcryptjs");
  process.stdout.write(`making ${HOLDERS} bcryptjs hashes at cost ${COST}… `);
  const holders = [];
  for (let i = 0; i < HOLDERS; i++) {
    holders.push({
      id: `holder-${String(i).padStart(5, "0")}`,
      pin: bcryptjs.hashSync(String(1000 + (i % 9000)), COST),
    });
  }
  console.log("done");
  if (hashFile) {
    writeFileSync(hashFile, JSON.stringify({ cost: COST, holders }));
  }
  return holders;
}

// --------------------------------------------------------------- engines
const makers = {
  old() {
    const bcryptjs = require("bcryptjs");
    return {
      // The loop as it stood in pin-server.ts.
      async find(holders, pin) {
        for (const row of holders) {
          if (await bcryptjs.compare(pin, row.pin)) return row;
        }
        return null;
      },
      close() {},
    };
  },
  native() {
    const bcrypt = require("bcrypt");
    return {
      find: (holders, pin) =>
        firstMatch(holders, pin, (p, hash) => bcrypt.compare(p, hash), width),
      close() {},
    };
  },
  workers() {
    const source = `
      const { parentPort, workerData } = require("node:worker_threads");
      const bcryptjs = require(workerData);
      parentPort.on("message", ({ id, pin, hash }) => {
        parentPort.postMessage({ id, same: bcryptjs.compareSync(pin, hash) });
      });`;
    const waiting = new Map();
    const pool = Array.from({ length: width }, () => {
      const worker = new Worker(source, {
        eval: true,
        workerData: require.resolve("bcryptjs"),
      });
      worker.on("message", ({ id, same }) => {
        waiting.get(id)(same);
        waiting.delete(id);
      });
      return worker;
    });
    let next = 0;
    const compare = (pin, hash) =>
      new Promise((resolve) => {
        const id = next++;
        waiting.set(id, resolve);
        pool[id % pool.length].postMessage({ id, pin, hash });
      });
    return {
      find: (holders, pin) => firstMatch(holders, pin, compare, width),
      close: () => Promise.all(pool.map((worker) => worker.terminate())),
    };
  },
};

// ------------------------------------------- how late does the loop run?
// A timer asks to run every 5 ms, as a request waiting for its turn
// would; how much later than that it really ran is what another request
// on this server would have waited.
function watchLoop() {
  const late = [];
  let due = performance.now() + 5;
  let timer = setTimeout(function tick() {
    const now = performance.now();
    late.push(Math.max(0, now - due));
    due = now + 5;
    timer = setTimeout(tick, 5);
  }, 5);
  return () => {
    clearTimeout(timer);
    late.sort((a, b) => a - b);
    const at = (share) =>
      late.length
        ? late[Math.min(late.length - 1, Math.floor(late.length * share))]
        : 0;
    return {
      typical: at(0.5),
      p99: at(0.99),
      worst: at(1),
      turns: late.length,
    };
  };
}

const ms = (value) => `${value.toFixed(value < 10 ? 1 : 0)} ms`.padStart(9);

// ------------------------------------------------------------------- run
const holders = loadHolders();
console.log(
  `node ${process.version} ${process.platform}/${process.arch} · ` +
    `${availableParallelism()} CPU(s) usable · helper threads ${poolSize} · ` +
    `${holders.length} holders · ${width} compare(s) at a time`
);
if (engines.length) {
  console.log(
    "engine     wrong PIN    per compare   other work ran late by: typical       p99     worst"
  );
}
for (const name of engines) {
  if (!makers[name]) {
    console.log(`${name}: no such engine`);
    continue;
  }
  let engine;
  try {
    engine = makers[name]();
  } catch (error) {
    console.log(
      `${name.padEnd(8)} not available here (${error.code || error.message})`
    );
    continue;
  }
  // Warm up: load the code, start the threads.
  await engine.find(holders.slice(0, Math.min(8, holders.length)), WRONG_PIN);

  const stop = watchLoop();
  const started = performance.now();
  const found = await engine.find(holders, WRONG_PIN);
  const took = performance.now() - started;
  const loop = stop();

  // The right answer, too: the last holder's own PIN finds that holder.
  const last = holders[holders.length - 1];
  const lastPin = String(1000 + ((holders.length - 1) % 9000));
  const tail = holders.slice(-Math.min(16, holders.length));
  const ok = found === null && (await engine.find(tail, lastPin)) === last;

  console.log(
    `${name.padEnd(8)} ${ms(took)}   ${ms(took / holders.length)}` +
      `                           ${ms(loop.typical)} ${ms(loop.p99)} ${ms(loop.worst)}` +
      (ok ? "" : "   WRONG ANSWER")
  );
  await engine.close();
  if (!ok) process.exitCode = 1;
}
