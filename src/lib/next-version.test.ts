import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

// The staff pages' "are you signed in?" check is Next.js middleware
// (src/middleware.ts), and Next.js has had ways around middleware:
//
//  - CVE-2025-29927 (GHSA-f82v-jwr5-mffw): the request header
//    `x-middleware-subrequest` skipped it. Fixed in 15.2.3. The site ran
//    15.1.11 until November 2026, behind a load balancer rule only.
//  - GHSA-267c-6grr-h53f and GHSA-492v-c6pp-mqqv: two more ways around,
//    fixed in 15.5.16.
//
// So the installed version must never slide back below those fixes — by
// a lock file made on the wrong branch, or a "small" downgrade to get a
// build through. What the fix does was checked by request against the
// built image (deploy/RUNBOOK.md, check 1.10.5); this only holds the
// version.
const FIXES = [
  { advisory: "CVE-2025-29927", line: 15, fixedIn: [15, 2, 3] },
  { advisory: "GHSA-267c-6grr-h53f", line: 15, fixedIn: [15, 5, 16] },
];

const parse = (version: string) =>
  version
    .split("-")[0]
    .split(".")
    .map((part) => Number(part));

const atLeast = (version: number[], floor: number[]) => {
  for (let i = 0; i < 3; i++) {
    if (version[i] !== floor[i]) return version[i] > floor[i];
  }
  return true;
};

const read = (file: string) =>
  JSON.parse(readFileSync(join(process.cwd(), file), "utf8"));

describe("the Next.js version in use", () => {
  const installed: string = read("node_modules/next/package.json").version;

  it.each(FIXES)("contains the fix for $advisory", ({ line, fixedIn }) => {
    const version = parse(installed);
    // A newer major has every fix of the older ones.
    expect(version[0] > line || atLeast(version, fixedIn)).toBe(true);
  });

  it("is exactly the version package.json names (no range that could drift)", () => {
    const wanted: string = read("package.json").dependencies.next;
    expect(wanted).toMatch(/^\d+\.\d+\.\d+$/);
    expect(installed).toBe(wanted);
  });

  it("is the version the lock file holds", () => {
    const lock = read("package-lock.json");
    expect(lock.packages["node_modules/next"].version).toBe(installed);
  });
});
