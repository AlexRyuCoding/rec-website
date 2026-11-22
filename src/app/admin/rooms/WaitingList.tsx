"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CalendarClock, History, UserPlus, Users, X } from "lucide-react";
import { useDraggable } from "@dnd-kit/core";
import { gsap, useGSAP } from "@/lib/gsap";
import {
  AssignOutcome,
  matchRosterDoctor,
  VisitView,
} from "@/lib/patient-flow";
import { doctorColorClasses, DoctorRow, RoomRow } from "@/lib/room-status";
import { waitLevel, WaitLevel } from "@/lib/alert-escalation";
import ExpectedPanel from "./ExpectedPanel";
import FinishedPanel from "./FinishedPanel";
import { CLINIC_TZ } from "@/lib/clinic-time";
import { buttonSkinClass } from "../ui/styles";

function formatAppointment(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: CLINIC_TZ,
  });
}

function formatWaited(sinceIso: string, nowMs: number): string {
  const minutes = Math.max(
    0,
    Math.floor((nowMs - Date.parse(sinceIso)) / 60000)
  );
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

// Name on top (with "First visit" beside it), then appointment time ·
// doctor · service · how long they have waited.
// Shared by the chip in the list and the copy that follows the mouse
// while it is dragged.
// How a waiting name looks at each wait level. The fills for a long wait
// are the same in both themes (they are a signal, like a room tile's
// colour); the ordinary key is the theme's.
const CHIP_SKIN: Record<WaitLevel, string> = {
  ok: "bg-ui-btn text-ui-text",
  warn: "bg-[#fcd34d] text-amber-950",
  long: "bg-[#e11d48] text-ui-on-accent",
};
// Its edge and hard ledge (never a blur). The edge is a ring, not a
// border: a border would make every name 2px taller and push the rooms
// down the tablet.
const CHIP_LEDGE: Record<WaitLevel, string> = {
  ok: "shadow-lift-1 ring-1 ring-inset ring-ui-line-strong",
  warn: "shadow-[inset_0_1px_0_rgba(255,255,255,0.5),0_2px_0_#8f6508] ring-1 ring-inset ring-[#b7860b]",
  long: "shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_2px_0_#7a0e2c] ring-1 ring-inset ring-[#9f1239]",
};
// … and the ring that marks the picked one, in a colour that shows on
// that fill.
const CHIP_PICKED: Record<WaitLevel, string> = {
  ok: "ring-[3px] ring-inset ring-ui-tab-accent",
  warn: "ring-[3px] ring-inset ring-amber-950",
  long: "ring-[3px] ring-inset ring-ui-on-accent",
};
// The copy that follows the mouse floats over the tiles: a deeper ledge.
const GHOST_LEDGE = "shadow-[0_5px_0_rgba(0,0,0,0.45)]";

function ChipLabel({
  visit,
  doctors,
  nowMs,
}: {
  visit: VisitView;
  doctors: DoctorRow[];
  nowMs: number;
}) {
  const rosterName = matchRosterDoctor(visit.practitioner_name, doctors);
  const level = waitLevel(visit, nowMs);
  const rosterColor = doctors.find((d) => d.name === rosterName)?.color;
  return (
    <>
      <span className="flex items-center gap-1.5 text-sm font-semibold leading-tight">
        {visit.display_name}
        {visit.first_visit && (
          <span
            className={`rounded-full px-1.5 text-[10px] font-bold uppercase tracking-wide ${
              level === "long"
                ? "bg-ui-on-accent text-rose-700"
                : level === "warn"
                  ? "bg-amber-950 text-amber-300"
                  : "bg-amber-300 text-amber-950"
            }`}
          >
            First visit
          </span>
        )}
      </span>
      <span
        className={`flex items-center gap-1.5 text-[11px] leading-tight ${
          level === "ok" ? "text-ui-text-2" : "opacity-80"
        }`}
      >
        {visit.appointment_at && (
          <span>{formatAppointment(visit.appointment_at)}</span>
        )}
        {visit.appointment_at && <span aria-hidden>·</span>}
        {visit.practitioner_name && (
          <span className="flex items-center gap-1">
            {rosterName && (
              <span
                className={`inline-block h-2 w-2 rounded-full ${doctorColorClasses(
                  rosterColor
                )}`}
              />
            )}
            {rosterName ?? visit.practitioner_name}
          </span>
        )}
        {visit.practitioner_name && <span aria-hidden>·</span>}
        {visit.service_name && (
          <span className="max-w-40 truncate">{visit.service_name}</span>
        )}
        {visit.service_name && <span aria-hidden>·</span>}
        <span
          className={
            level === "long"
              ? "font-bold"
              : level === "warn"
                ? "font-semibold"
                : ""
          }
        >
          {formatWaited(visit.checked_in_at, nowMs)}
        </span>
      </span>
    </>
  );
}

const DROP_LABELS: Record<AssignOutcome, (roomName: string) => string> = {
  send: (roomName) => `Send to ${roomName}`,
  next_up: (roomName) => `Next up in ${roomName}`,
  // The drop asks a question first, so the chip must not promise an answer.
  ask_join_room: (roomName) => `${roomName}: together or next up?`,
  ask_join_line: (roomName) => `${roomName}: join the line?`,
  full: (roomName) => `${roomName} is full`,
};

// What follows the mouse while a chip is dragged to a room (rendered by
// page.tsx inside the DragOverlay). It sits on top of the room it is
// over and hides that tile's own "Send here" label, so it carries the
// answer itself: what letting go right now would do.
export function WaitingChipGhost({
  visit,
  doctors,
  nowMs,
  target,
}: {
  visit: VisitView;
  doctors: DoctorRow[];
  nowMs: number;
  // The room under the mouse, if any.
  target: { roomName: string; outcome: AssignOutcome } | null;
}) {
  return (
    <div className="flex w-max cursor-grabbing flex-col items-start gap-1.5">
      <div
        className={`rotate-2 rounded-xl px-3 py-1.5 text-left ${
          CHIP_SKIN[waitLevel(visit, nowMs)]
        } ${GHOST_LEDGE}`}
      >
        <ChipLabel visit={visit} doctors={doctors} nowMs={nowMs} />
      </div>
      {target && (
        <span
          className={`whitespace-nowrap rounded-full border border-ui-line-strong px-2.5 py-1 text-xs font-semibold shadow-[0_2px_0_rgba(0,0,0,0.45)] ${
            target.outcome === "full"
              ? "bg-ui-panel-2 text-ui-text-3"
              : "bg-ui-panel text-ui-text"
          }`}
        >
          {DROP_LABELS[target.outcome](target.roomName)}
        </span>
      )}
    </div>
  );
}

// One waiting patient. Module-level (not defined inside the list) so the
// drag hook keeps its identity across the board's once-a-second rerender.
function WaitingChip({
  visit,
  doctors,
  nowMs,
  selected,
  armed,
  onSelect,
  onArm,
  onRemove,
}: {
  visit: VisitView;
  doctors: DoctorRow[];
  nowMs: number;
  selected: boolean;
  armed: boolean;
  onSelect: (visitId: string | null) => void;
  onArm: (visitId: string | null) => void;
  onRemove: (visitId: string) => void;
}) {
  // Mouse only (page.tsx registers just the mouse sensor), and only the
  // name half is a handle: the × must stay a plain button. dnd-kit's
  // `attributes` are deliberately not spread — they would announce a
  // keyboard drag that does not exist and overwrite aria-pressed.
  const { setNodeRef, listeners, isDragging } = useDraggable({ id: visit.id });
  const level = waitLevel(visit, nowMs);
  return (
    <div
      ref={setNodeRef}
      data-visit-chip={visit.id}
      data-wait-level={level}
      data-assign-keep
      // A raised key: it is pressed (name, then room). The longer a
      // patient has been kept waiting (waitLevel), the harder it is to
      // overlook: amber from ten minutes, red from twenty — the same in
      // both themes. Pressed or picked, it loses its ledge; the picked
      // one also gets a ring.
      // It never moves by CSS: this element's transform belongs to the
      // arrival animation (GSAP leaves an inline transform behind, which
      // would beat a class anyway) and to the drag library.
      className={`flex shrink-0 items-stretch overflow-hidden rounded-xl text-left transition-[background-color,color,opacity,box-shadow] duration-200 ${
        CHIP_SKIN[level]
      } ${
        selected
          ? CHIP_PICKED[level]
          : `${CHIP_LEDGE[level]} active:shadow-none`
      } ${isDragging ? "opacity-40" : ""}`}
    >
      <button
        {...listeners}
        aria-pressed={selected}
        onClick={() => onSelect(selected ? null : visit.id)}
        className="select-none px-3 py-1.5 text-left [@media(hover:hover)_and_(pointer:fine)]:cursor-grab"
      >
        <ChipLabel visit={visit} doctors={doctors} nowMs={nowMs} />
      </button>
      <button
        aria-label={
          armed
            ? `Confirm removing ${visit.display_name}`
            : `Remove ${visit.display_name} from the waiting list`
        }
        onClick={() => {
          if (armed) {
            onArm(null);
            onRemove(visit.id);
          } else {
            onArm(visit.id);
          }
        }}
        className={`flex min-w-11 items-center justify-center px-2 text-[11px] font-semibold ${
          armed
            ? "bg-ui-error-fill text-ui-on-accent"
            : "opacity-60 hover:bg-black/10 hover:opacity-100"
        }`}
      >
        {armed ? "Remove?" : <X className="h-4 w-4" />}
      </button>
    </div>
  );
}

// Checked-in patients who have no room yet, oldest first. Tapping a chip
// selects that patient; the room tiles then offer "Send here" / "Next up
// here" (page.tsx owns the selection). Tapping the chip again cancels.
// With a mouse the chip can also be dragged straight onto a room.
export default function WaitingList({
  visits,
  allVisits,
  rooms,
  doctors,
  nowMs,
  selectedId,
  dragging,
  onSelect,
  onRemove,
  onRestore,
}: {
  // Waiting visits only, already in display order.
  visits: VisitView[];
  // Everyone on the board and the rooms, for the "Finished" list (where
  // a restored patient would land).
  allVisits: VisitView[];
  rooms: RoomRow[];
  doctors: DoctorRow[];
  nowMs: number;
  selectedId: string | null;
  // A chip is being dragged right now: the "Tap a room" hint stays away,
  // so the board does not shift under the mouse mid-drag.
  dragging: boolean;
  onSelect: (visitId: string | null) => void;
  onRemove: (visitId: string) => void;
  onRestore: (visitId: string) => Promise<boolean>;
}) {
  // Removing is two taps on the ×: the first arms it, the second confirms.
  const [armedRemoveId, setArmedRemoveId] = useState<string | null>(null);
  // One list open at a time under the chips.
  const [panel, setPanel] = useState<"expected" | "finished" | null>(null);
  const panelButton = (open: boolean) =>
    `flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-xs font-medium ${
      open
        ? "border border-ui-line-strong bg-ui-well text-ui-text shadow-sunk"
        : buttonSkinClass()
    }`;
  const listRef = useRef<HTMLDivElement>(null);
  const seenIdsRef = useRef<Set<string> | null>(null);

  // An armed × disarms itself, so a stray tap can't linger as a trap.
  useEffect(() => {
    if (!armedRemoveId) return;
    const t = setTimeout(() => setArmedRemoveId(null), 4000);
    return () => clearTimeout(t);
  }, [armedRemoveId]);

  // New arrivals slide in so staff notice the list grew. The first render
  // (page load) is not an arrival and stays still.
  const idsKey = visits.map((v) => v.id).join(",");
  useGSAP(
    () => {
      const ids = new Set(visits.map((v) => v.id));
      const previous = seenIdsRef.current;
      seenIdsRef.current = ids;
      if (!previous || !listRef.current) return;
      const fresh = [...ids].filter((id) => !previous.has(id));
      if (fresh.length === 0) return;
      const nodes = fresh
        .map((id) =>
          listRef.current!.querySelector(`[data-visit-chip="${id}"]`)
        )
        .filter(Boolean);
      gsap.from(nodes, {
        opacity: 0,
        y: -8,
        scale: 0.94,
        duration: 0.35,
        ease: "house",
        stagger: 0.05,
      });
    },
    { dependencies: [idsKey] }
  );

  return (
    <section
      aria-label="Waiting patients"
      className="mx-auto mb-4 max-w-5xl rounded-2xl bg-ui-panel px-3 py-2.5 shadow-lift-2 ring-1 ring-ui-line"
    >
      <div className="flex items-center gap-3">
        <h2 className="flex shrink-0 items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-ui-text-2">
          <Users className="h-3.5 w-3.5" /> Waiting
          {visits.length > 0 && (
            <span className="rounded-full bg-ui-panel-2 px-1.5 text-ui-text">
              {visits.length}
            </span>
          )}
        </h2>
        {visits.length === 0 ? (
          <p className="text-sm text-ui-text-3">No one waiting</p>
        ) : (
          <div
            ref={listRef}
            className="flex min-w-0 flex-1 gap-2 overflow-x-auto py-0.5"
          >
            {visits.map((visit) => (
              <WaitingChip
                key={visit.id}
                visit={visit}
                doctors={doctors}
                nowMs={nowMs}
                selected={visit.id === selectedId}
                armed={visit.id === armedRemoveId}
                onSelect={onSelect}
                onArm={setArmedRemoveId}
                onRemove={onRemove}
              />
            ))}
          </div>
        )}
        {/* For a patient who is here but not on the list — a walk-in, a
            forgotten PIN, someone removed by mistake. The search itself
            is on the dashboard: it shows full names and contact details,
            which do not belong on a board patients walk past. */}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {/* Who has an appointment today and is not here yet. */}
          <button
            aria-expanded={panel === "expected"}
            onClick={() =>
              setPanel((p) => (p === "expected" ? null : "expected"))
            }
            className={panelButton(panel === "expected")}
          >
            <CalendarClock className="h-4 w-4" /> Expected
          </button>
          {/* The way back for a patient who was finished or removed by
              mistake. */}
          <button
            aria-expanded={panel === "finished"}
            onClick={() =>
              setPanel((p) => (p === "finished" ? null : "finished"))
            }
            className={panelButton(panel === "finished")}
          >
            <History className="h-4 w-4" /> Finished
          </button>
          <Link
            href="/admin/dashboard?tab=patients"
            className={`flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-xs font-medium ${buttonSkinClass()}`}
          >
            <UserPlus className="h-4 w-4" /> Check in a patient
          </Link>
        </div>
      </div>
      {panel === "expected" && (
        <ExpectedPanel visits={allVisits} doctors={doctors} nowMs={nowMs} />
      )}
      {panel === "finished" && (
        <FinishedPanel rooms={rooms} visits={allVisits} onRestore={onRestore} />
      )}
      {selectedId && !dragging && (
        <p className="mt-1.5 text-xs text-ui-text-2">
          Tap a room to send{" "}
          <strong className="text-ui-text">
            {visits.find((v) => v.id === selectedId)?.display_name}
          </strong>{" "}
          there. Tap the name again to cancel.
        </p>
      )}
    </section>
  );
}
