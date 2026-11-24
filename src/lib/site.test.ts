import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { FORMS_INBOX, SITE } from "./site";

// The clinic's mail is on Google Workspace, which is covered by the
// clinic's HIPAA agreement. A free mailbox elsewhere is not: a patient's
// name and message must never be sent to one again.
const CLINIC_MAIL = /^[a-z]+@ryuacupuncture\.com$/;

describe("the clinic's email addresses", () => {
  it("shows patients an address on the clinic's own domain", () => {
    expect(SITE.email).toMatch(CLINIC_MAIL);
  });

  it("delivers the website's forms to one on the clinic's own domain", () => {
    expect(FORMS_INBOX).toMatch(CLINIC_MAIL);
  });

  it("keeps the two apart: patients are not shown where the forms arrive", () => {
    expect(SITE.email).not.toBe(FORMS_INBOX);
  });
});

// ---- nothing in the site names a mailbox of its own ----------------------

const SRC = join(process.cwd(), "src");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)
      ? [path]
      : [];
  });
}

describe("every source file", () => {
  const files = sourceFiles(SRC);

  it("is found (the check below is not vacuous)", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it("names no free mailbox (Yahoo, Gmail, Hotmail, Outlook, AOL, iCloud)", () => {
    const found = files.filter((path) =>
      /@(yahoo|gmail|hotmail|outlook|aol|icloud)\.com/i.test(
        readFileSync(path, "utf8")
      )
    );
    expect(found.map((path) => path.slice(SRC.length + 1))).toEqual([]);
  });

  it.each(["request-form", "grievance-form"])(
    "the %s route sends to the forms inbox and nowhere else",
    (route) => {
      const source = readFileSync(
        join(SRC, "app/api", route, "route.ts"),
        "utf8"
      );
      expect(source).toMatch(/\bto: FORMS_INBOX\b/);
      expect(source.match(/\bto:/g)).toHaveLength(1);
    }
  );
});
