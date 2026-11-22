import { describe, expect, it } from "vitest";
import {
  loginThemeFallback,
  parseThemeChoice,
  resolveTheme,
  themeBootScript,
  THEME_ATTRIBUTE,
  THEME_STORAGE_KEY,
} from "./staff-theme";

describe("parseThemeChoice", () => {
  it.each(["light", "dark", "system"])("keeps %s", (v) =>
    expect(parseThemeChoice(v)).toBe(v)
  );
  it.each([null, undefined, "", "Dark", "auto", 3, {}])("%s → system", (v) =>
    expect(parseThemeChoice(v)).toBe("system")
  );
  it("uses the given fallback", () =>
    expect(parseThemeChoice("junk", "dark")).toBe("dark"));
});

describe("resolveTheme", () => {
  it("explicit choices ignore the OS", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
  it("system follows the OS", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });
});

// Runs the pre-paint script against stand-ins for the browser and returns
// the theme it put on <html>.
function runWith(
  script: string,
  stored: string | null,
  prefersDark: boolean,
  opts: { storageThrows?: boolean; noMatchMedia?: boolean } = {}
): string | undefined {
  const set: Record<string, string> = {};
  const document = {
    documentElement: {
      setAttribute: (name: string, value: string) => {
        set[name] = value;
      },
    },
  };
  const localStorage = {
    getItem: (key: string) => {
      if (opts.storageThrows) throw new Error("blocked");
      return key === THEME_STORAGE_KEY ? stored : null;
    },
  };
  const window = {
    matchMedia: opts.noMatchMedia
      ? undefined
      : (query: string) => ({
          matches: query.includes("dark") ? prefersDark : !prefersDark,
        }),
  };
  new Function("window", "document", "localStorage", script)(
    window,
    document,
    localStorage
  );
  return set[THEME_ATTRIBUTE];
}
const run = (
  stored: string | null,
  prefersDark: boolean,
  opts?: { storageThrows?: boolean; noMatchMedia?: boolean }
) => runWith(themeBootScript(), stored, prefersDark, opts);

describe("themeBootScript", () => {
  it("agrees with resolveTheme for every stored value and OS setting", () => {
    for (const stored of ["light", "dark", "system", null, "junk"]) {
      for (const dark of [true, false]) {
        expect(run(stored, dark), `${stored} / dark=${dark}`).toBe(
          resolveTheme(parseThemeChoice(stored), dark)
        );
      }
    }
  });
  it("a throwing localStorage is 'system'", () =>
    expect(run(null, false, { storageThrows: true })).toBe("light"));
  it("no matchMedia counts as dark", () =>
    expect(run(null, false, { noMatchMedia: true })).toBe("dark"));
  it("honours a page fallback when nothing is stored", () => {
    expect(runWith(themeBootScript("dark"), null, false)).toBe("dark");
    expect(runWith(themeBootScript("dark"), "junk", false)).toBe("dark");
  });
  it("a stored choice wins over the page fallback", () => {
    expect(runWith(themeBootScript("dark"), "light", true)).toBe("light");
    expect(runWith(themeBootScript("dark"), "system", false)).toBe("light");
  });
  it("contains no '<' (safe to inline in a script tag)", () =>
    expect(themeBootScript()).not.toContain("<"));
});

// The login page is the door to both themed pages, and they disagree
// about what "nothing chosen on this device" means: the dashboard
// follows the computer, the rooms board stays dark (wall tablets on
// automatic appearance). The login page takes the rule of the page the
// staff member is on the way to, so signing in never flips the look.
describe("loginThemeFallback", () => {
  it("follows the computer on the way to the dashboard", () => {
    expect(loginThemeFallback("/admin/dashboard")).toBe("system");
    expect(loginThemeFallback("/admin/dashboard?tab=setup")).toBe("system");
  });

  it("is dark on the way to the rooms board", () =>
    expect(loginThemeFallback("/admin/rooms")).toBe("dark"));

  // The kiosk has one look, and it is dark.
  it("is dark on the way to the kiosk, and when nothing was asked for", () => {
    expect(loginThemeFallback("/admin/patient-signin")).toBe("dark");
    expect(loginThemeFallback(null)).toBe("dark");
    expect(loginThemeFallback(undefined)).toBe("dark");
    expect(loginThemeFallback("")).toBe("dark");
  });

  it("is dark for anything that only looks like the dashboard", () => {
    expect(loginThemeFallback("/admin/dashboards")).toBe("dark");
    expect(loginThemeFallback("https://evil.example/admin/dashboard")).toBe(
      "dark"
    );
    expect(loginThemeFallback("//evil.example/admin/dashboard")).toBe("dark");
  });
});
