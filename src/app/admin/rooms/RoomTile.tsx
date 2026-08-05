"use client";
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
  onAction: (action: TimerAction, deltaSeconds?: number) => void;
}) {
  const style = STATUS_STYLES[state.status];
  const displaySeconds =
    state.remainingSeconds ?? room.default_duration_seconds;
  const sessionActive = state.status !== "available";

  return (
    <div
      className={`${style.card} rounded-2xl p-4 text-white shadow-lg transition-colors duration-500 flex flex-col gap-3 select-none`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold truncate">{room.name}</h2>
        {room.practitioner_name && (
          <span className="text-xs text-white/70 truncate">
            {room.practitioner_name}
          </span>
        )}
      </div>

      <div className="flex items-center justify-center gap-3">
        <button
          aria-label="Less time"
          disabled={busy}
          onClick={() => onAction("adjust", -ADJUST_STEP_SECONDS)}
          className="rounded-full bg-white/15 p-2 hover:bg-white/25 disabled:opacity-40"
        >
          <Minus className="h-5 w-5" />
        </button>
        <span
          className={`text-4xl font-bold tabular-nums ${
            state.paused ? "animate-pulse" : ""
          }`}
        >
          {formatTimerDisplay(displaySeconds)}
        </span>
        <button
          aria-label="More time"
          disabled={busy}
          onClick={() => onAction("adjust", ADJUST_STEP_SECONDS)}
          className="rounded-full bg-white/15 p-2 hover:bg-white/25 disabled:opacity-40"
        >
          <Plus className="h-5 w-5" />
        </button>
      </div>

      <div className="flex items-center justify-center gap-2">
        {state.status === "available" && (
          <button
            disabled={busy}
            onClick={() => onAction("start")}
            className="flex items-center gap-1.5 rounded-xl bg-white/20 px-4 py-2 font-medium hover:bg-white/30 disabled:opacity-40"
          >
            <Play className="h-4 w-4" /> Start
          </button>
        )}
        {state.status === "in_use" && (
          <button
            disabled={busy}
            onClick={() => onAction(state.paused ? "resume" : "pause")}
            className="flex items-center gap-1.5 rounded-xl bg-white/20 px-4 py-2 font-medium hover:bg-white/30 disabled:opacity-40"
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
              className="rounded-xl bg-white/15 p-2.5 hover:bg-white/25 disabled:opacity-40"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
            <button
              aria-label="Clear room"
              disabled={busy}
              onClick={() => onAction("clear")}
              className="rounded-xl bg-white/90 p-2.5 text-emerald-700 hover:bg-white disabled:opacity-40"
            >
              <Check className="h-5 w-5" />
            </button>
          </>
        )}
      </div>

      <p className="text-center text-xs font-semibold uppercase tracking-widest text-white/80">
        {state.paused ? "Paused" : style.label}
      </p>
    </div>
  );
}
