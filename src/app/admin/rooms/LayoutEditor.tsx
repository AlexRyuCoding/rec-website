"use client";
import { useState } from "react";
import { Move, Trash2 } from "lucide-react";
import {
  GRID_COLS,
  MAX_DURATION_SECONDS,
  MIN_DURATION_SECONDS,
  RoomRow,
} from "@/lib/room-status";

interface PanelState {
  mode: "create" | "edit";
  room?: RoomRow;
  gridRow: number;
  gridCol: number;
}

export default function LayoutEditor({
  rooms,
  onCreate,
  onUpdate,
  onDelete,
}: {
  rooms: RoomRow[];
  onCreate: (input: {
    name: string;
    gridRow: number;
    gridCol: number;
    practitionerName?: string;
  }) => Promise<void>;
  onUpdate: (
    roomId: string,
    input: {
      name?: string;
      gridRow?: number;
      gridCol?: number;
      practitionerName?: string | null;
      defaultDurationSeconds?: number;
    }
  ) => Promise<void>;
  onDelete: (roomId: string) => Promise<void>;
}) {
  const [panel, setPanel] = useState<PanelState | null>(null);
  const [movingRoom, setMovingRoom] = useState<RoomRow | null>(null);
  const [name, setName] = useState("");
  const [practitioner, setPractitioner] = useState("");
  const [minutes, setMinutes] = useState(15);
  const [saving, setSaving] = useState(false);

  const maxRow = rooms.reduce((m, r) => Math.max(m, r.grid_row), 0);
  const rowCount = maxRow + 2;
  const byCell = new Map(rooms.map((r) => [`${r.grid_row}:${r.grid_col}`, r]));

  const openCreate = (gridRow: number, gridCol: number) => {
    setName("");
    setPractitioner("");
    setPanel({ mode: "create", gridRow, gridCol });
  };

  const openEdit = (room: RoomRow) => {
    setName(room.name);
    setPractitioner(room.practitioner_name ?? "");
    setMinutes(Math.round(room.default_duration_seconds / 60));
    setPanel({
      mode: "edit",
      room,
      gridRow: room.grid_row,
      gridCol: room.grid_col,
    });
  };

  const tapEmptyCell = async (gridRow: number, gridCol: number) => {
    if (movingRoom) {
      setSaving(true);
      await onUpdate(movingRoom.id, { gridRow, gridCol });
      setSaving(false);
      setMovingRoom(null);
      return;
    }
    openCreate(gridRow, gridCol);
  };

  const submitPanel = async () => {
    if (!panel || !name.trim()) return;
    setSaving(true);
    if (panel.mode === "create") {
      await onCreate({
        name: name.trim(),
        gridRow: panel.gridRow,
        gridCol: panel.gridCol,
        practitionerName: practitioner.trim() || undefined,
      });
    } else if (panel.room) {
      await onUpdate(panel.room.id, {
        name: name.trim(),
        practitionerName: practitioner.trim() || null,
        defaultDurationSeconds: Math.min(
          MAX_DURATION_SECONDS,
          Math.max(MIN_DURATION_SECONDS, minutes * 60)
        ),
      });
    }
    setSaving(false);
    setPanel(null);
  };

  return (
    <div className="mx-auto max-w-5xl">
      {movingRoom && (
        <p className="mb-3 rounded-lg bg-sky-900/60 px-4 py-2 text-sm">
          Moving &quot;{movingRoom.name}&quot; — tap an empty cell, or{" "}
          <button className="underline" onClick={() => setMovingRoom(null)}>
            cancel
          </button>
        </p>
      )}

      <div className="overflow-x-auto pb-2">
        <div
          className="grid gap-3"
          style={{
            gridTemplateColumns: `repeat(${GRID_COLS}, minmax(120px, 1fr))`,
          }}
        >
          {Array.from({ length: rowCount * GRID_COLS }, (_, i) => {
            const gridRow = Math.floor(i / GRID_COLS);
            const gridCol = i % GRID_COLS;
            const room = byCell.get(`${gridRow}:${gridCol}`);
            if (room) {
              return (
                <button
                  key={i}
                  disabled={saving}
                  onClick={() => openEdit(room)}
                  className={`min-h-24 rounded-2xl p-3 text-left ${
                    movingRoom?.id === room.id
                      ? "bg-sky-700 ring-2 ring-sky-300"
                      : "bg-neutral-700 hover:bg-neutral-600"
                  }`}
                >
                  <span className="block truncate font-medium">
                    {room.name}
                  </span>
                  {room.practitioner_name && (
                    <span className="block truncate text-xs text-white/60">
                      {room.practitioner_name}
                    </span>
                  )}
                </button>
              );
            }
            return (
              <button
                key={i}
                disabled={saving}
                aria-label={`Empty cell row ${gridRow + 1} column ${gridCol + 1}`}
                onClick={() => tapEmptyCell(gridRow, gridCol)}
                className="min-h-24 rounded-2xl border-2 border-dashed border-neutral-800 hover:border-neutral-600"
              />
            );
          })}
        </div>
      </div>

      {panel && (
        <div className="fixed inset-0 z-10 flex items-end justify-center bg-black/60 p-4 sm:items-center">
          <div className="w-full max-w-sm rounded-2xl bg-neutral-900 p-5">
            <h2 className="mb-4 text-lg font-semibold">
              {panel.mode === "create" ? "New room" : "Edit room"}
            </h2>
            <label className="mb-3 block text-sm">
              Name
              <input
                autoFocus
                value={name}
                maxLength={40}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-lg bg-neutral-800 px-3 py-2"
              />
            </label>
            <label className="mb-3 block text-sm">
              Practitioner (optional)
              <input
                value={practitioner}
                maxLength={60}
                onChange={(e) => setPractitioner(e.target.value)}
                className="mt-1 w-full rounded-lg bg-neutral-800 px-3 py-2"
              />
            </label>
            {panel.mode === "edit" && (
              <label className="mb-3 block text-sm">
                Default minutes
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={minutes}
                  onChange={(e) => setMinutes(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg bg-neutral-800 px-3 py-2"
                />
              </label>
            )}
            <div className="mt-4 flex items-center gap-2">
              <button
                disabled={saving || !name.trim()}
                onClick={submitPanel}
                className="rounded-lg bg-white px-4 py-2 font-medium text-neutral-900 disabled:opacity-40"
              >
                Save
              </button>
              <button
                onClick={() => setPanel(null)}
                className="rounded-lg bg-white/10 px-4 py-2"
              >
                Cancel
              </button>
              {panel.mode === "edit" && panel.room && (
                <>
                  <button
                    aria-label="Move room"
                    onClick={() => {
                      setMovingRoom(panel.room!);
                      setPanel(null);
                    }}
                    className="ml-auto rounded-lg bg-white/10 p-2.5"
                  >
                    <Move className="h-4 w-4" />
                  </button>
                  <button
                    aria-label="Delete room"
                    disabled={saving}
                    onClick={async () => {
                      setSaving(true);
                      await onDelete(panel.room!.id);
                      setSaving(false);
                      setPanel(null);
                    }}
                    className="rounded-lg bg-rose-900/70 p-2.5"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
