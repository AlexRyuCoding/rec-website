import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

// Guards for the staff look on the rooms board
// (docs/superpowers/specs/2026-11-22-rooms-board-refresh-design.md).
// The board is in two parts with opposite rules:
// - the FRAME (top bar, waiting list, panels, layout editor) follows the
//   light/dark theme, so it may only use the named ui-* colours;
// - a room TILE never follows the theme — its solid status colour is the
//   signal read from across the room — so nothing on it may use them.
// And nowhere on the board is there a blurred shadow.

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
  ...readdirSync(join(ROOMS, "tile")).map((name) => `tile/${name}`),
];
const read = (file: string) => readFileSync(join(ROOMS, file), "utf8");
const linesMatching = (file: string, pattern: RegExp) =>
  read(file)
    .split("\n")
    .filter((line) => pattern.test(line))
    .map((line) => line.trim());

// The layers of a box-shadow value whose blur radius is not zero. In a
// Tailwind arbitrary value the parts are joined by underscores.
function blurredLayers(value: string): string[] {
  const layers: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of value.replace(/_/g, " ")) {
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

describe("the rooms board's look", () => {
  it("has no blurred shadow anywhere", () => {
    const files = [...FRAME, ...TILE, "WaitingBanner.tsx"];
    for (const file of files) {
      expect(
        linesMatching(file, /\bshadow-(sm|md|lg|xl|2xl|black)\b/),
        file
      ).toEqual([]);
      for (const m of read(file).matchAll(/shadow-\[([^\]]+)\]/g)) {
        expect(blurredLayers(m[1]), `${file}: ${m[1]}`).toEqual([]);
      }
    }
  });

  it("the frame uses the theme's named colours", () => {
    const old = /\b(bg-neutral-|text-neutral-|text-white\b|bg-white\b)/;
    for (const file of FRAME) {
      expect(linesMatching(file, old), file).toEqual([]);
    }
  });

  it("a tile never follows the theme", () => {
    expect(TILE.length).toBeGreaterThan(4);
    for (const file of TILE) {
      expect(linesMatching(file, /\bui-/), file).toEqual([]);
    }
  });
});
