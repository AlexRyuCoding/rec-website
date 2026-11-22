# Dashboard refresh — design

Date: 2026-11-21. Scope: `/admin/dashboard` only.

Mock-up (clickable, made-up patients, both themes):
https://claude.ai/artifact/Jmj4AvXNkWLM9fsEnaMrSb (private to Alex). Its
source is in this folder: `2026-11-21-dashboard-refresh-mockup.html`
(plain HTML + CSS; read its `<style>` for exact ledges, timings,
paddings and corner sizes). The mock-up is the look Alex has seen: follow
it where it shows something. This document governs where the two differ
and covers what the mock-up does not show. The copy in the mock-up's
Setup tab is placeholder — see "Setup" below.

## Why

Staff work in the dashboard for hours a day. Today every element is the
same thing: a 1px cream outline on a near-black blue-green page. Tabs,
panels, stat tiles, inputs and buttons cannot be told apart by shape or
weight, the seven visit statuses have only three looks (four of them are
the same teal text), and the bright outline and text on the dark page
are tiring to look at.

The refresh makes each kind of element look like what it is, and lets
each staff member choose a light or dark page.

## Goals

- Sections are separated by filled, raised panels on a quieter page, not
  by outlines. The page has depth: Alex asked for "more depth and
  tactility — drop shadows, raised tiles, cards, buttons".
- Each of the seven statuses is recognisable at a glance, by colour and
  by shape, in both themes.
- Tabs read as navigation; buttons read as buttons; states read as
  states. Rule of thumb for the whole page: **rectangles are pressed,
  pills are read** — and what can be pressed is raised, what is read is
  flat.
- Changes are animated, briefly — see "Motion".
- A photograph behind the page, one per theme, supplied by Alex — see
  "Background photos".
- A Light / Dark / Match-this-computer switch in the header, remembered
  per browser, default "match this computer".
- The look is defined once (named colours + a few shared pieces), not as
  class strings repeated in each panel.

## Non-goals

- No other page changes in this build: not the Rooms board, kiosk,
  waiting-room TV, login page or public site. (The Rooms board gets
  this look next — separate design, separate pull request.)
- No change in behaviour, data, wording of messages, routes or API. No
  new counts, filters or sorting.
- No component library and no new dependency.

## Anti-goals (a failure even if it looks good)

- Any of the dashboard's existing behaviour rules regressing — see
  "Must not change".
- A status told apart by colour alone.
- The theme leaking onto another page, or the dashboard flashing the
  wrong theme while it loads.
- Text below WCAG AA contrast (4.5:1) in either theme.

## Approaches considered

**How the look is built**

1. *A component library* (shadcn/ui; MUI or Mantine). Rejected: the
   dashboard uses buttons, tabs, tables, cards, two dropdowns and date
   fields — nothing a library is needed for. shadcn/ui brings Radix,
   class-variance-authority and its own CSS-variable theme; MUI and
   Mantine bring a second styling system beside Tailwind. The problem is
   colour and hierarchy, not missing widgets.
2. *Restyle in place* (swap class strings in each panel). Rejected: the
   panels already repeat the same strings; two themes would double them.
3. **Named colours + a handful of shared pieces, in the dashboard's own
   folder.** Chosen. Smallest thing that defines the look once and makes
   a second theme a second set of values.

**Dark or light**

Calm dark only / light only / a switch. Chosen by Alex: **a switch**,
dashboard only. It costs a second set of colour values and a check of
every tab in both themes.

## Must not change

These are existing rules (CLAUDE.md); the refresh restyles around them.

- Tabs: Check-ins and Patients stay mounted when hidden; Setup and Log
  mount on first open; `?tab=`, `?spotify=…#music` and the `#music`
  scroll keep working; tab/panel ARIA roles and ids stay.
- Patient search: the no-match message sits below everything else; the
  "Searching…" hint is inside the box and appears only after 300 ms; the
  Search button never changes width; the reset confirmation names the
  patient; a row holds one decision at a time.
- Check-ins: a refresh never blanks the list; "Loading…" only for a new
  range; the numbers describe the whole range.
- Errors use one red.
- The small kiosk link in the bottom-right corner stays.
- Patient names never go into a request address; nothing new is logged.

## The design

### Colours

