import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

// Guards for the staff look (docs/superpowers/specs/2026-11-21-dashboard-
// refresh-design.md). They read the source as text: the look is a set of
// promises — readable in both themes, hard edges only, one set of named
// colours — that are easy to break one class at a time.

const ADMIN = join(__dirname);
const css = readFileSync(join(ADMIN, "staff-theme.css"), "utf8");

// The --ui-* variables one theme defines.
function vars(theme: "light" | "dark"): Record<string, string> {
  const open = `html[data-staff-theme="${theme}"] {`;
  const start = css.indexOf(open);
  if (start < 0) throw new Error(`no block for ${theme}`);
  const body = css.slice(start + open.length, css.indexOf("}", start));
  const found: Record<string, string> = {};
  for (const m of body.matchAll(/(--ui-[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    found[m[1]] = m[2].trim();
  }
  return found;
}

// WCAG contrast ratio of two #rrggbb colours.
function contrast(a: string, b: string): number {
  const luminance = (hex: string) => {
    if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error(`not a hex: ${hex}`);
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const v = parseInt(hex.slice(i, i + 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// The layers of a box-shadow value whose blur radius is not zero.
function blurredLayers(value: string): string[] {
  const layers: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of value) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      layers.push(current);
      current = "";
    } else current += ch;
  }
  layers.push(current);
  return layers.filter((layer) => {
    const lengths = layer
      .replace(/rgba?\([^)]*\)|#[0-9a-f]{3,8}\b|var\([^)]*\)/gi, " ")
      .split(/\s+/)
      .filter((t) => /^-?\d*\.?\d+(px)?$/.test(t));
    return lengths.length >= 3 && parseFloat(lengths[2]) !== 0;
  });
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith(".tsx") || entry.name.endsWith(".ts")
      ? [path]
      : [];
  });
}

describe("the staff theme's colours", () => {
  it("both themes define exactly the same variables", () => {
    expect(Object.keys(vars("light")).sort()).toEqual(
      Object.keys(vars("dark")).sort()
    );
    expect(Object.keys(vars("dark")).length).toBeGreaterThan(30);
  });

  it.each(["light", "dark"] as const)(
    "%s: text is readable on every surface it is used on",
    (theme) => {
      const v = vars(theme);
      for (const fg of [
        "text",
        "text-2",
        "text-3",
        "accent-text",
        "error",
        "caution",
      ]) {
        for (const bg of ["panel", "panel-2", "well", "btn"]) {
          expect(
            contrast(v[`--ui-${fg}`], v[`--ui-${bg}`]),
            `${fg} on ${bg}`
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
      for (const bg of ["accent-fill", "accent-fill-hover", "error-fill"]) {
        expect(
          contrast(v["--ui-on-accent"], v[`--ui-${bg}`]),
          `on-accent on ${bg}`
        ).toBeGreaterThanOrEqual(4.5);
      }
      for (const st of ["waiting", "next", "called", "doctor"]) {
        expect(
          contrast(v[`--ui-st-${st}`], v[`--ui-st-${st}-bg`]),
          `status ${st}`
        ).toBeGreaterThanOrEqual(4.5);
      }
      expect(
        contrast(v["--ui-st-open"], v["--ui-panel"]),
        "not closed"
      ).toBeGreaterThanOrEqual(4.5);
      // A line and an icon, not text.
      expect(
        contrast(v["--ui-tab-accent"], v["--ui-btn"]),
        "tab accent"
      ).toBeGreaterThanOrEqual(3);
    }
  );
});

describe("hard edges only", () => {
  it("the blur detector tells a soft shadow from a ledge", () => {
    expect(blurredLayers("0 1px 2px rgba(0, 0, 0, 0.5)")).toHaveLength(1);
    expect(
      blurredLayers("inset 0 1px 0 #ffffff, 0 2px 0 rgba(0, 0, 0, 0.7)")
    ).toHaveLength(0);
    expect(blurredLayers("0 3px 0 0 #000, 0 8px 20px -8px #000")).toHaveLength(
      1
    );
  });

  it("no shadow in the theme has a blur", () => {
    const values = [
      ...css.matchAll(
        /(?:--ui-(?:lift|sunk)[a-z0-9-]*|box-shadow)\s*:\s*([^;]+);/g
      ),
    ].map((m) => m[1].trim());
    expect(values.length).toBeGreaterThan(8);
    for (const value of values) {
      expect(blurredLayers(value), value).toEqual([]);
    }
  });
});

describe("one set of named colours", () => {
  // Every colour of the dashboard and of the shared pieces is a ui-* name
  // (or a --ui-* variable): that is what lets one switch re-colour the
  // whole page, and what keeps a soft shadow or a one-theme colour from
  // creeping back in.
  it("dashboard and shared pieces use only the named colours", () => {
    const stray =
      /\b(brand-|cream|gold\b|canvas|bg-surface|text-error|bg-error|text-white|bg-white|neutral-|shadow-(sm|md|lg|xl|2xl)\b|blur)/;
    const files = [
      ...sourceFiles(join(ADMIN, "dashboard")),
      ...sourceFiles(join(ADMIN, "ui")),
    ].filter((file) => !file.endsWith(".test.ts"));
    expect(files.length).toBeGreaterThan(15);
    for (const file of files) {
      const lines = readFileSync(file, "utf8")
        .split("\n")
        .filter((line) => stray.test(line));
      expect(lines, file).toEqual([]);
    }
  });
});
