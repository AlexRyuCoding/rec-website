import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { lookProblems } from "../look-guard";

// Guards for the staff look on the rooms board
// (docs/superpowers/specs/2026-11-22-rooms-board-refresh-design.md).
// The board is in two parts with opposite rules:
// - the FRAME (top bar, waiting list, panels, layout editor) follows the
//   light/dark theme, so its colours are the theme's ui-* names — a
//   one-theme colour like text-white vanishes on a light panel;
// - a room TILE never follows the theme — its solid status colour is the
//   signal read from across the room — so nothing on it may use them.
// And nowhere on the board is there a blurred shadow.
// The detector, and what counts as a colour: ../look-guard.ts.

const ROOMS = __dirname;
const FRAME = [
  "page.tsx",
  "WaitingList.tsx",
  "ExpectedPanel.tsx",
  "FinishedPanel.tsx",
  "SoundsPanel.tsx",
  "LayoutEditor.tsx",
];
const TILE = [
  "RoomTile.tsx",
  "WaitingBanner.tsx",
  ...readdirSync(join(ROOMS, "tile")).map((name) => `tile/${name}`),
];
const read = (file: string) => readFileSync(join(ROOMS, file), "utf8");

// Colours in the frame that are NOT the theme's, each a decision. They
// are signals that must look the same in both themes, or sit on a
// surface that is itself the same in both.
const FRAME_SIGNALS: Record<string, (string | RegExp)[]> = {
  // The "alert sounds are silent" bar: amber in both themes.
  "page.tsx": ["bg-amber-300", "text-amber-950"],
  // A waiting name kept waiting: amber from 10 minutes, red from 20 — a
  // signal like a tile's colour — with its edge, its picked ring, the
  // "First visit" badge on each fill, and the darkening under the ×.
  "WaitingList.tsx": [
    "bg-[#fcd34d]",
    "bg-[#e11d48]",
    "ring-[#b7860b]",
    "ring-[#9f1239]",
    "ring-amber-950",
    "text-amber-950",
    "bg-amber-950",
    "text-amber-300",
    "bg-amber-300",
    "text-rose-700",
    "hover:bg-black/10",
  ],
  "ExpectedPanel.tsx": [],
  "FinishedPanel.tsx": [],
  "SoundsPanel.tsx": [],
  // The × on a doctor's name sits on that doctor's own (literal) colour;
  // the dialog's scrim darkens the page in either theme.
  "LayoutEditor.tsx": ["bg-black/10", "hover:bg-black/25", "bg-black/60"],
};

describe("the rooms board's look", () => {
  it.each(FRAME)(
    "%s: the frame uses the theme's colours and hard ledges",
    (file) => {
      expect(
        lookProblems(read(file), {
          allow: FRAME_SIGNALS[file],
          hardLedges: true,
        })
      ).toEqual([]);
    }
  );

  it.each(TILE)("%s: a tile has no soft shadow", (file) => {
    // Tiles carry literal colours by design; only the shadow rules apply.
    // One exception: the "send here?" veil over a tile softens what is
    // behind it (a backdrop blur, not a shadow) — as it always has.
    const soft = lookProblems(read(file), {
      hardLedges: true,
      allow: ["backdrop-blur-[2px]"],
    }).filter((cls) =>
      /(^|:)(shadow|drop-shadow|blur|backdrop-blur)/.test(cls)
    );
    expect(soft).toEqual([]);
  });

  it.each(TILE)("%s: a tile never follows the theme", (file) => {
    const themed = read(file)
      .split(/[\s"'`]+/)
      .filter((cls) => /(^|[:-])ui-[a-z]/.test(cls));
    expect(themed).toEqual([]);
  });
});