Every colour on the dashboard comes from these names. Values were
checked for contrast: all text pairs are ≥ 4.5:1 on the surfaces they
sit on, hover states included (primary text ≥ 11:1; white on the teal
button ≥ 4.6:1 at rest and on hover; the lowest pair is light text-3 on
the page, 4.76:1).

| name | used for | dark | light |
| --- | --- | --- | --- |
| page | page background | `#101619` | `#e6eae9` |
| panel | panels, top bar, inputs | `#1a2125` | `#ffffff` |
| panel-2 | table header, row hover, quiet fills | `#232c31` | `#f4f6f5` |
| well | sunken things: text fields, the track of a segmented control | `#131a1d` | `#f1f4f3` |
| line | hairlines, panel edge | `#2b363b` | `#dde3e1` |
| line-strong | input and button edge | `#3d4a51` | `#c3cdca` |
| text | main text | `#e4e7e6` | `#1b2529` |
| text-2 | secondary text | `#aab5b7` | `#4c5a5f` |
| text-3 | labels, hints | `#8a989b` | `#5a686e` |
| accent-fill | primary button, selected-tab line | `#1f8376` | `#1c7a6e` |
| accent-fill-hover | darker than the fill in both themes | `#1a7368` | `#17695f` |
| accent-text | teal text and icons | `#56c7b6` | `#17695f` |
| tab-accent | the line under the selected tab and its icon — taken from the theme's photo | `#e0895a` (the ridge's copper glow) | `#3b7a52` (forest green) |
| error | error text | `#ff7b72` | `#c22f2f` |
| error-fill | destructive button (white text) | `#c53a32` | `#c22f2f` |

Statuses (text colour / pill background):

| status | shape | dark | light |
| --- | --- | --- | --- |
| Waiting · n min | filled pill, dot | `#f2c261` / `#38382d` | `#7d5200` / `#faf0d6` |
| Next up · Room | filled pill, dot | `#bcaaf7` / `#343747` | `#5438c0` / `#eae7f7` |
| Called · Room | filled pill, dot | `#7fbaf3` / `#293844` | `#145c9f` / `#e3ebf3` |
| With doctor · Room | filled pill, dot | `#5fd0b8` / `#243a3a` | `#0e675b` / `#e0ebea` |
| Finished 2:14 PM | grey pill, check mark | text-2 / panel-2, line edge | same names |
| Removed | dashed outline, × | text-3, line-strong edge | same names |
| Not closed | solid outline, warning triangle | `#f59a7a` | `#ad3817` |

So: a visit still on the board is a coloured pill with a dot; a visit
that ended is grey with a mark; the one that needs someone's attention
after the fact (Not closed) is an orange outline with a warning mark.
The label text is always there.

Dark sits in the Rooms board's family (neutral, soft filled panels) but
is not required to match it value for value.

### Depth

Hard-edged, by Alex's decision: "raised surfaces … I want to have sharp
edges on, not the soft fall-off edges". **No blurred shadow anywhere on
the dashboard.** A raised thing has a solid ledge under it — a
box-shadow with zero blur, like the side of a key — and a 1px lighter
line along its top edge. Corners stay rounded (8px buttons, 12px
panels). Faces are solid colours, no gradients (which is also what lets
a theme change cross-fade). Exact values are in the mock-up's `:root`
blocks (`--lift-1`, `--lift-2`, `--lift-accent`, `--lift-danger`,
`--sunk`, `--btn`).

- **Raised, 2px ledge (lift-1)** — things you press: buttons, the thumb
  of a segmented control, the selected tab, dropdowns. Pressing one
  moves it down 2px and the ledge disappears, in 80 ms. The teal and red
  buttons have a ledge in a darker teal / red.
- **Raised, 3px ledge (lift-2)** — surfaces that hold work: the top
  bar, panels, the summary tiles, the Setup cards.
- **Sunken** — where you type or choose: text and date fields, the
  track of a segmented control. The well colour and a solid 2px inner
  line along the top.
- **Flat** — everything that is only read: status pills, tags, table
  rows, text. Never a ledge on these.

