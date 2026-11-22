// The light / dark theme of the staff pages: what a stored choice means,
// and the script that applies it before the page first paints. Pure — the
// part that touches the browser is src/app/admin/ui/use-staff-theme.ts.

// "system" = follow the computer's (or tablet's) own light/dark setting.
export type ThemeChoice = "system" | "light" | "dark";
export type Theme = "light" | "dark";

export const THEME_CHOICES: readonly ThemeChoice[] = [
  "system",
  "light",
  "dark",
];

// One choice per browser, shared by every staff page that has the switch.
export const THEME_STORAGE_KEY = "rac-staff-theme";
// On <html> while a themed staff page is mounted; every colour hangs off
// it (src/app/admin/staff-theme.css), so no other page can be affected.
export const THEME_ATTRIBUTE = "data-staff-theme";

// What is in storage is whatever some older version, or a person in the
// developer tools, left there: anything unexpected is the fallback.
export function parseThemeChoice(
  raw: unknown,
  fallback: ThemeChoice = "system"
): ThemeChoice {
  return raw === "light" || raw === "dark" || raw === "system" ? raw : fallback;
}

export function resolveTheme(
  choice: ThemeChoice,
  systemPrefersDark: boolean
): Theme {
  if (choice === "system") return systemPrefersDark ? "dark" : "light";
  return choice;
}

// The source of a script to put in the page's HTML, so the right theme is
// on <html> before anything is painted (no flash of the other one). It
// must agree with parseThemeChoice + resolveTheme — staff-theme.test.ts
// runs the two against each other.
//
// It can never throw: storage may be blocked (Safari private windows),
// and a browser without matchMedia counts as "prefers dark", the look
// these pages had before they were themed.
export function themeBootScript(fallback: ThemeChoice = "system"): string {
  return `(function(){var t="dark";try{var c=null;try{c=localStorage.getItem(${JSON.stringify(
    THEME_STORAGE_KEY
  )})}catch(e){}if(c!=="light"&&c!=="dark"&&c!=="system")c=${JSON.stringify(
    fallback
  )};if(c==="system"){var m=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)");t=!m||m.matches?"dark":"light"}else{t=c}}catch(e){t="dark"}try{document.documentElement.setAttribute(${JSON.stringify(
    THEME_ATTRIBUTE
  )},t)}catch(e){}})();`;
}
