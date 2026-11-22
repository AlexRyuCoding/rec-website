# Dashboard Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle `/admin/dashboard` — named colours, light/dark/system theme, hard-edged depth, photo backgrounds, short animations — with no change in behaviour.

**Architecture:** Colours are CSS variables under `html[data-staff-theme]`, exposed to Tailwind as a `ui` colour group; a small hook sets the attribute while a staff page is mounted. A handful of shared pieces in `src/app/admin/ui/` carry the look; each dashboard panel swaps its repeated class strings for them. No new dependency.

**Tech Stack:** Next.js 15 App Router, React 18, Tailwind 3, lucide-react, vitest (node only — no DOM tests).

**Spec:** `docs/superpowers/specs/2026-11-21-dashboard-refresh-design.md` (read it first; its tables hold every colour). Mock-up source: `docs/superpowers/specs/2026-11-21-dashboard-refresh-mockup.html` — its `<style>` is the reference for ledges, paddings, radii and timings.

## Global Constraints

- Only files under `src/app/admin/dashboard/`, `src/app/admin/ui/`, `src/app/admin/staff-theme.css`, `src/lib/staff-theme*.ts`, `tailwind.config.ts`, `public/staff-bg-*.jpg`, `CLAUDE.md`. The Rooms board, kiosk, TV, login and public pages must render exactly as before.
- No behaviour change: no handler, fetch, state rule, message wording, ARIA role or id changes except where a task says so.
- No new dependency. No animation library on the dashboard.
- No blurred shadow: every `box-shadow` has blur 0. No gradients on faces.
- Every colour in dashboard and `admin/ui` code is a `ui-*` Tailwind name or a `--ui-*` variable. None of: `brand-`, `cream`, `gold`, `canvas`, `surface`, `text-error`, `bg-error`, `text-white`, `bg-white`, `neutral-`.
- Text contrast ≥ 4.5:1 on the surface it sits on, both themes, hover included.
- Nothing is read straight off the photo: all text and controls sit on an opaque surface.
- Motion: 80–280 ms; `prefers-reduced-motion` keeps fades, drops sliding/resizing; arrivals are CSS keyframes; nothing about to be pressed moves.
- "Must not change" list in the spec (tabs stay mounted, search stability rules, refresh never blanks the list, `#music`, `?tab=`).
- Commit after each task; messages in the repo's style (`feat(dashboard): …`).

## Review Focus

1. `localStorage` blocked or throwing (Safari private mode) → the page is still themed (as "system") and the switch still works until reload. *Pinned in Task 1.*
2. A junk value stored under the theme key → treated as "system". *Task 1.*
3. OS appearance changes while the page is open → follows live under "system", ignored under an explicit choice. *Task 1 (rule) + Task 9 walk.*
4. Opening `?tab=setup` directly, or resizing/zooming → every sliding thumb sits exactly on its chosen item (never width 0 at the corner). *Task 9 walk.*
5. A photo is slow or fails → page colour shows; every text still readable. Long names/emails at 1024px and 400px → the table scrolls inside its panel, the page never scrolls sideways. *Task 9 walk.*

---

## File map

| file | responsibility |
| --- | --- |
| `src/lib/staff-theme.ts` (+ `.test.ts`) | pure theme rule, storage key, pre-paint script source |
| `src/app/admin/staff-theme.css` | every `--ui-*` variable for both themes, backdrop, keyframes, theme cross-fade, reduced motion |
| `src/app/admin/staff-theme.test.ts` | guards: both themes define the same names; contrast; no blur; no stray palette classes |
| `tailwind.config.ts` | `ui` colours, ledge shadows |
| `src/app/admin/ui/use-staff-theme.ts` | sets/removes the attribute, follows the OS, stores the choice |
| `src/app/admin/ui/use-thumb.ts` | measures and moves a sliding thumb |
| `src/app/admin/ui/Segmented.tsx`, `Button.tsx`, `Panel.tsx`, `Tag.tsx`, `StatusPill.tsx`, `Banner.tsx`, `AutoHeight.tsx`, `ThemeSwitch.tsx`, `Backdrop.tsx`, `styles.ts` | the shared pieces |
| `src/app/admin/dashboard/layout.tsx` | imports the CSS, pre-paint script |
| `src/app/admin/dashboard/page.tsx` + six panels | use the pieces |

---

### Task 1: Theme rule

**Files:** Create `src/lib/staff-theme.ts`, `src/lib/staff-theme.test.ts`.

