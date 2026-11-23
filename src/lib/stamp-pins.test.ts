// The job that gives every existing PIN holder their fingerprint
// (deploy/ops/stamp-pins.sh). Its rules are pure and live in
// deploy/ops/stamp-pins/lib.mjs — plain JavaScript, because the ops image
// has Node and nothing of the app's build. What it does to a database is
// tested in scripts/test-ops.sh; that the app then finds the patients it
// stamped, in src/lib/stamp-pins.integration.test.ts.
import { spawnSync } from "child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import bcrypt from "bcryptjs";
import { describe, expect, it } from "vitest";
import {
  askRow,
  candidatePins,
  dbErrorCode,
  dbFailure,
  estimate,
  findPin,
  isCurrentFingerprint as opsIsCurrent,
  keyId,
  parseCounts,
  parseHolders,
  parseOutcome,
  pinFingerprint as opsFingerprint,
  stampRefusal,
  taskShare,
  usableCost,
  writeRow,
} from "../../deploy/ops/stamp-pins/lib.mjs";
import { isCurrentFingerprint, pinFingerprint } from "./pin-lookup";

const SECRETS = [
  "server-secret-one",
  "a",
  "with spaces and a tab\tinside ",
  "ünïcödé-✓-秘密",
  "x".repeat(300),
  "0f".repeat(32),
];
const ALL_PINS = Array.from({ length: 10_000 }, (_, n) =>
  String(n).padStart(4, "0")
);
const ID = "00000000-0000-4000-8000-0000000000a1";

// THE rule. The app looks a PIN up by pinFingerprint() and skips, on the
// slow way, everyone whose fingerprint is current. A job that stamped
// anything else would put patients where the kiosk can never find them.
describe("the job's fingerprint is the app's, byte for byte", () => {
  it("for every one of the 10,000 PINs", () => {
    for (const pin of ALL_PINS) {
      expect(opsFingerprint(pin, SECRETS[0])).toBe(
        pinFingerprint(pin, SECRETS[0])
      );
    }
  });

  it("for secrets of every shape", () => {
    for (const secret of SECRETS) {
      for (const pin of ["0000", "1234", "4821", "9999"]) {
        expect(opsFingerprint(pin, secret)).toBe(pinFingerprint(pin, secret));
      }
    }
  });

  it("and 'made with the key in use now' means the same in both", () => {
    for (const secret of SECRETS) {
      const mine = opsFingerprint("4821", secret);
      const other = opsFingerprint("4821", `${secret}-rotated`);
      expect(mine.startsWith(keyId(secret))).toBe(true);
      expect(keyId(secret)).toMatch(/^[0-9a-f]{8}$/);
      for (const stored of [mine, other, null, undefined, "", "k1:made-up"]) {
        expect(opsIsCurrent(stored, secret)).toBe(
          isCurrentFingerprint(stored, secret)
        );
      }
      expect(opsIsCurrent(mine, secret)).toBe(true);
      expect(opsIsCurrent(other, secret)).toBe(false);
    }
  });

  it("refuses an empty secret instead of stamping with the wrong key", () => {
    expect(() => opsFingerprint("4821", "")).toThrow();
    expect(() => keyId("")).toThrow();
  });
});

