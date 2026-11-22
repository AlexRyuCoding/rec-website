# Rooms Board Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `/admin/rooms` the staff look — themed frame, photo, hard ledges — while room tiles keep their status colours and every board rule stays as it is.

**Architecture:** Reuses everything the dashboard plan built (`staff-theme.css`, `src/app/admin/ui/*`, `useStaffTheme`). The frame swaps its translucent-white classes for the `ui-*` names; tiles stay literal-coloured and only gain ledges and key-style buttons, from one small in-tile style module.

**Tech Stack:** as the dashboard plan.

**Spec:** `docs/superpowers/specs/2026-11-22-rooms-board-refresh-design.md` (and the dashboard spec it builds on). Mock-up: `docs/superpowers/specs/2026-11-22-rooms-board-refresh-mockup.html`.

**Depends on:** `2026-11-22-dashboard-refresh.md` complete and merged (or this branch stacked on it). Own branch, own pull request.

## Global Constraints

- Only files under `src/app/admin/rooms/`, plus `src/app/admin/ui/` for a piece both pages need, `src/app/admin/staff-theme.test.ts`, `CLAUDE.md`.
- No behaviour change: no handler, hook, timer, sound, drag, request or wording changes. `useRooms.ts`, `useAlarm.ts`, `grid.ts` values and everything in `src/lib/` are untouched.
- `STATUS_STYLES` card colours and `doctorColorClasses` stay literal and identical in both themes. Inside a tile nothing uses a `ui-*` colour.
- Geometry unchanged: `CELL_HEIGHT_PX` 238, `CELL_MIN_WIDTH_PX` 190, `max-w-5xl` column, every press target ≥ 40×40 px, status line 13px.
- No blurred shadow on the page (`shadow-2xl`, `shadow-lg`, `shadow-[…24px…]` all become hard ledges).
- Motion: nothing new slides or resizes. Only: tile colour cross-fade 300 ms, key press 80 ms, theme cross-fade.
- With no stored choice the board is dark.

## Review Focus

1. A wall iPad on automatic appearance at sunset, nothing chosen → the board does not change theme. *Task 1.*
2. Light theme: a doctor alert, a long-wait outline, an amber or red waiting name, the picked name → each as visible as in dark. *Task 5 walk.*
3. 1080×810: two rows of tiles + one doctor alert + the waiting list fit without scrolling, as on `main`. *Task 5 walk.*
4. The ledge under a tile or key must not make anything taller or move a press target (ledges are shadows, never borders or margins). *Task 5 walk: element boxes equal `main`'s.*
5. A board left open across the deploy (old JS, new CSS absent) is impossible here — CSS ships with the page; but a tablet that reloads itself must not flash light before dark. *Task 1 (boot script fallback "dark").*

---

### Task 1: Theme on the board

**Files:** Create `src/app/admin/rooms/layout.tsx`. Modify `src/app/admin/rooms/page.tsx` (header only), `src/app/admin/ui/ThemeSwitch.tsx`.

**Consumes:** `themeBootScript(fallback)`, `useStaffTheme(fallback)`, `ThemeSwitch`, `Backdrop`, `buttonClass` (dashboard plan Tasks 1, 3, 4).
**Produces:** `ThemeSwitch` gains `device?: "computer" | "tablet"` (default "computer") — only the first item's name changes: "Match this computer" / "Match this tablet".

