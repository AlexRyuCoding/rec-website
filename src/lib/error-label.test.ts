import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { errorLabel } from "./error-label";

describe("errorLabel", () => {
  it("gives the kind of an error and never its words", () => {
    const label = errorLabel(new TypeError("Ann Licater's row did not fit"));
    expect(label).toBe("TypeError");
    expect(label).not.toContain("Licater");
  });

  it("keeps a short code and a status", () => {
    expect(errorLabel({ code: "23505", message: "Key (email)=(a@b.c)" })).toBe(
      "Error code=23505"
    );
    expect(
      errorLabel({
        name: "validation_error",
        statusCode: 422,
        message: "cannot send to ann@example.com",
      })
    ).toBe("validation_error status=422");
    expect(errorLabel({ status: 503 })).toBe("Error status=503");
  });

  it("drops a name or a code that could be carrying text", () => {
    expect(
      errorLabel({ name: "Ann Licater <ann@example.com>", code: "see: Ann L" })
    ).toBe("Error");
    expect(errorLabel({ code: "x".repeat(41) })).toBe("Error");
  });

  it("says nothing about what is not an object", () => {
    expect(errorLabel("Ann Licater could not be saved")).toBe("unknown");
    expect(errorLabel(null)).toBe("unknown");
    expect(errorLabel(undefined)).toBe("unknown");
  });
});

// ---- no file hands a caught error to the log ------------------------------

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

// console.error("…", err) / (…, error) / (…, e) / (…, error.message)
const RAW_ERROR =
  /console\.(?:error|warn|log|info)\([^;]*?,\s*(?:err|error|e|ex|cause)(?:\.message|\.stack)?\s*\)/;

describe("the server log", () => {
  it("the pattern catches what it is meant to", () => {
    expect(RAW_ERROR.test('console.error("x failed:", err);')).toBe(true);
    expect(RAW_ERROR.test('console.error("x failed:", error.message);')).toBe(
      true
    );
    expect(RAW_ERROR.test('console.warn(\n  "x",\n  e\n);')).toBe(true);
    expect(RAW_ERROR.test('console.error("x failed:", errorLabel(err));')).toBe(
      false
    );
    expect(RAW_ERROR.test('console.error("x failed:", error.code);')).toBe(
      false
    );
  });

  it("is never given a caught error or its message", () => {
    const offenders = sourceFiles(join(process.cwd(), "src")).filter((file) =>
      RAW_ERROR.test(readFileSync(file, "utf8"))
    );
    expect(offenders.map((f) => f.replace(process.cwd() + "/", ""))).toEqual(
      []
    );
  });
});