**Interfaces — Produces:**
```ts
export type ThemeChoice = "system" | "light" | "dark";
export type Theme = "light" | "dark";
export const THEME_CHOICES: readonly ThemeChoice[]; // ["system","light","dark"]
export const THEME_STORAGE_KEY = "rac-staff-theme";
export const THEME_ATTRIBUTE = "data-staff-theme";
// Anything that is not exactly "light" | "dark" | "system" → fallback.
export function parseThemeChoice(raw: unknown, fallback?: ThemeChoice): ThemeChoice; // fallback default "system"
export function resolveTheme(choice: ThemeChoice, systemPrefersDark: boolean): Theme;
// Source of a self-contained script: reads the stored choice, resolves it
// with matchMedia, sets THEME_ATTRIBUTE on <html>. Never throws. A missing
// matchMedia counts as "prefers dark" (the page's look before the refresh).
export function themeBootScript(fallback?: ThemeChoice): string;
```

- [ ] **Step 1: Write the failing tests**

```ts
describe("parseThemeChoice", () => {
  it.each(["light", "dark", "system"])("keeps %s", (v) => expect(parseThemeChoice(v)).toBe(v));
  it.each([null, undefined, "", "Dark", "auto", 3, {}])("%s → system", (v) => expect(parseThemeChoice(v)).toBe("system"));
  it("uses the given fallback", () => expect(parseThemeChoice("junk", "dark")).toBe("dark"));
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
describe("themeBootScript", () => {
  // run(stored, prefersDark, opts) evaluates the script with fakes:
  //   document.documentElement.setAttribute recorded; localStorage.getItem
  //   returns `stored` or throws when opts.storageThrows; window.matchMedia
  //   returns {matches: prefersDark} or is undefined when opts.noMatchMedia.
  it("agrees with resolveTheme for every stored value and OS setting", () => {
    for (const stored of ["light", "dark", "system", null, "junk"])
      for (const dark of [true, false])
        expect(run(stored, dark)).toBe(resolveTheme(parseThemeChoice(stored), dark));
  });
  it("a throwing localStorage is 'system'", () => expect(run(null, false, { storageThrows: true })).toBe("light"));
  it("no matchMedia counts as dark", () => expect(run(null, false, { noMatchMedia: true })).toBe("dark"));
  it("honours a page fallback when nothing is stored", () =>
    expect(runWith(themeBootScript("dark"), null, false)).toBe("dark"));
  it("contains no '<' (safe to inline in a script tag)", () => expect(themeBootScript()).not.toContain("<"));
});
```
- [ ] **Step 2:** `npx vitest run src/lib/staff-theme.test.ts` → FAIL (module not found).
- [ ] **Step 3:** Implement the three functions and constants. The script is an IIFE in ES5 inside one try/catch whose catch sets the attribute to `"dark"`.
- [ ] **Step 4:** Run again → PASS.
- [ ] **Step 5:** Commit `feat(dashboard): theme rule for the staff pages`.

### Task 2: Colours, ledges, photos

**Files:** Create `src/app/admin/staff-theme.css`, `src/app/admin/staff-theme.test.ts`, `public/staff-bg-light.jpg`, `public/staff-bg-dark.jpg`. Modify `tailwind.config.ts`. Delete `public/dashboard-bg-light.jpg`, `public/dashboard-bg-dark.jpg` after converting.

**Interfaces — Produces:**
- CSS variables, defined in exactly two blocks, `html[data-staff-theme="dark"]` and `html[data-staff-theme="light"]`, values from the spec's tables and the mock-up's `:root` blocks:
  `--ui-page --ui-panel --ui-panel-2 --ui-well --ui-line --ui-line-strong --ui-text --ui-text-2 --ui-text-3 --ui-accent-fill --ui-accent-fill-hover --ui-accent-text --ui-on-accent --ui-tab-accent --ui-error --ui-error-fill --ui-caution --ui-btn --ui-st-waiting --ui-st-waiting-bg --ui-st-next --ui-st-next-bg --ui-st-called --ui-st-called-bg --ui-st-doctor --ui-st-doctor-bg --ui-st-open --ui-lift-1 --ui-lift-2 --ui-lift-accent --ui-lift-danger --ui-sunk --ui-scrim --ui-photo-light --ui-photo-dark`
  (`--ui-caution` = the Waiting text colour; `--ui-on-accent` = `#ffffff`.) Each block also sets `color-scheme`.