| | dark | light |
| --- | --- | --- |
| button face (`btn`) | `#2a343a` | `#ffffff` |
| ledge under buttons | `#05080a` | `#a9b6b2` |
| ledge under panels (see-through, so it reads over the photo) | `rgba(0, 0, 0, 0.72)` | `rgba(16, 28, 24, 0.32)` |
| top-edge line, buttons / panels | `#3b484f` / `#283237` | `#ffffff` / none |
| ledge under teal / red button | `#0b3a33` / `#6e1d19` | `#0f4b42` / `#7c1c1c` |
| inner line of sunken things | `#0a0f11` | `#dbe2df` |
| primary button face, hover | `#1f8376`, `#1a7368` | same |

This is the one place the dashboard uses box-shadow. The public site's
"zero box-shadow" house rule is about the public pages and is not
changed.

### Background photos

Two photographs from Alex, one per theme, fill the page behind
everything: misty green hills under a pale sky for light, a starlit
lake and a copper-lit ridge for dark. Alex's originals were saved in
`public/` as `dashboard-bg-light.jpg` (2400×1600) and
`dashboard-bg-dark.jpg` (3500×2333); the build replaces them with
web-sized `staff-bg-light.jpg` / `staff-bg-dark.jpg`.

- Fixed to the window, `cover`, centred; the page scrolls over it. Built
  as a fixed layer behind the content (not `background-attachment:
  fixed`, which iPad Safari does not honour). One layer per photo, so a
  theme change cross-fades them (420 ms).
- A thin wash of the page colour over the photo (18 %) calms it; the
  page colour itself shows while a photo loads or if it fails.
- **Nothing is read straight off the photo.** Every piece of text and
  every control sits on a surface: the top bar and panels are opaque.
  That is why the toolbars are panels, the summary groups carry no
  loose headings, and messages are banners (see Layout). No frosted
  glass, no see-through panels.
- The photo shows in the gaps between panels, in the margins beside the
  1280px column on a wide screen, and below short pages (Patients
  before a search).
- Serve them sized for the web: about 1920px wide and no more than
  ~350 KB each (the mock-up's copies are 1920×1280 JPEG at 284 KB and
  348 KB). Only the current theme's photo should hold up the first
  paint; the other may load after. They are same-origin files, so the
  CSP needs no change.
- The **tab accent** follows the photo: the 3px line under the selected
  tab, and that tab's icon, are forest green in light and copper in
  dark (`tab-accent` above), and cross-fade with the theme. Alex asked
  for this on the tab specifically; primary buttons, links and
  confirmations stay teal.

### Motion

Alex asked for "smooth transitions/animations between toggles (music
source, theme toggle, export dates, etc) as well as anywhere else you
think could use it". CSS transitions and keyframes only — no animation
library on the dashboard (GSAP stays a public-page tool).

Rules for all of it:
- Short: 80–280 ms, ease-out (`cubic-bezier(0.22, 1, 0.36, 1)` for
  anything that slides). It never delays what was pressed: the state
  changes at once and the animation follows.
- Nothing a person is about to press moves because of an animation.
  Results that change under the staff member's hands (patient search)
  fade only; they never slide or resize.
- `prefers-reduced-motion`: fades stay, sliding and resizing are
  dropped — the same rule as the waiting-room TV.
