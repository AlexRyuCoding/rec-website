"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { gsap, useGSAP } from "@/lib/gsap";
import { Check, ChevronDown, ChevronUp, Play, RotateCcw } from "lucide-react";
import {
  doctorColorClasses,
  DoctorRow,
  formatTimerDisplay,
  RoomRow,
  RoomState,
  TimerAction,
} from "@/lib/room-status";
import { AssignOutcome, CALL_DISPLAY_MS, VisitView } from "@/lib/patient-flow";
import DoctorPanel from "./tile/DoctorPanel";
import JoinQuestionOverlay, { TileQuestion } from "./tile/JoinQuestionOverlay";
import PatientMenu, { ARMED_MS } from "./tile/PatientMenu";
import TimeControl from "./tile/TimeControl";
import { visitNote } from "./tile/visit-note";

export type { TileQuestion };

// One room on the board. This file is the tile's face — name, doctor,
// who is in it, the time, the buttons for its current status. What opens
// over it lives in ./tile: the doctor list, a patient's menu, the
// "together?" question, and the time with its − / + (TimeControl).
//
// Sizes: everything pressed without looking — − / +, Start, Pause, ✓,
// Reset — is at least 40 px, a finger's width, and the status line is
// large enough to read from across the room. The tile's height (grid.ts)
// is set so all of it fits when a room has patients, a line and a
// service to show.

const ASSIGN_LABELS: Record<AssignOutcome, string> = {
  send: "Send here",
  next_up: "Next up here",
  // No promise here: what happens depends on the answer the tap asks for.
  ask_join_room: "Together or next up…",
  ask_join_line: "Join the line…",
  full: "Full",
};

const STATUS_STYLES: Record<
  RoomState["status"],
  { card: string; label: string }
> = {
  available: { card: "bg-emerald-700", label: "Available" },
  patient_waiting: { card: "bg-purple-700", label: "Patient waiting" },
  // Deliberately calm and dark next to the loud purple of "Patient
  // waiting": the doctor is there, nothing needs attention.
  with_doctor: { card: "bg-indigo-950", label: "With doctor" },
  turnover: { card: "bg-slate-600", label: "Setting Up" },
  in_use: { card: "bg-sky-800", label: "In Use" },
  complete: { card: "bg-amber-600", label: "Remove Needles" },
  overtime: { card: "bg-rose-700", label: "Overtime" },
};

// A button in the tile's action row.
const actionButton =
  "flex min-h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-2.5 text-sm font-medium disabled:opacity-40";
const iconButton =
  "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl disabled:opacity-40";

