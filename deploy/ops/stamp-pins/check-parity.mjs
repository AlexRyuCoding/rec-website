// Is the fingerprint this job stamps the one the app looks up?
//
//   node check-parity.mjs <the app's src/lib/pin-lookup.ts>
//
// Loads the app's own source (Node reads TypeScript by leaving the types
// out) and compares it with lib.mjs on all 10,000 PINs under several
// made-up secrets. Exit 0 only if every value is equal.
//
// deploy/ops.Dockerfile runs this while the ops image is built, against
// the pin-lookup.ts of the same commit: an image whose job would stamp
// anything but the app's fingerprint is never made. scripts/test-ops.sh
// checks that it passes today and fails when the two differ.

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import * as job from "./lib.mjs";

const stop = (message, code = 1) => {
  console.error(`check-parity: ${message}`);
  process.exit(code);
};

const path = process.argv[2];
if (!path || process.argv.length !== 3) {
  stop("usage: node check-parity.mjs <path to src/lib/pin-lookup.ts>", 2);
}

let app;
try {
  app = await import(pathToFileURL(resolve(path)).href);
} catch {
  stop(
    "the app's pin-lookup.ts could not be loaded. It has to stay one file " +
      "that uses only Node's own modules, so that this check can read it."
  );
}
if (
  typeof app.pinFingerprint !== "function" ||
  typeof app.isCurrentFingerprint !== "function"
) {
  stop("the app's pin-lookup.ts no longer has the two functions compared here");
}

// Made up; any secret must give equal results.
const SECRETS = [
  "made-up-secret-for-the-parity-check",
  "another one, with spaces and ünïcödé ✓",
  "x",
  "0123456789abcdef".repeat(8),
];

let compared = 0;
for (const secret of SECRETS) {
  const rotated = `${secret} (rotated)`;
  for (let n = 0; n <= 9999; n++) {
    const pin = String(n).padStart(4, "0");
    const ours = job.pinFingerprint(pin, secret);
    if (ours !== app.pinFingerprint(pin, secret)) {
      stop(
        "the job's fingerprint is NOT the app's. deploy/ops/stamp-pins/lib.mjs " +
          "must make exactly what src/lib/pin-lookup.ts makes."
      );
    }
    compared++;
  }
  const mine = job.pinFingerprint("4821", secret);
  const other = job.pinFingerprint("4821", rotated);
  for (const stored of [mine, other, null, undefined, "", "k1:made-up"]) {
    if (
      job.isCurrentFingerprint(stored, secret) !==
      app.isCurrentFingerprint(stored, secret)
    ) {
      stop(
        "the job and the app disagree on which fingerprints are current. " +
          "deploy/ops/stamp-pins/lib.mjs must follow src/lib/pin-lookup.ts."
      );
    }
  }
  if (
    !app.isCurrentFingerprint(mine, secret) ||
    !mine.startsWith(job.keyId(secret))
  ) {
    stop("a fingerprint does not start with the id of its key");
  }
}

console.log(
  `check-parity: the job's fingerprint equals the app's (${compared} compared)`
);
