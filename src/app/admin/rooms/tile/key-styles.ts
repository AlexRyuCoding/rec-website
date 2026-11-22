import type { RoomState } from "@/lib/room-status";

// How the buttons on a room tile, and the tile itself, are raised — the
// staff look's hard ledge (CLAUDE.md, "Staff look"), in the tile's own
// terms.
//
// A room tile does NOT follow the light/dark theme. Its solid status
// colour is the signal staff read from across the room, so the tile and
// everything on it look the same whichever theme the board is in: white
// text, translucent-white keys, a ledge in a darker shade of the tile's
// own colour. Nothing in this file (or in the tile's files) may use a
// theme colour name — rooms-look.test.ts checks.
//
// Ledges are shadows on purpose: they add no height and move nothing, so
// the tile's geometry (grid.ts) and every press target stay exactly as
// they were. Never turn one into a border or a margin.

// The ledge under a key and its press: down 2px onto the ledge. Not when
// disabled, and without the movement for people who asked for less motion.
export const tilePress =
  "shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_2px_0_rgba(0,0,0,0.38)] transition-[transform,box-shadow,background-color] duration-100 [&:not(:disabled)]:active:translate-y-[2px] [&:not(:disabled)]:active:shadow-none motion-reduce:active:translate-y-0";

// An ordinary key on a tile.
export const tileKey = `bg-white/20 hover:bg-white/30 ${tilePress}`;

// The key for the tile's main action (Doctor in, Room ready, Needles
// out): solid white. The caller adds the text colour.
export const tileKeySolid = `bg-white/90 hover:bg-white ${tilePress}`;

// The tile's own ledge: 4px in a darker shade of its status colour
// (RoomTile's STATUS_STYLES), with a light line along the top edge.
export const TILE_LEDGE: Record<RoomState["status"], string> = {
  available: "shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_4px_0_#034a35]",
  patient_waiting:
    "shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_4px_0_#4a1280]",
  with_doctor: "shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_4px_0_#0b0a22]",
  turnover: "shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_4px_0_#29323f]",
  in_use: "shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_4px_0_#04334d]",
  complete: "shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_4px_0_#8a4803]",
  overtime: "shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_4px_0_#770a25]",
};
