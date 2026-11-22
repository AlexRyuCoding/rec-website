"use client";
import { useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";
import {
  ADJUST_STEP_SECONDS,
  formatTimerDisplay,
  TimerAction,
  typedMinutesToSeconds,
} from "@/lib/room-status";

// The tile's time, with − and + beside it. Tapping the time opens a box
// to type minutes into.
//
// With no timer running this edits the room's default — on a free room,
// and equally while Setting Up, where it is the length of the session
// "Another session" would start.
export default function TimeControl({
  displaySeconds,
  busy,
  paused,
  adjustPending,
  compact,
  onAction,
}: {
  displaySeconds: number;
  busy: boolean;
  paused: boolean;
  // +/- taps not yet confirmed by the server; the time is shown dimmed.
  adjustPending: boolean;
  // Setting Up: the two-line buttons below need the height.
  compact: boolean;
  onAction: (action: TimerAction, valueSeconds?: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [minutesInput, setMinutesInput] = useState("");
  // What the box showed when it opened, and whether it has been closed
  // already (Enter and Escape close it; the box going away can then still
  // report a "blur", which must not count as a second answer).
  const openedMinutesRef = useRef("");
  const closedRef = useRef(true);

  const open = () => {
    if (busy) return;
    const shown = String(Math.max(1, Math.round(displaySeconds / 60)));
    openedMinutesRef.current = shown;
    closedRef.current = false;
    setMinutesInput(shown);
    setEditing(true);
  };

  // Enter sets the number in the box. Leaving the box sets it only if it
  // was changed: a tap elsewhere must never move a timer by itself (see
  // typedMinutesToSeconds). Escape sets nothing.
  const close = (how: "enter" | "leave" | "cancel") => {
    if (closedRef.current) return;
    closedRef.current = true;
    setEditing(false);
    if (how === "cancel") return;
    const seconds = typedMinutesToSeconds(
      minutesInput,
      openedMinutesRef.current,
      how
    );
    if (seconds !== null) onAction("set", seconds);
  };

  // A full finger's width each: these are pressed without looking.
  const stepButton =
    "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15 hover:bg-white/25 disabled:opacity-40";
  const time = formatTimerDisplay(displaySeconds);

  return (
    <div className="flex w-full items-center justify-center gap-1">
      <button
        aria-label="Less time"
        disabled={busy}
        onClick={() => onAction("adjust", -ADJUST_STEP_SECONDS)}
        className={stepButton}
      >
        <Minus className="h-5 w-5" />
      </button>
      {editing ? (
        <input
          autoFocus
          type="number"
          inputMode="numeric"
          min={1}
          max={60}
          value={minutesInput}
          onChange={(e) => setMinutesInput(e.target.value)}
          onFocus={(e) => e.target.select()}
          onBlur={() => close("leave")}
          onKeyDown={(e) => {
            if (e.key === "Enter") close("enter");
            if (e.key === "Escape") close("cancel");
          }}
          aria-label="Minutes"
          className="h-10 w-[4.5rem] rounded-lg bg-white/15 px-1 text-center text-2xl font-bold tabular-nums outline-none ring-2 ring-white/40 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
      ) : (
        <button
          aria-label="Type a time in minutes"
          disabled={busy}
          onClick={open}
          // Past zero the time grows a "+" and a digit; one size down
          // keeps it between the buttons.
          className={`h-10 min-w-0 rounded-lg px-0.5 font-bold tabular-nums ${
            compact || time.length > 5 ? "text-2xl" : "text-[1.75rem]"
          } transition-opacity duration-200 hover:bg-white/10 disabled:opacity-70 ${
            paused ? "animate-pulse" : ""
          } ${adjustPending ? "opacity-50" : ""}`}
        >
          {time}
        </button>
      )}
      <button
        aria-label="More time"
        disabled={busy}
        onClick={() => onAction("adjust", ADJUST_STEP_SECONDS)}
        className={stepButton}
      >
        <Plus className="h-5 w-5" />
      </button>
    </div>
  );
}
