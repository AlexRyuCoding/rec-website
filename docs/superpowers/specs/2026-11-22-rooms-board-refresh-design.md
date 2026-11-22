# Rooms board refresh — design

Date: 2026-11-22. Scope: `/admin/rooms` only. Builds on
`2026-11-21-dashboard-refresh-design.md` (the staff look: named colours,
theme switch, hard ledges, photos, motion rules) — read that first.

Mock-up Alex approved ("rooms board approved", 2026-11-22):
https://claude.ai/artifact/4aUeDmjaaeyP5wh2AFuS2E (private to Alex);
source beside this file, `2026-11-22-rooms-board-refresh-mockup.html`.

## Why

Alex approved the dashboard's new look and asked for the same on the
Rooms board, so the two staff pages are one design.

## What changes

The board's **frame** takes the staff look and follows the theme:

- The photo behind the page; an opaque top bar (back to the dashboard,
  "Rooms", Reconnecting hint, theme switch, Sounds, Edit layout).
- The waiting list, Expected, Finished, Sounds and the layout editor
  become raised panels with the shared buttons, fields and text colours.
- Waiting names are raised keys (they are pressed: name, then room).
  Long waits keep amber and red. The picked name is outlined in the
  tab-accent colour (today it turns white, which would vanish on a light
  panel).
- Messages are banners: the action error, "Tap to turn on alert
  sounds".
- Every shadow is a hard ledge. The amber "sounds are silent" bar keeps
  its place, colour and wording; its soft glow becomes a hard top edge.

## What does not change

- **Room tiles keep their solid status colours, identical in both
  themes** (Available green, Patient waiting purple, With doctor dark
  indigo, Setting Up slate, In Use blue, Remove Needles amber, Overtime
  red). They are the signal read across the room; one set, never
  re-learned. Everything inside a tile is theme-independent: white
  text, the doctor pill colours, the dark overlays (doctor list, patient
  menu, the "Together with…?" question, "Room 5 changed").
- Tiles gain a 4px hard ledge in a darker shade of their own colour, and
  their buttons become keys (hard 2px ledge, press down 2px). The main
  action on a tile stays the solid white key.
- The doctor alert banner keeps the doctor's colour, its place, its
  "Doctor in" button, the red long-wait outline; it gains a ledge.
- Geometry: `grid.ts` (238px tiles, 190px minimum width), the 40×40
  press targets, the 1024px column. Two rows of rooms plus one doctor
  alert must still fit a 1080×810 tablet.
- Every flow, privacy and timing rule of the board (CLAUDE.md, "Patient
  room flow"): the 350 ms / 2.5 s press guards, two-tap Reset and
  Remove, drag with a mouse only, the fixed silent-sounds bar.
- Sounds.

## Theme on the board

One choice per browser, shared with the dashboard (same storage key).
With nothing chosen, the dashboard follows the computer but **the board
stays dark**: wall iPads set to automatic appearance would otherwise
change the board's look at sunset by themselves. Anyone can pick Light,
Dark or "Match this tablet" on the board's switch; that choice then
applies to both pages on that device.

## Motion on the board

Nothing slides or resizes (the theme switch's own thumb aside). Allowed:
a tile's colour cross-fades when its status changes (300 ms), keys press
down, the theme cross-fades. The waiting list reflows exactly as it does
today — no entry or exit animation is added.

## Approaches considered

1. *Tiles become neutral panels with a coloured status pill, like the
   dashboard's rows.* Rejected: the board is read from across a room; a
   full-colour tile is the signal, a pill is not.
2. *Restyle everything, tiles included, per theme.* Rejected: two sets
   of status colours to learn, and alert colours that must be re-proven
   on two backgrounds.
3. **Theme the frame, leave the tiles as theme-independent objects with
   ledges.** Chosen — shown in the mock-up and approved.

## Checking it

As the dashboard: lint, tests, build; Chromium and WebKit, both themes,
with the server simulated, at 1080×810 and 1366×1024. Plus: the bottom
edge of the second row of tiles is no lower than on `main` in the same
state; every press target still ≥ 40×40; every board state once (each
tile status, a doctor alert, a long wait, a picked name with its target
tiles, the join question, Edit layout, the three panels, the silent
bar). **A real iPad check by Alex before merging** — the wall tablets
have never been simulated faithfully.

## Left to the builder

Exact ledge shades, how the in-tile key styles are shared between the
tile files, and whether the board's top bar reuses the dashboard's
markup or a small shared `TopBar` piece.