- [ ] **Step 1:** `layout.tsx`: imports `../staff-theme.css`, inline `themeBootScript("dark")`, renders children.
- [ ] **Step 2:** `page.tsx`: `useStaffTheme("dark")`; `<main>` loses `bg-neutral-950 text-white`, gains `text-ui-text`; add `Backdrop`; the header becomes the opaque top bar (panel colour, hairline, `shadow-lift-2`) inside the same `max-w-5xl` width: back link (`buttonClass({variant:"quiet"})`, ArrowLeft, same `aria-label`), "Rooms", Reconnecting in `text-ui-caution`, `ThemeSwitch device="tablet"`, `SoundsPanel`, Edit layout / Done (`buttonClass()`). Page content `relative z-10`.
- [ ] **Step 3:** "Tap to turn on alert sounds" → a full-width default `Button`; the action error → `Banner tone="error"`; "Loading…" and "No rooms yet" on small panel-coloured surfaces (nothing read off the photo). The silent-sounds bar: only its shadow changes, to `shadow-[0_-3px_0_rgba(0,0,0,0.5)]`.
- [ ] **Step 4:** `npm run lint && npx tsc --noEmit && npm test` clean. Commit `feat(rooms): themed top bar, photo and theme switch on the board`.

### Task 2: Waiting list and its panels

**Files:** Modify `WaitingList.tsx`, `ExpectedPanel.tsx`, `FinishedPanel.tsx`, `SoundsPanel.tsx`.

Mapping for all frame files (this task and Task 4):

| today | becomes |
| --- | --- |
| `bg-neutral-900`, `bg-neutral-800`, `bg-white/5` containers | `Panel` (or `bg-ui-panel border border-ui-line shadow-lift-2`) |
| `bg-white/10 … hover:bg-white/20` buttons | `buttonClass()`; the pressed/open one keeps a visible "on" state (`bg-ui-well shadow-sunk`) |
| `text-white` | `text-ui-text` |
| `text-white/60…/80` | `text-ui-text-2` |
| `text-white/40…/50` | `text-ui-text-3` |
| `border-white/10`, `ring-white/10…/15` | `border-ui-line` / `ring-ui-line` |
| `text-amber-300/400` (cautions, "12 min late") | `text-ui-caution` |
| `text-rose-300`, `bg-rose-900/…` errors | `text-ui-error` / `Banner tone="error"` |
| `bg-rose-600 text-white` armed "Remove?" | `bg-ui-error-fill text-ui-on-accent` |
| inputs | `fieldClass` |

- [ ] **Step 1 (WaitingList):** container → raised panel. A waiting chip → a key: `bg-ui-btn border border-ui-line-strong shadow-lift-1 text-ui-text`, pressing moves it 2px; amber and red wait levels keep their own literal fills with a ledge in a darker shade of the same hue and their existing text colours; the selected chip is outlined `outline-[3px] outline-ui-tab-accent outline-offset-2` instead of turning white; its remove "×" column follows the mapping. The drag copy: same chip look, hard ledge instead of `shadow-2xl`; its "Send to Room 1" label a hard-edged tag. Keep the single scrolling row, every size, `transition-[background-color,color,opacity]`.
- [ ] **Step 2 (Expected, Finished, Sounds):** apply the mapping; amber from 10 minutes late / red from 30 keep those meanings (`text-ui-caution` / `text-ui-error`); "Check in", "Restore", "Refresh", the sound test buttons → `Button`.
- [ ] **Step 3:** `npm run lint && npx tsc --noEmit` clean. Commit `feat(rooms): waiting list and its panels in the staff look`.

### Task 3: Tiles and the doctor alert

**Files:** Create `src/app/admin/rooms/tile/key-styles.ts`. Modify `RoomTile.tsx`, `tile/TimeControl.tsx`, `tile/DoctorPanel.tsx`, `tile/PatientMenu.tsx`, `tile/JoinQuestionOverlay.tsx`, `WaitingBanner.tsx`.

**Produces (`key-styles.ts`, literal classes, theme-independent):**
```ts
export const tileKey: string;      // translucent key: bg-white/20, inset top line, 0 2px 0 rgba(0,0,0,.38) ledge, active: translate-y-[2px] + no ledge, 80 ms
export const tileKeySolid: string; // the white key (main action): bg-white, same ledge
export const TILE_LEDGE: Record<RoomState["status"], string>; // 'shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_4px_0_<shade>]' per status
```
Ledge shades: available `#034a35`, patient_waiting `#4a1280`, with_doctor `#0b0a22`, turnover `#29323f`, in_use `#04334d`, complete `#8a4803`, overtime `#770a25`.