- `html[data-staff-theme] body { background: var(--ui-page); color: var(--ui-text); }`
- Classes: `.staff-backdrop` (+ `.staff-backdrop-light`, `.staff-backdrop-dark` layers, `::after` scrim; the layer of the theme not showing gets its `background-image` only under `.staff-backdrop[data-all]`), `.ui-thumb` / `.ui-thumb-still`, `.ui-enter` (rise 6px + fade, 220 ms), `.ui-settle` (opacity 0.3 → 1, 260 ms), `.ui-fade-in` (opacity 0 → 1, 160 ms), `.ui-reveal-x` / `.ui-reveal-x[data-open]` (max-width 0 ↔ 380px, 280 ms, `visibility` hidden when closed), `html.staff-theming, html.staff-theming *` (the cross-fade list from the mock-up, `!important`), and one `@media (prefers-reduced-motion: reduce)` block.
- Tailwind: `colors.ui = { page, panel, "panel-2", well, line, "line-strong", text, "text-2", "text-3", "accent-fill", "accent-fill-hover", "accent-text", "on-accent", "tab-accent", error, "error-fill", caution, btn, "st-waiting", "st-waiting-bg", "st-next", "st-next-bg", "st-called", "st-called-bg", "st-doctor", "st-doctor-bg", "st-open" }` each `"var(--ui-…)"`; `boxShadow = { "lift-1", "lift-2", "lift-accent", "lift-danger", sunk }` each `"var(--ui-…)"`.

- [ ] **Step 1: Write the failing guard tests** (`staff-theme.test.ts` reads the CSS file as text; put a `contrast(hexA, hexB)` WCAG helper and a `vars(theme)` parser in the test file).

```ts
it("both themes define exactly the same variables", () =>
  expect(Object.keys(vars("light")).sort()).toEqual(Object.keys(vars("dark")).sort()));
it.each(["light", "dark"])("%s: text is readable on every surface it is used on", (theme) => {
  const v = vars(theme);
  for (const fg of ["text", "text-2", "text-3", "accent-text", "error", "caution"])
    for (const bg of ["panel", "panel-2", "well", "btn"])
      expect(contrast(v[`--ui-${fg}`], v[`--ui-${bg}`]), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
  for (const bg of ["accent-fill", "accent-fill-hover", "error-fill"])
    expect(contrast(v["--ui-on-accent"], v[`--ui-${bg}`]), bg).toBeGreaterThanOrEqual(4.5);
  for (const st of ["waiting", "next", "called", "doctor"])
    expect(contrast(v[`--ui-st-${st}`], v[`--ui-st-${st}-bg`]), st).toBeGreaterThanOrEqual(4.5);
  expect(contrast(v["--ui-st-open"], v["--ui-panel"])).toBeGreaterThanOrEqual(4.5);
  expect(contrast(v["--ui-tab-accent"], v["--ui-btn"])).toBeGreaterThanOrEqual(3); // a line and an icon, not text
});
it("no shadow anywhere in the file has a blur", () => {
  // every value of a --ui-lift-*/--ui-sunk variable and of any box-shadow
  // declaration: split into layers; in each, the third length (if any) is 0.
});
it("dashboard and shared pieces use only the named colours", () => {
  // every .tsx under src/app/admin/dashboard and src/app/admin/ui: no match for
  // /\b(brand-|cream|gold\b|canvas|bg-surface|text-error|bg-error|text-white|bg-white|neutral-|shadow-(sm|md|lg|xl|2xl)|blur)/
});
```
- [ ] **Step 2:** Run → FAIL (file missing). The last test fails until Task 8 — mark it `it.todo` now and switch it on in Task 8.
- [ ] **Step 3:** Write the CSS and the Tailwind additions. If a pair fails contrast, adjust the value toward more contrast and record the change in the spec's table.
- [ ] **Step 4:** Photos: `sips -Z 1920 -s format jpeg -s formatOptions 62 public/dashboard-bg-light.jpg --out public/staff-bg-light.jpg` (same for dark); each ≤ 360 KB; then delete the two `dashboard-bg-*` originals.
- [ ] **Step 5:** `npx vitest run src/app/admin/staff-theme.test.ts` → PASS (one todo). `npm run build` → compiles.
- [ ] **Step 6:** Commit `feat(dashboard): named colours, hard ledges and photos for the staff theme`.

### Task 3: Theme at runtime

**Files:** Create `src/app/admin/ui/use-staff-theme.ts`, `src/app/admin/ui/Backdrop.tsx`, `src/app/admin/dashboard/layout.tsx`.