export default function RoomTile({
  room,
  state,
  busy,
  adjustPending,
  nowMs,
  doctors,
  occupants,
  longWait,
  nextUp,
  assignMode,
  question,
  changed,
  onAction,
  onAssignDoctor,
  onAssignHere,
  onAnswer,
  onCancelQuestion,
  onVisitAction,
  onDoctorIn,
}: {
  room: RoomRow;
  state: RoomState;
  busy: boolean;
  // +/- taps not yet confirmed by the server; the time is shown dimmed.
  adjustPending: boolean;
  nowMs: number;
  doctors: DoctorRow[];
  // Patients called to or being treated in this room, and those lined up
  // behind it (called automatically once the room is ready).
  occupants: VisitView[];
  // A patient here has waited five minutes for the doctor: the tile is
  // outlined and says so.
  longWait: boolean;
  nextUp: VisitView[];
  // Set while staff have a waiting patient selected: what tapping this
  // tile would do with them. Null = normal board.
  assignMode: AssignOutcome | null;
  // Set while this tile is asking whether the selected patient is
  // together with the people here. Takes the place of the assign target.
  question: TileQuestion | null;
  // This tile's question just closed by itself because the room changed
  // on another board. For a moment the tile only says so and takes no
  // presses — a tap aimed at the vanished "Yes" must land on nothing.
  changed: boolean;
  onAction: (action: TimerAction, valueSeconds?: number) => void;
  onAssignDoctor: (doctorName: string | null) => void;
  onAssignHere: () => void;
  // true = "yes, together with the people named"; false = "no, next up".
  onAnswer: (together: boolean) => void;
  onCancelQuestion: () => void;
  onVisitAction: (
    visitId: string,
    action: "unassign" | "remove" | "mark_waiting"
  ) => void;
  // The doctor has walked in: ends the "patient waiting" alert.
  onDoctorIn: () => void;
}) {
  const [doctorListOpen, setDoctorListOpen] = useState(false);
  // The patient whose name was tapped (opens the move/remove menu).
  const [menuVisitId, setMenuVisitId] = useState<string | null>(null);
  const menuVisit =
    [...occupants, ...nextUp].find((v) => v.id === menuVisitId) ?? null;
  // Reset throws away a running timer and sits beside ✓, the button
  // pressed all day. It takes two taps — the first arms it, the second
  // does it — and an armed Reset disarms itself. (The other two-tap
  // action, "Remove", is in the patient menu.)
  const [resetArmed, setResetArmed] = useState(false);
  useEffect(() => {
    if (!resetArmed) return;
    const t = setTimeout(() => setResetArmed(false), ARMED_MS);
    return () => clearTimeout(t);
  }, [resetArmed]);
  // A reset can only be confirmed while the timer it was armed for runs.
  const timerRunning = room.timer_started_at !== null;
  useEffect(() => {
    if (!timerRunning) setResetArmed(false);
  }, [timerRunning]);
  // The nametag pill morphs through a ball on every assignment change:
  // collapse showing the old value, swap color/text at the smallest point,
  // expand to fit the new one. displayedDoctor is the lagging value that
  // drives what the pill shows; room.doctor_name is the target.
  const [displayedDoctor, setDisplayedDoctor] = useState(room.doctor_name);
  const pillRef = useRef<HTMLButtonElement>(null);
  const pillTextRef = useRef<HTMLSpanElement>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  // The whole tile is where a waiting chip dragged with the mouse can be
  // dropped (page.tsx decides what the drop does). The ref callback is
  // memoised: the board rerenders every second, and a new callback each
  // time would make dnd-kit forget and re-measure the tile each time.
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: room.id });
  const setRootRef = useCallback(
    (node: HTMLDivElement | null) => {
      rootRef.current = node;
      setDropRef(node);
    },
    [setDropRef]
  );

  // Tapping anywhere outside this tile dismisses the doctor list and the
  // patient menu, so an abandoned panel doesn't sit open on the board.
  const panelOpen = doctorListOpen || menuVisitId !== null;
  useEffect(() => {
    if (!panelOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setDoctorListOpen(false);
        setMenuVisitId(null);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [panelOpen]);

  const style = STATUS_STYLES[state.status];
  const displaySeconds =
    state.remainingSeconds ?? room.default_duration_seconds;
  const sessionActive = state.remainingSeconds !== null;
  const turningOver = state.status === "turnover";
  // How long the patient has been waiting for the doctor: since the
  // earliest call nobody has answered by starting the timer.
  const waitingSinceMs = occupants
    .filter((v) => v.seen_at === null && v.called_at !== null)
    .reduce<number | null>((min, v) => {
      const t = Date.parse(v.called_at!);
      return min === null || t < min ? t : min;
    }, null);
  const timeUp = state.status === "complete" || state.status === "overtime";
  // Time's up: flash the label, alternating each second between the room
  // name and the instruction. The page rerenders every second (nowMs
  // ticks), so no local timer is needed.
  const label = resetArmed
    ? "Tap again to reset"
    : timeUp
      ? Math.floor(nowMs / 1000) % 2 === 0
        ? `${room.name} done`
        : "Remove needles"
      : state.paused
        ? "Paused"
        : state.status === "patient_waiting" && waitingSinceMs !== null
          ? // "Waiting", not "Patient waiting": at this size the full
            // words would push the minutes — the news — off the tile.
            `${longWait ? "Long wait" : "Waiting"} ${formatTimerDisplay(
              Math.max(0, Math.floor((nowMs - waitingSinceMs) / 1000))
            )}`
          : style.label;
  // A patient told to come in after the timer was already running (a late
  // partner in a shared room) is marked while they are on their way.
  const arriving = (v: VisitView) =>
    v.seen_at === null &&
    v.called_at !== null &&
    nowMs - Date.parse(v.called_at) < CALL_DISPLAY_MS;
  // "First visit · Fire cupping", one entry per patient in the room.
  const notes = occupants.map(visitNote).filter(Boolean);

  const assignDoctor = (name: string | null) => {
    setDoctorListOpen(false);
    if (name !== room.doctor_name) onAssignDoctor(name);
  };

  // Phase 1 of the morph: the assignment changed (locally or via
  // broadcast), so fade the text and shrink the pill to a ball, then let
  // displayedDoctor catch up — that re-render swaps color and text while
  // the pill is at its smallest.
  useGSAP(
    () => {
      const pill = pillRef.current;
      if (!pill || room.doctor_name === displayedDoctor) return;
      gsap.killTweensOf([pill, pillTextRef.current]);
      gsap
        .timeline()
        .to(pillTextRef.current, { opacity: 0, duration: 0.12 })
        .to(
          pill,
          {
            width: pill.offsetHeight,
            opacity: 0.6,
            duration: 0.2,
            ease: "house",
          },
          "<"
        )
        .call(() => setDisplayedDoctor(room.doctor_name));
    },
    { dependencies: [room.doctor_name, displayedDoctor] }
  );

  // Phase 2: displayedDoctor just caught up mid-morph (the pill still has
  // an inline width from phase 1 — absent on a fresh mount, which must not
  // animate). Measure the new natural width, expand to it, fade text in.
  useGSAP(
    () => {
      const pill = pillRef.current;
      if (!pill || !pill.style.width) return;
      const ballWidth = pill.offsetWidth;
      gsap.set(pill, { width: "auto" });
      const targetWidth = pill.offsetWidth;
      gsap.set(pill, { width: ballWidth });
      gsap
        .timeline()
        .to(pill, {
          width: targetWidth,
          opacity: 1,
          duration: 0.25,
          ease: "house",
        })
        .to(pillTextRef.current, { opacity: 1, duration: 0.15 }, "-=0.1")
        .set(pill, { clearProps: "width" });
    },
    { dependencies: [displayedDoctor] }
  );

  return (
    <div
      ref={setRootRef}
      data-room-tile={room.name}
      className={`${style.card} ${
        longWait ? "ring-4 ring-inset ring-rose-400" : ""
      } relative flex h-full flex-col items-center justify-between overflow-hidden rounded-2xl px-2.5 pt-2 text-center text-white shadow-lg transition-colors duration-500 select-none`}
    >
      <div className="w-full min-w-0">
        <h2 className="truncate text-base font-semibold leading-5">
          {room.name}
        </h2>
        <button
          ref={pillRef}
          aria-label={doctorListOpen ? "Close doctor list" : "Choose doctor"}
          aria-expanded={doctorListOpen}
          disabled={busy}
          onClick={() => setDoctorListOpen((v) => !v)}
          className={`inline-flex min-h-[26px] max-w-full items-center overflow-hidden whitespace-nowrap rounded-full px-2.5 text-xs font-semibold disabled:opacity-70 ${
            displayedDoctor
              ? doctorColorClasses(
                  doctors.find((d) => d.name === displayedDoctor)?.color
                )
              : "bg-white/15 text-white/60 hover:bg-white/25"
          }`}
        >
          <span ref={pillTextRef} className="truncate">
            {displayedDoctor ?? "No doctor"}
          </span>
        </button>
        {occupants.length > 0 && (
          // One line however many share the room: each name gives up
          // width equally and truncates; the tap menu shows it in full.
          <p className="flex min-w-0 items-center justify-center gap-x-1 text-sm font-semibold leading-tight">
            {occupants.map((visit, i) => (
              <span key={visit.id} className="flex min-w-0 items-center">
                {i > 0 && <span className="mr-1 text-white/50">·</span>}
                <button
                  aria-label={`Options for ${visit.display_name}`}
                  onClick={() => setMenuVisitId(visit.id)}
                  className="flex min-h-[26px] min-w-0 items-center gap-1 rounded px-1 hover:bg-white/15"
                >
                  {arriving(visit) && sessionActive && (
                    <span className="inline-block h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-white" />
                  )}
                  <span className="truncate">{visit.display_name}</span>
                </button>
              </span>
            ))}
          </p>
        )}
        {notes.length > 0 && (
          // What the visit is, for the doctor about to walk in. Cut off
          // if long; the patient's menu has it in full.
          <p
            data-visit-notes
            className="truncate text-[11px] leading-[14px] text-white/75"
          >
            {notes.join("  ·  ")}
          </p>
        )}
        {nextUp.length > 0 && (
          <p className="truncate text-xs leading-tight text-white/75">
            Next:{" "}
            {nextUp.map((visit, i) => (
              <span key={visit.id}>
                {i > 0 && ", "}
                <button
                  aria-label={`Options for ${visit.display_name}`}
                  onClick={() => setMenuVisitId(visit.id)}
                  className="min-h-[18px] rounded px-0.5 hover:bg-white/15"
                >
                  {visit.display_name}
                </button>
              </span>
            ))}
          </p>
        )}
      </div>

      <TimeControl
        displaySeconds={displaySeconds}
        busy={busy}
        paused={state.paused}
        adjustPending={adjustPending}
        compact={turningOver}
        onAction={onAction}
      />

      {turningOver ? (
        // Needles are out, or the next session is being set up: the
        // patient is still in the room, so nobody is called in until
        // staff say the room is empty. The doctor walking out to run
        // one more session (fire cupping is two in a row) starts it here
        // instead; that finishes nobody and calls nobody.
        // Side by side on two lines each: stacked full-width buttons do
        // not fit the tile's fixed height once names and a line are shown
        // (the status label below gets squeezed out).
        <div className="grid w-full grid-cols-2 gap-2">
          <button
            disabled={busy}
            onClick={() => onAction("again")}
            className="min-h-11 rounded-xl bg-white/20 px-1 text-sm font-medium leading-tight hover:bg-white/30 disabled:opacity-40"
          >
            Another
            <br />
            session
          </button>
          <button
            disabled={busy}
            onClick={() => onAction("ready")}
            className="min-h-11 rounded-xl bg-white/90 px-1 text-sm font-semibold leading-tight text-slate-800 hover:bg-white disabled:opacity-40"
          >
            Room
            <br />
            ready
          </button>
        </div>
      ) : (
        <div className="flex w-full items-center justify-center gap-2">
          {state.status === "patient_waiting" && (
            <button
              disabled={busy}
              onClick={onDoctorIn}
              className={`${actionButton} bg-white/90 font-semibold text-purple-800 hover:bg-white`}
            >
              Doctor in
            </button>
          )}
          {(state.status === "available" ||
            state.status === "patient_waiting" ||
            state.status === "with_doctor") && (
            <button
              disabled={busy}
              onClick={() => onAction("start")}
              className={`${actionButton} bg-white/20 hover:bg-white/30`}
            >
              <Play className="h-4 w-4" /> Start
            </button>
          )}
          {state.status === "in_use" && (
            // Words only: with the icon as well, the three buttons of a
            // running room do not fit side by side at a finger's width.
            <button
              disabled={busy}
              onClick={() => onAction(state.paused ? "resume" : "pause")}
              className={`${actionButton} bg-white/20 px-3 hover:bg-white/30`}
            >
              {state.paused ? "Resume" : "Pause"}
            </button>
          )}
          {sessionActive && (
            <>
              <button
                aria-label={
                  resetArmed ? "Confirm: cancel this timer" : "Reset timer"
                }
                disabled={busy}
                onClick={() => {
                  if (resetArmed) {
                    setResetArmed(false);
                    onAction("reset");
                  } else {
                    setResetArmed(true);
                  }
                }}
                className={`${iconButton} ${
                  resetArmed
                    ? "bg-rose-600 ring-2 ring-white"
                    : "bg-white/15 hover:bg-white/25"
                }`}
              >
                <RotateCcw className="h-5 w-5" />
              </button>
              {/* Time's up: this is THE button — the alarm stops when it
                  is pressed — so it takes the rest of the row. */}
              <button
                aria-label="Clear room"
                disabled={busy}
                onClick={() => onAction("clear")}
                className={
                  timeUp
                    ? `${actionButton} min-h-11 flex-1 bg-white/90 font-semibold text-emerald-800 hover:bg-white`
                    : `${iconButton} bg-white/90 text-emerald-700 hover:bg-white`
                }
              >
                <Check className="h-5 w-5" />
                {timeUp && "Needles out"}
              </button>
            </>
          )}
        </div>
      )}

      <p
        data-status-label
        className={`w-full truncate text-[13px] font-bold uppercase leading-[18px] tracking-wide ${
          timeUp ? "text-white" : "text-white/85"
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
        className="flex h-6 w-full shrink-0 items-center justify-center rounded-t-lg bg-black/20 text-white/70 hover:bg-black/30 hover:text-white disabled:opacity-40"
      >
        {doctorListOpen ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronUp className="h-4 w-4" />
        )}
      </button>

      {doctorListOpen && (
        <DoctorPanel
          doctors={doctors}
          current={room.doctor_name}
          onPick={assignDoctor}
          onClose={() => setDoctorListOpen(false)}
        />
      )}

      {menuVisit && (
        <PatientMenu
          visit={menuVisit}
          canMarkWaiting={
            menuVisit.seen_at !== null && !sessionActive && !turningOver
          }
          onAction={(action) => {
            setMenuVisitId(null);
            onVisitAction(menuVisit.id, action);
          }}
          onClose={() => setMenuVisitId(null)}
        />
      )}

      {changed && (
        // Not a button, and it keeps the selection: there is nothing here
        // to press, by design.
        <div
          data-assign-keep
          role="status"
          className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-1 rounded-2xl bg-neutral-900/95 p-3 ring-2 ring-inset ring-amber-300/80"
        >
          <p className="text-sm font-semibold leading-tight">
            {room.name} changed — choose again
          </p>
        </div>
      )}

      {question && !changed && (
        <JoinQuestionOverlay
          question={question}
          roomName={room.name}
          busy={busy}
          onAnswer={onAnswer}
          onCancel={onCancelQuestion}
        />
      )}

      {assignMode && !question && !changed && (
        <button
          data-assign-keep
          disabled={assignMode === "full" || busy}
          onClick={onAssignHere}
          className={`absolute inset-0 z-20 flex flex-col items-center justify-center gap-1 rounded-2xl text-white ring-inset backdrop-blur-[2px] transition-[background-color,box-shadow] duration-150 disabled:ring-white/15 ${
            // A dragged chip is over this tile: light it up, so it is
            // plain which room the patient lands in on release.
            isOver && assignMode !== "full" && !busy
              ? "bg-neutral-950/55 ring-4 ring-white"
              : "bg-neutral-950/85 ring-2 ring-white/70 hover:bg-neutral-950/70 disabled:hover:bg-neutral-950/85"
          }`}
        >
          <span className="text-xs font-medium text-white/70">{room.name}</span>
          <span
            className={`text-lg font-semibold ${
              assignMode === "full" ? "text-white/40" : ""
            }`}
          >
            {ASSIGN_LABELS[assignMode]}
          </span>
        </button>
      )}
    </div>
  );
}
