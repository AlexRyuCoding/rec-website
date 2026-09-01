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
import { Plus, Trash2, X } from "lucide-react";
import {
  doctorColorClasses,
  DoctorRow,
  DOCTOR_NAME_MAX_LENGTH,
  GRID_COLS,
  MAX_DOCTORS,
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
  doctorColor,
  disabled,
  onEdit,
}: {
  room: RoomRow;
  doctorColor: string | null | undefined;
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
      {room.doctor_name && (
        <span
          className={`inline-block max-w-full truncate rounded-full px-2 py-0.5 text-xs font-semibold ${doctorColorClasses(
            doctorColor
          )}`}
        >
          {room.doctor_name}
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
  doctors,
  onCreate,
  onUpdate,
  onDelete,
  onAddDoctor,
  onDeleteDoctor,
}: {
  rooms: RoomRow[];
  doctors: DoctorRow[];
  onCreate: (input: {
    name: string;
    gridRow: number;
    gridCol: number;
  }) => Promise<void>;
  onUpdate: (
    roomId: string,
    input: {
      name?: string;
      gridRow?: number;
      gridCol?: number;
      defaultDurationSeconds?: number;
    }
  ) => Promise<void>;
  onDelete: (roomId: string) => Promise<void>;
  onAddDoctor: (name: string) => Promise<void>;
  onDeleteDoctor: (doctorId: string) => Promise<void>;
}) {
  const [panel, setPanel] = useState<PanelState | null>(null);
  const [name, setName] = useState("");
  const [minutes, setMinutes] = useState(15);
  const [doctorInput, setDoctorInput] = useState("");
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
    setPanel({ mode: "create", cell });
  };

  const openEdit = (room: RoomRow) => {
    setName(room.name);
    setMinutes(Math.round(room.default_duration_seconds / 60));
    setPanel({ mode: "edit", room });
  };

  const submitDoctor = async () => {
    const doctorName = doctorInput.trim();
    if (!doctorName || saving) return;
    setSaving(true);
    await onAddDoctor(doctorName);
    setSaving(false);
    setDoctorInput("");
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
      });
    } else if (panel.room) {
      await onUpdate(panel.room.id, {
        name: name.trim(),
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

      <section className="mb-4 rounded-2xl bg-neutral-900 p-4">
        <h2 className="mb-1 text-sm font-semibold">Doctors</h2>
        <p className="mb-3 text-xs text-white/50">
          Assign a doctor to a room from its pull tab on the timer board.
          Removing a doctor here un-assigns them everywhere.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {doctors.map((doctor) => (
            <span
              key={doctor.id}
              className={`flex items-center gap-1.5 rounded-full py-1 pl-3 pr-1.5 text-sm font-medium ${doctorColorClasses(
                doctor.color
              )}`}
            >
              <span className="max-w-40 truncate">{doctor.name}</span>
              <button
                aria-label={`Remove ${doctor.name}`}
                disabled={saving}
                onClick={async () => {
                  setSaving(true);
                  await onDeleteDoctor(doctor.id);
                  setSaving(false);
                }}
                className="rounded-full bg-black/10 p-1 hover:bg-black/25 disabled:opacity-40"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          {doctors.length < MAX_DOCTORS ? (
            <span className="flex items-center gap-1.5">
              <input
                value={doctorInput}
                maxLength={DOCTOR_NAME_MAX_LENGTH}
                placeholder="Add doctor"
                onChange={(e) => setDoctorInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitDoctor();
                }}
                className="w-36 rounded-lg bg-neutral-800 px-3 py-1.5 text-sm"
              />
              <button
                aria-label="Add doctor"
                disabled={saving || !doctorInput.trim()}
                onClick={submitDoctor}
                className="rounded-lg bg-white/10 p-2 hover:bg-white/20 disabled:opacity-40"
              >
                <Plus className="h-4 w-4" />
              </button>
            </span>
          ) : (
            <span className="text-xs text-white/50">
              List is full (max {MAX_DOCTORS}).
            </span>
          )}
        </div>
      </section>

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
                    doctorColor={
                      doctors.find((d) => d.name === room.doctor_name)?.color
                    }
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
