import type { CSSProperties } from "react";
import { GRID_COLS } from "@/lib/room-status";

// Single source of truth for the board's grid geometry. The live view and
// the layout editor must render identical cell sizes and track counts so
// the layout staff arrange in edit mode is exactly what the live board
// shows — including empty rows, which need an explicit track height or
// CSS collapses them and rooms drift upward.
export const CELL_MIN_WIDTH_PX = 190;
export const CELL_HEIGHT_PX = 200;

export const gridStyle: CSSProperties = {
  gridTemplateColumns: `repeat(${GRID_COLS}, minmax(${CELL_MIN_WIDTH_PX}px, 1fr))`,
  gridAutoRows: `${CELL_HEIGHT_PX}px`,
};
