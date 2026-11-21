"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { gsap, useGSAP } from "@/lib/gsap";
import {
  Check,
  ChevronDown,
  ChevronUp,
  DoorOpen,
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
import {
  AssignOutcome,
  CALL_DISPLAY_MS,
  JoinQuestion,
  VisitView,
} from "@/lib/patient-flow";
import { createTapGuard, SCREEN_CHANGE_GUARD_MS } from "@/lib/tap-guard";

// "Together with Alex R.?" — shown over the tile before a patient is put
// in a room that has someone in it, or behind people already lined up.
export interface TileQuestion {
  // The patient being placed, and the people they would join.
  patientName: string;
  companionNames: string[];
  kind: JoinQuestion["kind"];
}

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
  turnover: { card: "bg-slate-600", label: "Turning over" },
  in_use: { card: "bg-sky-800", label: "In Use" },
  complete: { card: "bg-amber-600", label: "Remove Needles" },
  overtime: { card: "bg-rose-700", label: "Overtime" },
};

export default function RoomTile({
  room,
  state,
  busy,
  adjustPending,
  nowMs,
  doctors,
  occupants,
  nextUp,
  assignMode,
  question,
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
  nextUp: VisitView[];
  // Set while staff have a waiting patient selected: what tapping this
  // tile would do with them. Null = normal board.
  assignMode: AssignOutcome | null;
  // Set while this tile is asking whether the selected patient is
  // together with the people here. Takes the place of the assign target.
  question: TileQuestion | null;
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
  const [editingTime, setEditingTime] = useState(false);
  const [minutesInput, setMinutesInput] = useState("");
  const [doctorListOpen, setDoctorListOpen] = useState(false);
  // The patient whose name was tapped (opens the move/remove menu).
  const [menuVisitId, setMenuVisitId] = useState<string | null>(null);
  const menuVisit =
    [...occupants, ...nextUp].find((v) => v.id === menuVisitId) ?? null;
  // The nametag pill morphs through a ball on every assignment change:
  // collapse showing the old value, swap color/text at the smallest point,
  // expand to fit the new one. displayedDoctor is the lagging value that
  // drives what the pill shows; room.doctor_name is the target.
  const [displayedDoctor, setDisplayedDoctor] = useState(room.doctor_name);
  const pillRef = useRef<HTMLButtonElement>(null);
  const pillTextRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
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

  // The question appears right where the tile was just tapped, with
  // "Yes" under the same finger. A double tap must not answer it: for a
  // moment after it opens, its buttons ignore presses (the kiosk's rule).
  const questionGuard = useRef(createTapGuard()).current;
  const questionOpen = question !== null;
  useEffect(() => {
    if (questionOpen) questionGuard.block(SCREEN_CHANGE_GUARD_MS);
  }, [questionOpen, questionGuard]);
  const answer = (together: boolean) => {
    if (!questionGuard.blocked()) onAnswer(together);
  };

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
  const label = timeUp
    ? Math.floor(nowMs / 1000) % 2 === 0
      ? `${room.name} done`
      : "Remove needles"
    : state.paused
      ? "Paused"
      : state.status === "patient_waiting" && waitingSinceMs !== null
        ? `Patient waiting ${formatTimerDisplay(
            Math.max(0, Math.floor((nowMs - waitingSinceMs) / 1000))
          )}`
        : style.label;
  // A patient told to come in after the timer was already running (a late
  // partner in a shared room) is marked while they are on their way.
  const arriving = (v: VisitView) =>
    v.seen_at === null &&
    v.called_at !== null &&
    nowMs - Date.parse(v.called_at) < CALL_DISPLAY_MS;

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

  // Doctor list entrance: the panel emerges from the pull tab at the
  // bottom edge, options following with a slight stagger. Closing is
  // intentionally instant.
  useGSAP(
    () => {
      if (!doctorListOpen || !panelRef.current) return;
      gsap.from(panelRef.current, {
        opacity: 0,
        y: 10,
        scaleY: 0.92,
        transformOrigin: "bottom center",
        duration: 0.25,
        ease: "house",
      });
      gsap.from(panelRef.current.querySelectorAll("[data-doctor-option]"), {
        opacity: 0,
        y: 6,
        duration: 0.2,
        ease: "house",
        stagger: 0.03,
        delay: 0.05,
      });
    },
    { dependencies: [doctorListOpen] }
  );

  return (
    <div
      ref={setRootRef}
      className={`${style.card} relative flex h-full flex-col items-center justify-between overflow-hidden rounded-2xl p-3 pb-0 text-center text-white shadow-lg transition-colors duration-500 select-none`}
    >
      <div className="w-full min-w-0">
        <h2 className="truncate text-base font-semibold">{room.name}</h2>
        <button
          ref={pillRef}
          aria-label={doctorListOpen ? "Close doctor list" : "Choose doctor"}
          aria-expanded={doctorListOpen}
          disabled={busy}
          onClick={() => setDoctorListOpen((v) => !v)}
          className={`inline-flex max-w-full items-center overflow-hidden whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold disabled:opacity-70 ${
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
          <p className="mt-0.5 flex min-w-0 items-center justify-center gap-x-1 text-xs font-semibold leading-tight">
            {occupants.map((visit, i) => (
              <span key={visit.id} className="flex min-w-0 items-center">
                {i > 0 && <span className="mr-1 text-white/50">·</span>}
                <button
                  aria-label={`Options for ${visit.display_name}`}
                  onClick={() => setMenuVisitId(visit.id)}
                  className="flex min-w-0 items-center gap-1 rounded px-0.5 hover:bg-white/15"
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
        {nextUp.length > 0 && (
          <p className="truncate text-[11px] leading-tight text-white/75">
            Next:{" "}
            {nextUp.map((visit, i) => (
              <span key={visit.id}>
                {i > 0 && ", "}
                <button
                  aria-label={`Options for ${visit.display_name}`}
                  onClick={() => setMenuVisitId(visit.id)}
                  className="rounded px-0.5 hover:bg-white/15"
                >
                  {visit.display_name}
                </button>
              </span>
            ))}
          </p>
        )}
      </div>

      {turningOver ? (
        // Needles are out but the patient is still getting ready: nobody
        // is called in until staff confirm the room is empty.
        <button
          disabled={busy}
          onClick={() => onAction("ready")}
          className="flex items-center gap-2 rounded-xl bg-white/90 px-4 py-3 text-base font-semibold text-slate-800 hover:bg-white disabled:opacity-40"
        >
          <DoorOpen className="h-5 w-5" /> Room ready
        </button>
      ) : (
        <>
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
                className={`rounded-lg px-1 text-3xl font-bold tabular-nums transition-opacity duration-200 hover:bg-white/10 disabled:opacity-70 ${
                  state.paused ? "animate-pulse" : ""
                } ${adjustPending ? "opacity-50" : ""}`}
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
            {state.status === "patient_waiting" && (
              <button
                disabled={busy}
                onClick={onDoctorIn}
                className="whitespace-nowrap rounded-xl bg-white/90 px-2.5 py-1.5 text-sm font-semibold text-purple-800 hover:bg-white disabled:opacity-40"
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
                className="flex items-center gap-1.5 whitespace-nowrap rounded-xl bg-white/20 px-2.5 py-1.5 text-sm font-medium hover:bg-white/30 disabled:opacity-40"
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
        </>
      )}

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
        <div
          ref={panelRef}
          className="absolute inset-0 z-10 flex flex-col overflow-hidden rounded-2xl bg-neutral-900/95 p-2"
        >
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
                    data-doctor-option
                    onClick={() => assignDoctor(doctor.name)}
                    className={`w-full truncate rounded-lg px-2 py-1.5 text-sm font-medium ${doctorColorClasses(
                      doctor.color
                    )} ${
                      doctor.name === room.doctor_name
                        ? "ring-2 ring-inset ring-white"
                        : "opacity-85 hover:opacity-100"
                    }`}
                  >
                    {doctor.name}
                  </button>
                ))}
                <button
                  data-doctor-option
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

      {menuVisit && (
        <div className="absolute inset-0 z-10 flex flex-col justify-center gap-1.5 rounded-2xl bg-neutral-900/95 p-2">
          <p className="truncate text-sm font-semibold">
            {menuVisit.display_name}
          </p>
          {/* Undo for a mistaken "Doctor in". Only before the timer runs:
              once needles are in, the doctor has plainly been. */}
          {menuVisit.seen_at !== null && !sessionActive && !turningOver && (
            <button
              onClick={() => {
                setMenuVisitId(null);
                onVisitAction(menuVisit.id, "mark_waiting");
              }}
              className="w-full rounded-lg bg-purple-700 px-2 py-1.5 text-sm hover:bg-purple-600"
            >
              Doctor hasn&apos;t come yet
            </button>
          )}
          <button
            onClick={() => {
              setMenuVisitId(null);
              onVisitAction(menuVisit.id, "unassign");
            }}
            className="w-full rounded-lg bg-white/10 px-2 py-1.5 text-sm hover:bg-white/20"
          >
            Back to waiting list
          </button>
          <button
            onClick={() => {
              setMenuVisitId(null);
              onVisitAction(menuVisit.id, "remove");
            }}
            className="w-full rounded-lg bg-rose-900/70 px-2 py-1.5 text-sm hover:bg-rose-900"
          >
            Remove
          </button>
          <button
            onClick={() => setMenuVisitId(null)}
            className="w-full rounded-lg px-2 py-1 text-xs text-white/60 hover:bg-white/10"
          >
            Cancel
          </button>
        </div>
      )}

      {question && (
        <div
          data-assign-keep
          className="absolute inset-0 z-20 flex flex-col justify-center gap-1 rounded-2xl bg-neutral-900/95 p-2 ring-2 ring-inset ring-white/70"
        >
          <p className="truncate text-xs font-medium text-white/70">
            {question.patientName} → {room.name}
          </p>
          <p className="line-clamp-2 text-sm font-semibold leading-tight">
            Together with {question.companionNames.join(" & ")}
            {question.kind === "ask_join_line" && " (next up)"}?
          </p>
          <button
            disabled={busy}
            onClick={() => answer(true)}
            className="w-full rounded-lg bg-white/90 px-2 py-1.5 text-sm font-semibold text-neutral-900 hover:bg-white disabled:opacity-40"
          >
            {question.kind === "ask_join_room"
              ? "Yes, send in"
              : "Yes, line up together"}
          </button>
          {question.kind === "ask_join_room" ? (
            <button
              disabled={busy}
              onClick={() => answer(false)}
              className="w-full rounded-lg bg-white/15 px-2 py-1.5 text-sm font-semibold hover:bg-white/25 disabled:opacity-40"
            >
              No, next up
            </button>
          ) : (
            // No "No" here: this room's line is another group, so the
            // answer would be a refusal. Say why instead.
            <p className="text-[11px] leading-tight text-white/60">
              {room.name} already has someone waiting for it.
            </p>
          )}
          <button
            onClick={onCancelQuestion}
            className="w-full rounded-lg px-2 py-0.5 text-xs text-white/60 hover:bg-white/10"
          >
            Cancel
          </button>
        </div>
      )}

      {assignMode && !question && (
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
