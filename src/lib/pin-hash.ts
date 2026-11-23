// The one place a PIN meets bcrypt: comparing a typed PIN with a stored
// hash, and hashing a new one. Which rows are compared, and in what
// order, is pin-match.ts and pin-server.ts.
//
// Two libraries, one format:
//
//  - `bcrypt` (C++, a prebuilt binary inside the package for each
//    platform). Its compare and hash run on Node's helper threads, so
//    the server's one main thread stays free to answer the boards while
//    a PIN is being compared against many patients — and several
//    compares can run at the same moment when the server has more than
//    one CPU (compareWidth).
//  - `bcryptjs` (plain JavaScript), which hashed every PIN stored before
//    this file existed. It stays as the way through if the binary cannot
//    be loaded on some host: sign-in is then as slow as it used to be,
//    never broken. The image build stops if that would happen in the
//    container (Dockerfile).
//
// Both write and read the same hashes ($2b$, and $2a$): pin-hash.test.ts
// holds that in both directions, because hashes made by one must sign
// patients in under the other — before this change, and after a revert.
//
// A single compare costs nearly the same in either (12 to 15 ms at cost
// 8 on a fast laptop core; scripts/bench-pin-slow-path.mjs). The native
// one is not there for being quicker but for where it runs.

import { availableParallelism } from "os";
import bcryptjs from "bcryptjs";
import type { PinCompare } from "./pin-match";

export interface PinEngine {
  compare(pin: string, hash: string): Promise<boolean>;
  hash(pin: string, rounds: number): Promise<string>;
}

// What the native package must offer to be used.
interface NativeBcrypt extends PinEngine {
  compareSync(data: string, hash: string): boolean;
}

// A made-up phrase and its hash as bcryptjs made it (cost 4): not a PIN,
// not a secret. The native library must verify it before it is trusted
// with patients' hashes.
const SELF_TEST = {
  phrase: "rac-pin-engine-self-test",
  hash: "$2b$04$PH7sMux1TNFD4U/3zzraOOVhzptd5PfjN3Oqc8SPU/.PqOECV7QjG",
};

function requireNative(): NativeBcrypt {
  // A literal require, so the bundler keeps the package outside the
  // bundle and the build ships its binary; inside a function, so a
  // binary that cannot be loaded is caught below instead of taking the
  // sign-in routes down with it.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("bcrypt");
}

export function loadPinEngine(loadNative: () => NativeBcrypt = requireNative): {
  engine: PinEngine;
  native: boolean;
} {
  try {
    const native = loadNative();
    if (
      !native.compareSync(SELF_TEST.phrase, SELF_TEST.hash) ||
      native.compareSync(`${SELF_TEST.phrase}?`, SELF_TEST.hash)
    ) {
      throw new Error("self-test failed");
    }
    return {
      native: true,
      engine: {
        compare: (pin, hash) => native.compare(pin, hash),
        hash: (pin, rounds) => native.hash(pin, rounds),
      },
    };
  } catch (error) {
    // Says what failed to load — never anything about a PIN.
    console.error(
      "native bcrypt is not available; PIN compares run on bcryptjs (slower, on the main thread):",
      error instanceof Error ? error.message.split("\n")[0] : "unknown error"
    );
    return {
      native: false,
      engine: {
        compare: (pin, hash) => bcryptjs.compare(pin, hash),
        hash: (pin, rounds) => bcryptjs.hash(pin, rounds),
      },
    };
  }
}

// Loaded on first use, once per server.
let loaded: ReturnType<typeof loadPinEngine> | null = null;
const current = () => (loaded ??= loadPinEngine());

export const pinEngineIsNative = (): boolean => current().native;

// Is this PIN the one behind this stored hash? Something that is not a
// bcrypt hash at all is simply "no".
export const comparePin: PinCompare = (pin, hash) =>
  current().engine.compare(pin, hash);

export const hashPin = (pin: string, rounds: number): Promise<string> =>
  current().engine.hash(pin, rounds);

// How many compares to run at the same moment (pin-match.ts): one per
// CPU the server may use, and never more than Node has helper threads —
// four, unless UV_THREADPOOL_SIZE says otherwise. More than the CPUs
// buys nothing (a compare is pure arithmetic); more than the helper
// threads only queues.
//
// On Cloud Run this follows the `cpu` limit of the app container
// (deploy/service.template.yaml): 1 today, so one compare at a time.
export function compareWidth(
  cpus: number = availableParallelism(),
  threadPoolSize: string | undefined = process.env.UV_THREADPOOL_SIZE
): number {
  const asked = Number(threadPoolSize);
  const pool = Number.isInteger(asked) && asked >= 1 ? asked : 4;
  const usable = Number.isInteger(cpus) && cpus >= 1 ? cpus : 1;
  return Math.min(usable, pool);
}