// The ops image is not built unless deploy/ops/stamp-pins/check-parity.mjs
// passes against pin-lookup.ts — and it reads that file with Node
// itself, which leaves the types out and does nothing more. A change
// that is ordinary TypeScript (a relative import, an "@/lib" import, an
// enum) cannot be loaded that way; without this case it would pass
// `npm test`, tsc and lint and only fail in Cloud Build, after the
// merge, stopping the deploy. So the very check the image runs is run
// here too.
//
// Node reads TypeScript by itself from 22.18 (and 23.6): the image has
// 22.23, this repository's computers 24. On an older Node the two cases
// are skipped — and the image's build is then the first to say.
describe("the ops image's own check, as `npm test` runs it", () => {
  const [major, minor] = process.versions.node.split(".").map(Number);
  const nodeReadsTypeScript =
    major >= 24 ||
    (major === 23 && minor >= 6) ||
    (major === 22 && minor >= 18);
  const check = (path: string) =>
    spawnSync(
      process.execPath,
      [
        "--disable-warning=ExperimentalWarning",
        "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
        "deploy/ops/stamp-pins/check-parity.mjs",
        path,
      ],
      { encoding: "utf8" }
    );

  it.skipIf(!nodeReadsTypeScript)(
    "passes on src/lib/pin-lookup.ts as it stands (needs Node 22.18 or newer)",
    () => {
      const run = check("src/lib/pin-lookup.ts");
      expect(run.stderr).toBe("");
      expect(run.stdout).toContain("equals the app's (40000 compared)");
      expect(run.status).toBe(0);
    }
  );

  it.skipIf(!nodeReadsTypeScript)(
    "fails on a pin-lookup.ts that Node cannot read by itself, or that makes another fingerprint",
    () => {
      const dir = mkdtempSync(join(tmpdir(), "parity-"));
      try {
        const source = readFileSync("src/lib/pin-lookup.ts", "utf8");
        const variants: Record<string, string> = {
          // Fine for the app's build; not loadable as the file stands.
          "relative-import.ts": `import { helper } from "./pin-helper";\n${source}\nexport const used = helper;\n`,
          "alias-import.ts": `import { helper } from "@/lib/pin-helper";\n${source}\nexport const used = helper;\n`,
          "enum.ts": `${source}\nexport enum Kind { Current, Old }\n`,
          // Loadable, and different.
          "drifted.ts": source.replace(
            "rac-pin-lookup-v1",
            "rac-pin-lookup-v2"
          ),
        };
        for (const [name, text] of Object.entries(variants)) {
          expect(text).not.toBe(source);
          writeFileSync(join(dir, name), text);
          const run = check(join(dir, name));
          expect(run.status, name).toBe(1);
          expect(run.stderr, name).toMatch(
            name === "drifted.ts" ? /is NOT the app's/ : /could not be loaded/
          );
        }
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  );
});

describe("candidatePins — the order PINs are tried in", () => {
  const order = candidatePins();

  it("holds every PIN from 0000 to 9999 exactly once", () => {
    expect(order).toHaveLength(10_000);
    expect([...order].sort()).toEqual(ALL_PINS);
  });

  it("is the same order every time", () => {
    expect(candidatePins()).toEqual(order);
  });

  it("tries the PINs people are known to choose first", () => {
    // Repeated digits, runs, years of birth, dates — from published
    // studies of 4-digit PINs, never from the clinic's patients.
    for (const likely of ["1234", "0000", "1111", "1212", "1975", "0704"]) {
      expect(order.indexOf(likely)).toBeLessThan(1_500);
    }
    expect(order.indexOf("1234")).toBeLessThan(30);
    // …and an unremarkable one still comes, later.
    expect(order.indexOf("8351")).toBeGreaterThan(1_000);
  });
});

describe("usableCost — is this a hash the job can work on?", () => {
  it("reads the cost of a hash bcryptjs made", () => {
    expect(usableCost(bcrypt.hashSync("4821", 8))).toBe(8);
    expect(usableCost(bcrypt.hashSync("4821", 4))).toBe(4);
    // The same hash under the older prefix.
    expect(usableCost(bcrypt.hashSync("4821", 4).replace("$2b$", "$2a$"))).toBe(
      4
    );
  });

  it("is null for anything else — it is then never tried", () => {
    const good = bcrypt.hashSync("4821", 4);
    for (const bad of [
      "",
      "made-up-hash-not-a-real-bcrypt-value",
      good.slice(0, 59),
      `${good}x`,
      good.replace("$2b$", "$1b$"),
      good.replace("$04$", "$4$0"),
      `${good.slice(0, 40)}'${good.slice(41)}`,
      `${good.slice(0, 40)}\t${good.slice(41)}`,
      `${good.slice(0, 40)}\n${good.slice(41)}`,
    ]) {
      expect(usableCost(bad)).toBeNull();
    }
  });

  it("is null for a cost the app never used — 10,000 tries of it would take hours", () => {
    const good = bcrypt.hashSync("4821", 4);
    expect(usableCost(good.replace("$04$", "$12$"))).toBeNull();
    expect(usableCost(good.replace("$04$", "$03$"))).toBeNull();
    expect(usableCost(good.replace("$04$", "$10$"))).toBe(10);
  });
});

describe("findPin", () => {
  it("finds the PIN a hash was made from", () => {
    for (const pin of ["1234", "0000", "1975"]) {
      expect(findPin(bcrypt.hashSync(pin, 4), bcrypt.compareSync)).toBe(pin);
    }
  });

  it("tries all 10,000 once and gives up: null, never a loop", () => {
    const tried: string[] = [];
    const never = (pin: string) => {
      tried.push(pin);
      return false;
    };
    expect(findPin("any", never)).toBeNull();
    expect(tried).toEqual(candidatePins());
  });

  it("stops at the first match", () => {
    let tries = 0;
    const third = () => ++tries === 3;
    expect(findPin("any", third)).toBe(candidatePins()[2]);
    expect(tries).toBe(3);
  });

  it("a hash the library refuses to read is 'no PIN', not a crash", () => {
    const throws = () => {
      throw new Error("Invalid salt version: xx");
    };
    expect(findPin("any", throws)).toBeNull();
  });
});

describe("taskShare — which holders are this task's", () => {
  it("is everyone when Cloud Run's two variables are absent", () => {
    expect(taskShare({})).toEqual({ index: 0, count: 1 });
  });

  it("reads the task's place from Cloud Run's variables", () => {
    expect(
      taskShare({ CLOUD_RUN_TASK_INDEX: "2", CLOUD_RUN_TASK_COUNT: "3" })
    ).toEqual({ index: 2, count: 3 });
    expect(
      taskShare({ CLOUD_RUN_TASK_INDEX: "0", CLOUD_RUN_TASK_COUNT: "1" })
    ).toEqual({ index: 0, count: 1 });
  });

  it("refuses a place that cannot be right — a wrong share would skip patients", () => {
    for (const [index, count] of [
      ["3", "3"],
      ["-1", "3"],
      ["0", "0"],
      ["1", ""],
      ["", "3"],
      ["one", "3"],
      ["1.5", "3"],
      ["1", "3; drop table patients"],
      ["0", "100000"],
    ]) {
      expect(() =>
        taskShare({ CLOUD_RUN_TASK_INDEX: index, CLOUD_RUN_TASK_COUNT: count })
      ).toThrow();
    }
  });
});

// Values never become part of a statement: they travel as rows of COPY
// data, and only if they are exactly the shape expected.
describe("rows handed to the database", () => {
  const fp = opsFingerprint("4821", SECRETS[0]);
  const hash = bcrypt.hashSync("4821", 4);

  it("askRow: key id, where to continue, share, how many", () => {
    expect(
      askRow({ keyId: "0123abcd", after: null, index: 0, count: 1, limit: 5 })
    ).toBe("0123abcd\t\\N\t0\t1\t5\n");
    expect(
      askRow({ keyId: "0123abcd", after: ID, index: 2, count: 3, limit: 5 })
    ).toBe(`0123abcd\t${ID}\t2\t3\t5\n`);
  });

  it("askRow refuses anything of another shape", () => {
    const good = { keyId: "0123abcd", after: ID, index: 0, count: 1, limit: 5 };
    for (const bad of [
      { keyId: "0123abc" },
      { keyId: "0123abcd'" },
      { after: "not-an-id" },
      { after: `${ID}\t1` },
      { index: 1 },
      { index: -1 },
      { count: 0 },
      { limit: 0 },
      { limit: 1.5 },
    ]) {
      expect(() => askRow({ ...good, ...bad })).toThrow();
    }
  });

  it("writeRow: the patient, the hash that was read, the fingerprint", () => {
    expect(writeRow({ id: ID, hash, fingerprint: fp })).toBe(
      `${ID}\t${hash}\t${fp}\n`
    );
  });

  it("writeRow refuses anything of another shape", () => {
    const good = { id: ID, hash, fingerprint: fp };
    for (const bad of [
      { id: "not-an-id" },
      { hash: "made-up-hash-not-a-real-bcrypt-value" },
      { hash: `${hash.slice(0, 40)}\\${hash.slice(41)}` },
      { fingerprint: fp.slice(0, 71) },
      { fingerprint: `${fp.slice(0, 71)}'` },
      { fingerprint: "" },
    ]) {
      expect(() => writeRow({ ...good, ...bad })).toThrow();
    }
  });

  it("an error from refusing a row never quotes the row", () => {
    for (const attempt of [
      () => writeRow({ id: ID, hash: "secret-looking-hash", fingerprint: fp }),
      () => writeRow({ id: "patient-id-here", hash, fingerprint: fp }),
      () =>
        askRow({
          keyId: "0123abcd",
          after: "patient-id-here",
          index: 0,
          count: 1,
          limit: 5,
        }),
    ]) {
      let message = "";
      try {
        attempt();
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).not.toBe("");
      expect(message).not.toMatch(/secret-looking-hash|patient-id-here/);
    }
  });
});

describe("reading what the database answers", () => {
  const hex = (s: string) => Buffer.from(s, "utf8").toString("hex");

  it("parseHolders: id and hash, whatever the hash holds", () => {
    const odd = "tab\there 'quote' \\ new\nline ✓";
    const out = `${ID} ${hex("$2b$08$abc")}\n${ID.replace("a1", "a2")} ${hex(odd)}\n${ID.replace("a1", "a3")} \n`;
    expect(parseHolders(out)).toEqual([
      { id: ID, hash: "$2b$08$abc" },
      { id: ID.replace("a1", "a2"), hash: odd },
      { id: ID.replace("a1", "a3"), hash: "" },
    ]);
    expect(parseHolders("")).toEqual([]);
  });

  it("parseHolders refuses a line it does not understand, without quoting it", () => {
    let message = "";
    try {
      parseHolders("something-else entirely\n");
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).not.toBe("");
    expect(message).not.toContain("something-else");
  });

  it("parseOutcome knows the four answers to a write", () => {
    for (const outcome of ["stamped", "took-over", "duplicate", "changed"]) {
      expect(parseOutcome(`${outcome}\n`)).toBe(outcome);
    }
    expect(() => parseOutcome("")).toThrow();
    expect(() => parseOutcome("stamped\nstamped\n")).toThrow();
    expect(() => parseOutcome("something-else\n")).toThrow();
  });

  it("parseCounts reads the count's lines", () => {
    expect(
      parseCounts("holders 12\ncurrent 3\nnever 7\ncost 08 8\ncost other 1\n")
    ).toEqual({
      holders: 12,
      current: 3,
      never: 7,
      costs: { "08": 8, other: 1 },
    });
    expect(parseCounts("holders 0\ncurrent 0\nnever 0\n")).toEqual({
      holders: 0,
      current: 0,
      never: 0,
      costs: {},
    });
    expect(() => parseCounts("holders 12\n")).toThrow();
    expect(() => parseCounts("holders x\ncurrent 3\nnever 7\n")).toThrow();
  });
});

// Postgres's own error text can quote the row it stopped at. Only its
// code is ever shown (as deploy/ops/copy-data.sh does).
describe("dbFailure — a database error, reduced to its code", () => {
  it("keeps the code and drops every word", () => {
    const stderr =
      'ERROR:  duplicate key value violates unique constraint "patients_pin_lookup_key"\n' +
      "DETAIL:  Key (pin_lookup)=(0123abcdfeedfacefeedface) already exists.\n" +
      "ERROR:  23505\n";
    const said = dbFailure(3, stderr);
    expect(said).toBe("database error 23505 (psql exit 3)");
    expect(said).not.toMatch(/feedface|pin_lookup|Key/);
  });

  it("says only that the database was not reached when there is no code", () => {
    const stderr =
      'psql: error: connection to server at "10.1.2.3", port 5432 failed: FATAL:  password authentication failed for user "postgres"\n';
    const said = dbFailure(2, stderr);
    expect(said).toBe("the database could not be reached (psql exit 2)");
  });

  it("copes with no text at all, and with a timeout", () => {
    expect(dbFailure(1, "")).toBe("database error (psql exit 1)");
    expect(dbFailure(null, "")).toBe("database error (psql did not finish)");
  });

  it("dbErrorCode is the last error's code, or null — what decides a second try", () => {
    expect(dbErrorCode("ERROR:  40P01\n")).toBe("40P01");
    expect(dbErrorCode("ERROR:  23505\nERROR:  55P03\n")).toBe("55P03");
    expect(dbErrorCode("psql:<stdin>:12: ERROR:  57014\n")).toBe("57014");
    expect(
      dbErrorCode("ERROR:  canceling statement due to timeout\n")
    ).toBeNull();
    expect(dbErrorCode("")).toBeNull();
  });
});

// A wrong NEXTAUTH_SECRET would stamp fingerprints the kiosk cannot use,
// over the app's own. The job cannot check a secret; it can only look
// for the app's work under it.
describe("stampRefusal — is there any sign this job's secret is the site's?", () => {
  it("is null once a patient has a fingerprint under this key and nobody one under another", () => {
    expect(stampRefusal({ holders: 10, current: 1, never: 9 })).toBeNull();
    expect(stampRefusal({ holders: 10, current: 7, never: 3 })).toBeNull();
  });

  it("is null when there is nobody to stamp", () => {
    expect(stampRefusal({ holders: 10, current: 10, never: 0 })).toBeNull();
    expect(stampRefusal({ holders: 0, current: 0, never: 0 })).toBeNull();
  });

  it("refuses while nobody has a fingerprint under this key", () => {
    const why = stampRefusal({ holders: 10, current: 0, never: 10 });
    expect(why).toMatch(/^no patient/);
    expect(why).toMatch(/sign in once at the kiosk/);
  });

  // stamp-after-new-secret: fingerprints of the OLD secret are expected,
  // and nothing else is taken on trust.
  it("after a new secret: accepts fingerprints made with another one", () => {
    expect(
      stampRefusal({ holders: 10, current: 1, never: 0 }, true)
    ).toBeNull();
    expect(
      stampRefusal({ holders: 10, current: 3, never: 2 }, true)
    ).toBeNull();
  });

  it("after a new secret: still refuses while nobody has one under this key", () => {
    for (const never of [0, 4, 10]) {
      const why = stampRefusal({ holders: 10, current: 0, never }, true);
      expect(why).toMatch(/^no patient/);
      expect(why).toMatch(/sign in once at the kiosk/);
    }
  });

  it("refuses while anybody has one made with another secret — however many are current", () => {
    for (const current of [0, 1, 5]) {
      const why = stampRefusal({ holders: 10, current, never: 3 });
      expect(why).toMatch(new RegExp(`^${7 - current} fingerprint`));
      expect(why).toMatch(/another NEXTAUTH_SECRET/);
      // The one legitimate case has its own way in.
      expect(why).toMatch(/stamp-after-new-secret/);
    }
  });

  it("says it in one line", () => {
    for (const never of [10, 3]) {
      expect(stampRefusal({ holders: 10, current: 0, never })).not.toContain(
        "\n"
      );
    }
  });
});

describe("estimate — how long the stamping will take", () => {
  it("is 5,000 compares a holder on average, 10,000 at most", () => {
    const e = estimate({ "08": 100 }, 10, 1);
    expect(e.usable).toBe(100);
    expect(e.unusable).toBe(0);
    // 10 ms a compare: 50 s a holder on average, 100 s at most.
    expect(e.averageCpuSeconds).toBe(100 * 50);
    expect(e.maxCpuSeconds).toBe(100 * 100);
    expect(e.averageMinutes).toBeCloseTo(83.33, 1);
  });

  it("doubles with every step of cost, and divides by the tasks", () => {
    const e = estimate({ "08": 10, "10": 10, "04": 16, other: 3 }, 10, 5);
    // 10 at cost 8, 10 at four times that, 16 at a sixteenth.
    expect(e.usable).toBe(36);
    expect(e.unusable).toBe(3);
    expect(e.averageCpuSeconds).toBe((10 + 40 + 1) * 50);
    expect(e.averageMinutes).toBeCloseTo((51 * 50) / 5 / 60, 5);
    expect(e.maxMinutes).toBeCloseTo((51 * 100) / 5 / 60, 5);
  });

  it("counts a cost the job would refuse as unusable", () => {
    const e = estimate({ "12": 4, "08": 1 }, 10, 1);
    expect(e.usable).toBe(1);
    expect(e.unusable).toBe(4);
  });
});

// The tests here run the app's copy of bcryptjs; the image installs the
// job's own, from its own lock file. They must be the same code.
it("the ops image installs exactly the bcryptjs the app runs", () => {
  const lock = (path: string) =>
    JSON.parse(readFileSync(path, "utf8")).packages["node_modules/bcryptjs"];
  const app = lock("package-lock.json");
  const ops = lock("deploy/ops/stamp-pins/package-lock.json");
  expect(ops.version).toBe(app.version);
  expect(ops.integrity).toBe(app.integrity);
  expect(ops.integrity).toMatch(/^sha512-/);
  const wanted = JSON.parse(
    readFileSync("deploy/ops/stamp-pins/package.json", "utf8")
  ).dependencies;
  // An exact version, not a range.
  expect(wanted).toEqual({ bcryptjs: app.version });
});
