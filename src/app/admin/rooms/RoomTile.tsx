"use client";
import { useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Stethoscope,
} from "lucide-react";
import {
  ADJUST_STEP_SECONDS,
  doctorColorClasses,
  DoctorRow,
  formatTimerDisplay,
  RoomRow,
  RoomState,
  TimerAction,
} from "@/lib/room-status";

const STATUS_STYLES: Record<
  RoomState["status"],
  { card: string; label: string }
> = {
  available: { card: "bg-emerald-700", label: "Available" },
  in_use: { card: "bg-sky-800", label: "In Use" },
  complete: { card: "bg-amber-600", label: "Remove Needles" },
  overtime: { card: "bg-rose-700", label: "Overtime" },
};

export default function RoomTile({
  room,
  state,
  busy,
  nowMs,
  doctors,
  onAction,
  onAssignDoctor,
}: {
  room: RoomRow;
  state: RoomState;
  busy: boolean;
  nowMs: number;
  doctors: DoctorRow[];
  onAction: (action: TimerAction, valueSeconds?: number) => void;
  onAssignDoctor: (doctorName: string | null) => void;
}) {
  const [editingTime, setEditingTime] = useState(false);
  const [minutesInput, setMinutesInput] = useState("");
  const [doctorListOpen, setDoctorListOpen] = useState(false);
  const style = STATUS_STYLES[state.status];
  const displaySeconds =
    state.remainingSeconds ?? room.default_duration_seconds;
  const sessionActive = state.status !== "available";
  const timeUp = state.status === "complete" || state.status === "overtime";
  // Time's up: flash the label, alternating each second between the room
  // name and the instruction. The page rerenders every second (nowMs
  // ticks), so no local timer is needed.
  const label = timeUp
    ? Math.floor(nowMs / 1000) % 2 === 0
      ? `${room.name} done`
      : "Remove needles"
    : state.paused
      ? "Paused"
      : style.label;

  const openTimeEditor = () => {
    if (busy) return;
    setMinutesInput(String(Math.max(1, Math.round(displaySeconds / 60))));
    setEditingTime(true);
  };

  const commitTime = () => {
    setEditingTime(false);
    const minutes = Math.min(60, Math.max(1, Number(minutesInput)));
    if (!Number.isFinite(minutes)) return;
    onAction("set", Math.round(minutes) * 60);
  };

  const assignDoctor = (name: string | null) => {
    setDoctorListOpen(false);
    if (name !== room.doctor_name) onAssignDoctor(name);
  };

  return (
    <div
      className={`${style.card} relative flex h-full flex-col items-center justify-between overflow-hidden rounded-2xl p-3 pb-0 text-center text-white shadow-lg transition-colors duration-500 select-none`}
    >
      <div className="w-full min-w-0">
        <h2 className="truncate text-base font-semibold">{room.name}</h2>
        {room.doctor_name && (
          <span
            className={`inline-block max-w-full truncate rounded-full px-2 py-0.5 text-xs font-semibold ${doctorColorClasses(
              doctors.find((d) => d.name === room.doctor_name)?.color
            )}`}
          >
            {room.doctor_name}
          </span>
        )}
      </div>

      <div className="flex w-full items-center justify-center gap-1.5">
        <button
          aria-label="Less time"
          disabled={busy}
          onClick={() => onAction("adjust", -ADJUST_STEP_SECONDS)}
          className="shrink-0 rounded-full bg-white/15 p-1.5 hover:bg-white/25 disabled:opacity-40"
        >
          <Minus className="h-4 w-4" />
        </button>
        {editingTime ? (
          <input
            autoFocus
            type="number"
            min={1}
            max={60}
            value={minutesInput}
            onChange={(e) => setMinutesInput(e.target.value)}
            onBlur={commitTime}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitTime();
              if (e.key === "Escape") setEditingTime(false);
            }}
            aria-label="Minutes"
            className="w-20 rounded-lg bg-white/15 px-1 py-0.5 text-center text-2xl font-bold tabular-nums outline-none ring-2 ring-white/40 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
        ) : (
          <button
            aria-label="Type a time in minutes"
            disabled={busy}
            onClick={openTimeEditor}
            className={`rounded-lg px-1 text-3xl font-bold tabular-nums hover:bg-white/10 disabled:opacity-70 ${
              state.paused ? "animate-pulse" : ""
            }`}
          >
            {formatTimerDisplay(displaySeconds)}
          </button>
        )}
        <button
          aria-label="More time"
          disabled={busy}
          onClick={() => onAction("adjust", ADJUST_STEP_SECONDS)}
          className="shrink-0 rounded-full bg-white/15 p-1.5 hover:bg-white/25 disabled:opacity-40"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      <div className="flex w-full items-center justify-center gap-1.5">
        {state.status === "available" && (
          <button
            disabled={busy}
            onClick={() => onAction("start")}
            className="flex items-center gap-1.5 rounded-xl bg-white/20 px-3 py-1.5 text-sm font-medium hover:bg-white/30 disabled:opacity-40"
          >
            <Play className="h-4 w-4" /> Start
          </button>
        )}
        {state.status === "in_use" && (
          <button
            disabled={busy}
            onClick={() => onAction(state.paused ? "resume" : "pause")}
            className="flex items-center gap-1.5 rounded-xl bg-white/20 px-3 py-1.5 text-sm font-medium hover:bg-white/30 disabled:opacity-40"
          >
            {state.paused ? (
              <>
                <Play className="h-4 w-4" /> Resume
              </>
            ) : (
              <>
                <Pause className="h-4 w-4" /> Pause
              </>
            )}
          </button>
        )}
        {sessionActive && (
          <>
            <button
              aria-label="Reset timer"
              disabled={busy}
              onClick={() => onAction("reset")}
              className="rounded-xl bg-white/15 p-2 hover:bg-white/25 disabled:opacity-40"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
            <button
              aria-label="Clear room"
              disabled={busy}
              onClick={() => onAction("clear")}
              className="rounded-xl bg-white/90 p-2 text-emerald-700 hover:bg-white disabled:opacity-40"
            >
              <Check className="h-4 w-4" />
            </button>
          </>
        )}
      </div>

      <p
        className={`w-full truncate text-[11px] font-semibold uppercase tracking-widest ${
          timeUp ? "text-white" : "text-white/80"
        }`}
      >
        {label}
      </p>

      {/* Pull tab: assign a doctor from the roster without entering edit
          mode. Expands a panel over the tile listing the roster + None. */}
      <button
        aria-label={doctorListOpen ? "Close doctor list" : "Assign doctor"}
        aria-expanded={doctorListOpen}
        disabled={busy}
        onClick={() => setDoctorListOpen((v) => !v)}
        className="mt-1 flex w-full items-center justify-center gap-1 rounded-t-lg bg-black/20 py-0.5 text-white/70 hover:bg-black/30 hover:text-white disabled:opacity-40"
      >
        {doctorListOpen ? (
          <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronUp className="h-3.5 w-3.5" />
        )}
      </button>

      {doctorListOpen && (
        <div className="absolute inset-0 z-10 flex flex-col overflow-hidden rounded-2xl bg-neutral-900/95 p-2">
          <p className="mb-1 flex items-center justify-center gap-1 text-[11px] font-semibold uppercase tracking-widest text-white/60">
            <Stethoscope className="h-3.5 w-3.5" /> Doctor
          </p>
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
            {doctors.length === 0 ? (
              <p className="px-1 py-2 text-xs text-white/60">
                No doctors yet — add them in Edit layout.
              </p>
            ) : (
              <>
                {doctors.map((doctor) => (
                  <button
                    key={doctor.id}
                    onClick={() => assignDoctor(doctor.name)}
                    className={`w-full truncate rounded-lg px-2 py-1.5 text-sm font-medium ${doctorColorClasses(
                      doctor.color
                    )} ${
                      doctor.name === room.doctor_name
                        ? "ring-2 ring-white"
                        : "opacity-85 hover:opacity-100"
                    }`}
                  >
                    {doctor.name}
                  </button>
                ))}
                <button
                  onClick={() => assignDoctor(null)}
                  className={`w-full truncate rounded-lg px-2 py-1.5 text-sm ${
                    room.doctor_name === null
                      ? "bg-white/90 font-medium text-neutral-900"
                      : "bg-white/10 hover:bg-white/20"
                  }`}
                >
                  None
                </button>
              </>
            )}
          </div>
          <button
            aria-label="Close doctor list"
            onClick={() => setDoctorListOpen(false)}
            className="mt-1 flex w-full items-center justify-center rounded-lg bg-white/10 py-0.5 text-white/70 hover:bg-white/20"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