**Interfaces — Consumes:** Task 1 exports; Task 2 classes.
**Produces:**
```ts
// Sets THEME_ATTRIBUTE on <html> while mounted (layout effect), follows the
// OS live under "system", removes the attribute on unmount.
export function useStaffTheme(fallback?: ThemeChoice): { choice: ThemeChoice; setChoice(next: ThemeChoice): void };
export function Backdrop(): JSX.Element; // fixed, aria-hidden, z-0; sets data-all after window "load"
```
- `setChoice` stores the choice (try/catch), adds `staff-theming` to `<html>` for 460 ms, then sets the attribute.
- `layout.tsx` (server component): `import "../staff-theme.css"`, renders `<script dangerouslySetInnerHTML={{ __html: themeBootScript() }} />` then `children`.

- [ ] **Step 1:** Implement the three files.
- [ ] **Step 2:** `npm run lint && npx tsc --noEmit` → clean. (Behaviour is checked in the Task 9 walk; there is no DOM test runner.)
- [ ] **Step 3:** Commit `feat(dashboard): theme at runtime — attribute, pre-paint script, photo backdrop`.

### Task 4: Shared pieces

**Files:** Create in `src/app/admin/ui/`: `styles.ts`, `Button.tsx`, `Panel.tsx`, `Tag.tsx`, `Banner.tsx`, `StatusPill.tsx`, `use-thumb.ts`, `Segmented.tsx`, `AutoHeight.tsx`, `ThemeSwitch.tsx`. Test: `src/app/admin/ui/StatusPill.test.ts`.

