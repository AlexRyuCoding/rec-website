"use client";
import { useState } from "react";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { Plus, Trash2 } from "lucide-react";
import {
  GRID_COLS,
  MAX_DURATION_SECONDS,
  MIN_DURATION_SECONDS,
  RoomRow,
} from "@/lib/room-status";
import { gridStyle } from "./grid";

interface PanelState {
  mode: "create" | "edit";
  room?: RoomRow;
  // Cell preselected by clicking an empty slot; absent when using the
  // Create room button (first free cell is used at save time).
  cell?: { gridRow: number; gridCol: number };
}

// Rooms are dragged; empty cells are drop targets. A small pointer
// threshold keeps plain clicks (open the edit panel) distinct from drags.
function DraggableRoom({
  room,
  disabled,
  onEdit,
}: {
  room: RoomRow;
  disabled: boolean;
  onEdit: (room: RoomRow) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: room.id, disabled });
  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      disabled={disabled}
      onClick={() => onEdit(room)}
      style={
        transform
          ? {
              transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
            }
          : undefined
      }
      className={`relative flex h-full w-full touch-none flex-col items-center justify-center gap-1 rounded-2xl bg-neutral-700 p-3 text-center hover:bg-neutral-600 ${
        isDragging ? "z-10 opacity-80 ring-2 ring-sky-300" : ""
      }`}
    >
      <span className="w-full truncate font-medium">{room.name}</span>
      {room.practitioner_name && (
        <span className="w-full truncate text-xs text-white/60">
          {room.practitioner_name}
        </span>
      )}
    </button>
  );
}

function DroppableCell({
  gridRow,
  gridCol,
  disabled,
  onClick,
}: {
  gridRow: number;
  gridCol: number;
  disabled: boolean;
  onClick: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `cell-${gridRow}-${gridCol}`,
  });
  return (
    <button
      ref={setNodeRef}
      disabled={disabled}
      onClick={onClick}
      aria-label={`Empty cell row ${gridRow + 1} column ${gridCol + 1}`}
      className={`h-full w-full rounded-2xl border-2 border-dashed ${
        isOver
          ? "border-sky-400 bg-sky-950/40"
          : "border-neutral-800 hover:border-neutral-600"
      }`}
    />
  );
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
  const [name, setName] = useState("");
  const [practitioner, setPractitioner] = useState("");
  const [minutes, setMinutes] = useState(15);
  const [saving, setSaving] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const maxRow = rooms.reduce((m, r) => Math.max(m, r.grid_row), 0);
  const rowCount = maxRow + 2;
  const byCell = new Map(rooms.map((r) => [`${r.grid_row}:${r.grid_col}`, r]));

  const firstFreeCell = () => {
    for (let gridRow = 0; gridRow < rowCount; gridRow++) {
      for (let gridCol = 0; gridCol < GRID_COLS; gridCol++) {
        if (!byCell.has(`${gridRow}:${gridCol}`)) return { gridRow, gridCol };
      }
    }
    return { gridRow: rowCount, gridCol: 0 };
  };

  const openCreate = (cell?: { gridRow: number; gridCol: number }) => {
    setName("");
    setPractitioner("");
    setPanel({ mode: "create", cell });
  };

  const openEdit = (room: RoomRow) => {
    setName(room.name);
    setPractitioner(room.practitioner_name ?? "");
    setMinutes(Math.round(room.default_duration_seconds / 60));
    setPanel({ mode: "edit", room });
  };

  const onDragEnd = async (event: DragEndEvent) => {
    const match = /^cell-(\d+)-(\d+)$/.exec(String(event.over?.id ?? ""));
    if (!match || saving) return;
    setSaving(true);
    await onUpdate(String(event.active.id), {
      gridRow: Number(match[1]),
      gridCol: Number(match[2]),
    });
    setSaving(false);
  };

  const submitPanel = async () => {
    if (!panel || !name.trim()) return;
    setSaving(true);
    if (panel.mode === "create") {
      const cell = panel.cell ?? firstFreeCell();
      await onCreate({
        name: name.trim(),
        gridRow: cell.gridRow,
        gridCol: cell.gridCol,
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
      <div className="mb-4 flex items-center gap-3">
        <button
          disabled={saving}
          onClick={() => openCreate()}
          className="flex items-center gap-1.5 rounded-lg bg-white px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-white/90 disabled:opacity-40"
        >
          <Plus className="h-4 w-4" /> Create room
        </button>
        <p className="text-xs text-white/50">
          Drag rooms into position. Click a room to edit it.
        </p>
      </div>

      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="overflow-x-auto pb-2">
          <div className="grid gap-3" style={gridStyle}>
            {Array.from({ length: rowCount * GRID_COLS }, (_, i) => {
              const gridRow = Math.floor(i / GRID_COLS);
              const gridCol = i % GRID_COLS;
              const room = byCell.get(`${gridRow}:${gridCol}`);
              if (room) {
                return (
                  <DraggableRoom
                    key={room.id}
                    room={room}
                    disabled={saving}
                    onEdit={openEdit}
                  />
                );
              }
              return (
                <DroppableCell
                  key={`empty-${i}`}
                  gridRow={gridRow}
                  gridCol={gridCol}
                  disabled={saving}
                  onClick={() => openCreate({ gridRow, gridCol })}
                />
              );
            })}
          </div>
        </div>
      </DndContext>

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
                <button
                  aria-label="Delete room"
                  disabled={saving}
                  onClick={async () => {
                    setSaving(true);
                    await onDelete(panel.room!.id);
                    setSaving(false);
                    setPanel(null);
                  }}
                  className="ml-auto rounded-lg bg-rose-900/70 p-2.5"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