- Arrivals are CSS keyframes that start by themselves on mount, not a
  class flipped a frame later (the TV's lesson).

What animates:

| where | what happens |
| --- | --- |
| Every segmented control (date range, device kind, music source, theme) | the raised thumb slides to the chosen item, 240 ms; label colours cross-fade |
| Tabs | the raised tile slides to the chosen tab; the panel that appears rises 6px and fades in, 220 ms. A hidden panel just goes (it stays mounted) |
| Theme | every colour, border and ledge cross-fades over 280 ms, the two photos over 420 ms, the tab accent with them. Only while switching — a class on `<html>` for ~460 ms — so ordinary hovers are not slowed |
| Date range | "Custom" slides the two date fields open beside the switch (and shut again); when the new range's data arrives the summary and table fade up from 30 %. A minute-refresh of the same range animates nothing |
| Music source | the fields for the chosen source rise and fade in while the card's height glides to fit, 260 ms |
| Buttons | press: down 2px. Hover: edge and face colour, 140 ms |
| Status pills | when a refresh changes a visit's status the pill's colours cross-fade, 300 ms |
| Table rows | hover background, 120 ms |
| Patient search | result rows fade in (160 ms) — no movement; the reset confirmation and "Checked in" swap with a fade |
| "By practitioner" | opens and closes with a height glide |
| Refresh | the icon spins while loading (as now) |

Left still on purpose: the summary numbers (no counting up — a number
that is still moving cannot be read), error messages (they appear at
once), and anything during the first paint of the page.

### Theme switch

- A three-way control in the header: match this computer (default) /
  light / dark. Icons with accessible names.
- The choice is kept in that browser's `localStorage`
  (`rac-staff-theme`: `system` | `light` | `dark`), read and written
  inside try/catch; with storage unavailable the page behaves as
  "system" and the switch still works until reload.
- While the dashboard is mounted, `<html>` carries
  `data-staff-theme="light"` or `"dark"` (the resolved theme; "system" is
  resolved in script and follows the OS setting live). It is removed
  when the dashboard unmounts — the same pattern the kiosk uses for
  `html.kiosk-locked`. All dashboard colour variables and the body
  background are defined under that attribute, so no other page can be
  affected. `color-scheme` is set with it so date fields, dropdowns and
  scrollbars follow.
- No flash: the dashboard gets a `layout.tsx` whose inline script sets
  the attribute before first paint (the site CSP already allows inline
  scripts). Arriving by an in-app link, the dashboard sets it in a
  layout effect.
- The rule "stored choice + OS setting → theme" is a pure function in
  `src/lib/` with tests, like the project's other rules.
- Tailwind gets a `ui` colour group pointing at the variables
  (`bg-ui-panel`, `text-ui-text-2`, …) and shadow names for the ledges. No opacity modifiers on
  these — every tint is its own name.

### Shared pieces

In `src/app/admin/ui/`, with the colours in `src/app/admin/staff-theme.css`
— shared by the staff pages, because on 2026-11-22 Alex extended this
look to the Rooms board. The Rooms board is designed and built after the
dashboard as its own piece of work; this build does not touch it. The
names are therefore not dashboard names (`ui`, `staff-theme`), and the
theme choice is one per browser for both pages.

- **Button** — primary (teal), default (raised neutral), quiet (flat,
  no edge, no ledge — for Refresh and Sign out), danger (red); two sizes. 8px
  corners, never a pill. All but quiet are raised (lift-1).
- **Segmented** — one choice of several: date range, device kind, music
  source, theme. A sunken track with a raised thumb that slides to the
  chosen item. The thumb is one absolutely-positioned element sized and
  moved to the chosen button (measure it; re-measure without animation
  on resize, when fonts load, and when a hidden tab is shown). Items
  keep one font weight, selected or not, so nothing shifts as it moves.
  The tab row uses the same thumb.
- **Panel** — filled surface, hairline edge, 12px corners, raised on a
  3px hard ledge (lift-2).
- **StatusPill** — the table above. **Tag** — small grey rectangle-ish
  label for kinds of thing (PIN "Set", TV / Kiosk, the Log's "What").
- **Field** styles: text and date fields are sunken; a select is raised
  like a button (it opens when pressed); **table** styles: header row
  on panel-2 in small capitals, 11px row padding, hairline between
  rows, row hover, numbers right-aligned and tabular.
- **ThemeSwitch**.

### Layout

Page: a full-width top bar on the panel colour, content below at up to
1280px wide (today 1024px — the seven-column table needs the room).

Top bar: "Office Dashboard" on the left; on the right the signed-in
email, theme switch, "Rooms board" (default button) and "Sign out"
(quiet). Under them the four tabs, each icon + label; the selected one
is a raised tile in full-strength text with a 3px line in the
tab-accent colour along its bottom edge, and its icon in that colour. The bar itself is raised over the page (lift-2). Narrower
than the bar's contents, the right-hand group wraps under the title and
the tab row scrolls sideways; nothing is hidden behind a menu.

**Check-ins**
- Toolbar, itself a raised panel (so nothing sits on the photo): date
  range as a Segmented on the left (custom dates slide open beside it);
  Refresh (quiet) and Export CSV on the right.
- Summary: two groups of raised tiles side by side (stacked below
  ~860px), a wider gap between the groups, no group headings. Counts:
  Checked in / Waiting (amber dot) / In a room (teal dot) / Finished.
  Times: the three medians, each with today's wording under it
  ("typical of n · longest x", "no visits yet"). For a range other
  than Today: the Checked in tile, then the three time tiles (the same
  numbers as now, nothing added).
- The error line stays where it is, between the toolbar and the
  summary, as a flat banner: panel fill, error-coloured text and edge.
  "Loading…" and "No check-ins in this range." are centred inside the
  table's panel, so the panel does not come and go. The large-range
  caution sits inside a banner of the same kind in the caution colour.
- The large-range note and "By practitioner" (a collapsible panel) keep
  their places under the summary.
- Table in its own panel: time and appointment in secondary text,
  patient name semibold, service and practitioner secondary, the status
  pill, wait right-aligned. Footer row inside the panel: the count, or
  "Showing the most recent…" with Load more.

**Patients**
- A toolbar panel holding a large search field (17px text, search
  icon) with the primary Search button beside it. The no-match message
  and "Showing the N closest matches" are inside the results panel /
  a flat banner — not loose on the photo.
- Results in a panel: name semibold, email and phone secondary, PIN as a
  Tag ("Set") or hint text ("None"). Actions right-aligned and in a
  fixed order of weight: Log (text link), Reset PIN (default), Check in
  (primary). Confirm state: danger "Reset PIN for <name>" + Cancel.

**Setup**
- Three cards. Two columns when wide — Screens above Practice Better
  sync on the left, Waiting-room music (the tall one) on the right — and
  one column when narrow.
- Headings and every word of the existing instructions stay exactly as
  they are ("Screens", "Waiting-room music" with `id="music"`,
  "Practice Better sync"; the pairing steps and "Only enter a code shown
  on the clinic's own device." included). The TV and the kiosk tell
  staff to go to "Dashboard → Screens", so that name must not change.
  The instructions are set in secondary text under an icon heading.
- Their forms use Field, Segmented and Button; device and station lists
  are hairline-separated rows; kind of device is a Tag.

**Log**
- A toolbar panel: the two dropdowns and the "Only <name>" filter on
  the left, Refresh on the right. The intro sentence ("What staff did
  with patient information…") moves into the head of the table's
  panel, so it is not on the photo. "Only <name>" is a small
  rectangle (6px corners, accent-text edge and text, panel fill) with
  its × inside — it can be pressed away, so it is not a pill. Table in a panel: when and who
  secondary, what as a Tag, patients in main text, detail secondary.

### Messages

- Something went right ("Checked in · Rooms board", "Cleared — patient
  can set a new PIN at the kiosk", "Saved."): accent-text.
- A caution that is not an error ("This range is very large…", today
  gold): the Waiting status text colour.
- Errors: the error colour, as one red everywhere.

### Type

Inter Tight as now (already loaded). 15px base on the dashboard; 12px
small-capital labels; 28px for the summary numbers; tabular numbers for
every time and count.

## Left to the builder

- Whether a shared piece is a component or an exported class string.
- Exact spacing, breakpoints and icon choices (lucide-react is already
  installed), within what the mock-up shows.
- How the height glides are done (measured heights, as in the mock-up,
  or a grid-rows transition), so long as WebKit behaves the same.
- How MusicPanel's many states map onto the pieces — same rules, no
  behaviour change.
- Whether the pre-paint script lives in `layout.tsx` or `next/script`
  `beforeInteractive`, so long as there is no flash.

## Checking it

- `npm run lint`, `npm test`, `npm run build`.
- New tests: the theme rule; `staff-route.test.ts` and the other
  existing tests untouched and green.
- By eye, in Chromium and WebKit, both themes, at 1440×900 and
  1024×768: every tab, with the server simulated (no Supabase
  credentials exist on this machine — see the project's local
  verification notes). Include the states that only show sometimes:
  reset confirmation, "Checked in", an error, loading, empty, Custom
  dates, "Only <name>" in the Log.
- Photos: no text or control sits directly on the photo on any tab, in
  any state (empty search, loading, errors); the page is readable with
  the photos blocked; total image weight is within the budget above.
- Motion: each row of the Motion table once in each engine; then with
  reduced motion switched on (nothing slides, everything still works);
  and that no blurred shadow exists (search the dashboard's styles for a
  box-shadow with a blur radius).
- Open the Rooms board and the kiosk after visiting the dashboard in
  light: both must look exactly as before.

## Docs to update with the change

CLAUDE.md: the Tech Stack line "single dark theme (no light/dark
toggle)" gains the dashboard as its stated exception; "Errors on the
dashboard use one red" names the new colour; a short "Dashboard look"
section records the rectangle/pill rule, where the colours live and the
theme switch.