**Interfaces — Produces:**
```ts
// styles.ts — class strings
export function buttonClass(o?: { variant?: "default" | "primary" | "quiet" | "danger"; size?: "sm" | "md" | "lg" }): string;
export const fieldClass: string;   // sunken text/date field
export const selectClass: string;  // raised like a button
export const tableClass: string; export const thClass: string; export const tdClass: string; export const trClass: string;
export const linkClass: string;    // text link (Log)

export function Button(p: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: …; size?: … }): JSX.Element;
export function Panel(p: HTMLAttributes<HTMLElement> & { as?: "div" | "section" }): JSX.Element;
export function Tag(p: { children: ReactNode; className?: string }): JSX.Element;
export function Banner(p: { tone: "error" | "caution" | "note"; role?: "alert" | "status"; children: ReactNode }): JSX.Element;

// StatusPill.tsx
export type PillLook = { tone: "waiting" | "next" | "called" | "doctor" | "finished" | "removed" | "open"; mark: "dot" | "check" | "x" | "alert" };
export function pillLook(status: CheckinStatus): PillLook;
export function StatusPill(p: { status: CheckinStatus; children: ReactNode }): JSX.Element;

// use-thumb.ts — the element with data-thumb-item={active} inside the container is the target
export function useThumb(active: string): { containerRef: RefObject<HTMLDivElement>; thumbRef: RefObject<HTMLSpanElement>; arm(): void };

export function Segmented<T extends string>(p: {
  label: string; value: T; onChange(v: T): void;
  options: { value: T; label: ReactNode; ariaLabel?: string; title?: string }[];
  semantics?: "pressed" | "radio"; // aria-pressed buttons (default) or radiogroup/radio with aria-checked
  size?: "md" | "icon"; className?: string;
}): JSX.Element;

// Three icon items: Monitor "Match this computer", Sun "Light", Moon "Dark" — a Segmented, size "icon".
export function ThemeSwitch(p: { choice: ThemeChoice; onChange(next: ThemeChoice): void }): JSX.Element;

// Animates its own height when `watch` changes; instant under reduced motion.
export function AutoHeight(p: { watch: string | number | boolean; children: ReactNode; className?: string }): JSX.Element;
```
- `useThumb`: positions with `transform` + `width`/`height` from `offsetLeft/Top/Width/Height`; re-measures on `ResizeObserver` of the container, on `document.fonts.ready`, and on every `active` change. The move animates only if `arm()` was called since the last measure (call it in the items' `onPointerDown` and `onKeyDown`); otherwise the thumb carries `ui-thumb-still`.
- Items keep one font weight selected or not.
- `pillLook`: waiting→waiting/dot, next_up→next/dot, called→called/dot, with_doctor→doctor/dot, finished→finished/check, removed→removed/x, not_closed→open/alert.

- [ ] **Step 1: Failing test**
```ts
it("gives every status its own look", () => {
  const all: CheckinStatus[] = ["waiting", "next_up", "called", "with_doctor", "finished", "removed", "not_closed"];
  const tones = all.map((s) => pillLook(s).tone);
  expect(new Set(tones).size).toBe(7);
  expect(all.filter((s) => pillLook(s).mark === "dot")).toEqual(["waiting", "next_up", "called", "with_doctor"]);
});
```
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement all ten files from the mock-up's `.btn`, `.seg`, `.thumb`, `.panel`, `.pill`, `.tag`, `.field`, `th`/`td` rules. **Step 4:** Run → PASS; `npm run lint && npx tsc --noEmit` clean.
- [ ] **Step 5:** Commit `feat(dashboard): shared pieces — buttons, switches, panels, status pills`.

### Task 5: Dashboard shell

**Files:** Modify `src/app/admin/dashboard/page.tsx`.

**Consumes:** `useStaffTheme`, `ThemeSwitch`, `Backdrop`, `buttonClass`, `Button`, `useThumb`.

- [ ] **Step 1:** Rebuild the render only (state, effects, `open()`, `tabFromAddress()` untouched): `Backdrop`; a full-width top bar (`bg-ui-panel`, hairline bottom, `shadow-lift-2`, `relative z-10`) holding the title, the email, `ThemeSwitch`, the "Rooms board" link (`buttonClass()`, still `next/link` to `/admin/rooms`, Timer icon), Sign out (`quiet`); under them the tablist with a `useThumb` thumb (tab-accent line inside its bottom edge) and lucide icons ClipboardList / Users / SlidersHorizontal / ScrollText. Content column `max-w-[1280px]`, `relative z-10`; drop `mt-12`.
- [ ] **Step 2:** Tab panels keep `role`, ids, `hidden`, and the mounting rules; they lose their outline classes (each panel file brings its own surfaces). When `open(next)` shows a panel, replay `ui-enter` on it through a ref (remove class, read `offsetWidth`, add class) — not a React `key`.
- [ ] **Step 3:** The kiosk link stays fixed bottom-right, as a 32px round `bg-ui-panel border-ui-line text-ui-text-3` surface.
- [ ] **Step 4:** `npm run lint && npx tsc --noEmit` clean. Commit `feat(dashboard): top bar, sliding tabs, theme switch`.

### Task 6: Check-ins

**Files:** Modify `src/app/admin/dashboard/CheckinsPanel.tsx`.

- [ ] **Step 1:** Toolbar = `Panel`: `Segmented` (semantics "pressed") for the five presets with the existing click logic; the two date inputs always rendered inside a `ui-reveal-x` span, `data-open` and focusable only when `preset === "custom"`; Refresh (`quiet`, spinning icon as now) and Export CSV on the right.
- [ ] **Step 2:** Error line → `Banner tone="error" role="alert"`; the large-range note → `Banner tone="caution"`.
- [ ] **Step 3:** `CountTile` / `MeasureTile` → raised `Panel` tiles per the spec (28px number, existing wording under the times). Two groups in a grid `4fr 5fr`; for a range other than Today, one row: Checked in + three times (`1fr 4fr`).
- [ ] **Step 4:** "By practitioner": a `Panel` whose header is a button with `aria-expanded`, body in `AutoHeight`; same table inside.
- [ ] **Step 5:** Main table in a `Panel` with the table classes; `StatusPill` replaces the coloured `<td>` text (children: the existing label, ` · n min` for waiting, the finished time); wait column right-aligned. "Loading…" and the empty message are centred inside the panel. Footer row inside the panel with the count / Load more.
- [ ] **Step 6:** After a `load("replace")` succeeds, replay `ui-settle` on the summary and the table panel via refs. `load("refresh")` replays nothing.
- [ ] **Step 7:** `npm run lint && npx tsc --noEmit && npm test` clean. Commit `feat(dashboard): check-ins — tiles, status pills, animated range`.

### Task 7: Patients and Log

**Files:** Modify `src/app/admin/dashboard/PatientsPanel.tsx`, `src/app/admin/dashboard/AuditPanel.tsx`.

- [ ] **Step 1 (Patients):** Toolbar `Panel` with the search field (`fieldClass`, 17px, Search icon inside on the left; "Searching…" hint stays inside on the right with its 300 ms delay) and the primary `lg` Search button — its width must not change with state. Results in a `Panel` with the table classes; PIN "Set" as `Tag`, "None" as hint text; actions in the order Log (`linkClass`) · Reset PIN (default `sm`) · Check in (primary `sm`); confirm = danger "Reset PIN for {name}" + Cancel. New rows get `ui-fade-in` (keyed by patient id, so rows that stay do not replay). The no-match message and "Showing the N closest matches" sit in a `Banner tone="note"` / the panel footer — below everything, as now. Confirmations use `text-ui-accent-text`, errors `text-ui-error`.
- [ ] **Step 2 (Log):** Toolbar `Panel`: two selects (`selectClass`), the "Only {name}" filter as a 6px-corner rectangle (accent-text edge and text, panel fill, × button inside), Refresh (`quiet`). The intro sentence moves into the table panel's head. Table: when/who secondary, what as `Tag`, patients main text, detail secondary. Footer inside the panel.
- [ ] **Step 3:** `npm run lint && npx tsc --noEmit` clean. Commit `feat(dashboard): patients and log in the new look`.

### Task 8: Setup

**Files:** Modify `src/app/admin/dashboard/ScreensPanel.tsx`, `MusicPanel.tsx`, `SyncPanel.tsx`, `page.tsx` (the Setup grid), `src/app/admin/staff-theme.test.ts` (switch the todo on).

- [ ] **Step 1:** In `page.tsx` the Setup panel becomes a two-column grid at ≥ 1100px: left column Screens then Sync, right column Music; one column below. Remove each panel's own `mt-10` and outline.
- [ ] **Step 2:** Each panel: a `Panel` card, icon heading (existing icons, `text-ui-accent-text`), every existing sentence unchanged in `text-ui-text-2`. Inputs `fieldClass`, selects `selectClass`, buttons `Button`; device kind and music source are `Segmented` (music keeps `semantics="radio"`); the kind badge is a `Tag`; lists are hairline rows. `id="music"` stays on the music card.
- [ ] **Step 3:** MusicPanel: the fields that depend on the source sit in `AutoHeight watch={source}` and the incoming block gets `ui-enter`. No state or request changes.
- [ ] **Step 4:** Turn on the "only the named colours" guard test; fix whatever it finds in any dashboard or `admin/ui` file.
- [ ] **Step 5:** `npm run lint && npx tsc --noEmit && npm test` → all pass. Commit `feat(dashboard): setup cards in the new look`.

### Task 9: Walk it in two browsers, then document

**Files:** Modify `CLAUDE.md`. Scratch only (not committed): a Playwright script.

- [ ] **Step 1:** Build with dummy env (`export` the vars — see the project's local-verification notes), `next start`, mint a staff cookie, simulate `/api/admin/*` with `page.route` (check-ins covering all seven statuses, a search, devices, music, the log).
- [ ] **Step 2:** In Chromium **and** WebKit, light and dark, at 1440×900 and 1024×768, screenshot every tab plus: reset confirmation, "Checked in", a failed load, empty search, Custom dates open, "Only {name}" in the Log, a non-Today range. Assert in the script:
  - `document.documentElement.scrollWidth <= innerWidth` at 1024 and at 400 wide;
  - after loading `?tab=setup` directly, every `.ui-thumb` has width > 0 and its box equals its chosen item's box (±1px); same after `page.setViewportSize`;
  - with requests to `staff-bg-*.jpg` aborted, the page still renders and `getComputedStyle(body).backgroundColor` is the page colour;
  - `emulateMedia({ colorScheme })` flips the attribute under "system" and not after choosing Light;
  - with `localStorage.setItem` patched to throw, clicking Dark still sets the attribute;
  - with `reducedMotion: "reduce"`, a thumb's computed `transition-duration` is `0s`;
  - no `pageerror` events.
- [ ] **Step 3:** Open `/admin/rooms` and `/admin/patient-signin` after choosing Light on the dashboard (client navigation via the Rooms board link, and a fresh load): `<html>` has no `data-staff-theme`, and screenshots match ones taken on `main`.
- [ ] **Step 4:** Read every screenshot; fix what is wrong; re-run.
- [ ] **Step 5:** CLAUDE.md: Tech Stack line (dashboard is the stated exception to "single dark theme"); "Errors on the dashboard use one red" → names `ui-error`; new section "Staff look (dashboard)": rectangle/pill and raised/flat rules, no blurred shadows, where colours and pieces live, theme switch + storage key + attribute lifetime, photos and the text-on-surface rule, motion rules, the guard tests.
- [ ] **Step 6:** `npm run lint && npm test && npm run build` → pass. Commit `docs: the staff look and its rules`.