- [ ] **Step 1:** `RoomTile.tsx`: the card adds `TILE_LEDGE[state.status]` and `transition-[background-color,box-shadow] duration-300`; `STATUS_STYLES` card colours untouched. Every `bg-white/20…` button → `tileKey`, every `bg-white/90…` button → `tileKeySolid` keeping its own text colour; sizes (`min-h-10`, `min-h-11`, `iconButton`) unchanged. Rings that mark a drop target or a long wait stay.
- [ ] **Step 2:** `TimeControl.tsx` − / + → `tileKey`. The three overlays keep their dark fills in both themes; their buttons take `tileKey` / `tileKeySolid`; armed "Remove" stays red.
- [ ] **Step 3:** `WaitingBanner.tsx`: each alert keeps `doctorColorClasses` / the amber fallback, gains `shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_3px_0_rgba(0,0,0,0.45)]`; "Doctor in" gets a hard ledge; the red long-wait outline and badge stay.
- [ ] **Step 4:** `npm run lint && npx tsc --noEmit && npm test` clean. Commit `feat(rooms): hard-edged tiles, keys and doctor alert`.

### Task 4: Layout editor

**Files:** Modify `LayoutEditor.tsx`.

- [ ] **Step 1:** Apply Task 2's mapping: editor surfaces → panels, buttons → `Button`, inputs → `fieldClass`, the doctor roster rows hairline-separated; room placeholders in the grid keep the board's geometry and get a dashed `border-ui-line-strong` on `bg-ui-panel`; the two-tap bin keeps its armed red.
- [ ] **Step 2:** lint + tsc clean. Commit `feat(rooms): layout editor in the staff look`.

### Task 5: Guards, walk, docs

**Files:** Modify `src/app/admin/staff-theme.test.ts`, `CLAUDE.md`. Scratch only: a Playwright walk (start from the project's rooms-board walk recipe: simulated `/api/admin/rooms`, visits and timer routes applying `patient-flow.ts` / `room-status.ts`).

- [ ] **Step 1: Guard tests (write first, watch them fail on the pre-change files if run before Tasks 1–4):**
```ts
it("the rooms board has no blurred shadow", () => {
  // every .tsx under src/app/admin/rooms: no /shadow-(sm|md|lg|xl|2xl)\b/, and every
  // shadow-[…] arbitrary value has blur 0 in each layer
});
it("the board's frame uses the named colours", () => {
  // page.tsx, WaitingList.tsx, ExpectedPanel.tsx, FinishedPanel.tsx, SoundsPanel.tsx,
  // LayoutEditor.tsx: no /\b(bg-neutral-|text-white\/|bg-white\/(5|10|15)\b)/
});
it("tiles do not follow the theme", () => {
  // RoomTile.tsx and tile/*: no /\bui-/
});
```
- [ ] **Step 2:** Walk in Chromium and WebKit, light and dark, 1080×810 and 1366×1024: each tile status, a doctor alert, a long wait, a picked name with target tiles, the join question, "Room 5 changed", Edit layout, Expected / Finished / Sounds open, the silent bar. Assert: bounding boxes of every tile and every button inside a tile equal those from the same script run on `main` (±0.5px); the second tile row's bottom ≤ 810 in the two-rows-plus-alert state; all press targets ≥ 40×40; with nothing stored and `colorScheme: "light"` the attribute is `dark`; after choosing Light on the dashboard the board loads light; no `pageerror`.
- [ ] **Step 3:** Read every screenshot, fix, re-run.
- [ ] **Step 4:** CLAUDE.md: extend "Staff look" to the board (frame themed, tiles literal and why, board defaults to dark and why, no new motion); "Tile sizes" notes that ledges are shadows and must never become borders or margins.
- [ ] **Step 5:** `npm run lint && npm test && npm run build` pass. Commit `docs: the staff look on the rooms board`. The pull request says: needs Alex's check on a real iPad before merge.
