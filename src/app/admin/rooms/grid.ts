import type { CSSProperties } from "react";
import { GRID_COLS } from "@/lib/room-status";

// Single source of truth for the board's grid geometry. The live view and
// the layout editor must render identical cell sizes and track counts so
// the layout staff arrange in edit mode is exactly what the live board
// shows — including empty rows, which need an explicit track height or
// CSS collapses them and rooms drift upward.
export const CELL_MIN_WIDTH_PX = 190;
// Tall enough for a room with patients, their service, a line behind it
// and finger-sized buttons, all at once (RoomTile.tsx).
// Not a pixel more than that needs: two rows of rooms and the doctor
// alert have to fit a 10-inch tablet held sideways.
export const CELL_HEIGHT_PX = 238;

export const gridStyle: CSSProperties = {
  gridTemplateColumns: `repeat(${GRID_COLS}, minmax(${CELL_MIN_WIDTH_PX}px, 1fr))`,
  gridAutoRows: `${CELL_HEIGHT_PX}px`,
};
