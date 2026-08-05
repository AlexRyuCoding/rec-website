"use client";
import { useState } from "react";
import { Check, Minus, Pause, Play, Plus, RotateCcw } from "lucide-react";
import {
  ADJUST_STEP_SECONDS,
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
  onAction,
}: {
  room: RoomRow;
  state: RoomState;
  busy: boolean;
  onAction: (action: TimerAction, valueSeconds?: number) => void;
}) {
  const [editingTime, setEditingTime] = useState(false);
  const [minutesInput, setMinutesInput] = useState("");
  const style = STATUS_STYLES[state.status];
  const displaySeconds =
    state.remainingSeconds ?? room.default_duration_seconds;
  const sessionActive = state.status !== "available";

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

  return (
    <div
      className={`${style.card} flex h-full flex-col items-center justify-between overflow-hidden rounded-2xl p-3 text-center text-white shadow-lg transition-colors duration-500 select-none`}
    >
      <div className="w-full min-w-0">
        <h2 className="truncate text-base font-semibold">{room.name}</h2>
        {room.practitioner_name && (
          <p className="truncate text-xs text-white/70">
            {room.practitioner_name}
          </p>
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

      <p className="w-full truncate text-[11px] font-semibold uppercase tracking-widest text-white/80">
        {state.paused ? "Paused" : style.label}
      </p>
    </div>
  );
}
