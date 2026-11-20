"use client";
import { useEffect, useRef, useState } from "react";
import { Users, X } from "lucide-react";
import { useDraggable } from "@dnd-kit/core";
import { gsap, useGSAP } from "@/lib/gsap";
import {
  AssignOutcome,
  matchRosterDoctor,
  VisitView,
} from "@/lib/patient-flow";
import { doctorColorClasses, DoctorRow } from "@/lib/room-status";

const CLINIC_TZ = "America/Los_Angeles";

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

// Name on top, then appointment time · doctor · how long they have waited.
// Shared by the chip in the list and the copy that follows the mouse
// while it is dragged.
function ChipLabel({
  visit,
  doctors,
  nowMs,
  selected,
}: {
  visit: VisitView;
  doctors: DoctorRow[];
  nowMs: number;
  selected: boolean;
}) {
  const rosterName = matchRosterDoctor(visit.practitioner_name, doctors);
  const rosterColor = doctors.find((d) => d.name === rosterName)?.color;
  return (
    <>
      <span className="block text-sm font-semibold leading-tight">
        {visit.display_name}
      </span>
      <span
        className={`flex items-center gap-1.5 text-[11px] leading-tight ${
          selected ? "text-neutral-600" : "text-white/60"
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
        <span>{formatWaited(visit.checked_in_at, nowMs)}</span>
      </span>
    </>
  );
}

const DROP_LABELS: Record<AssignOutcome, (roomName: string) => string> = {
  send: (roomName) => `Send to ${roomName}`,
  next_up: (roomName) => `Next up in ${roomName}`,
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
      <div className="rotate-2 rounded-xl bg-white px-3 py-1.5 text-left text-neutral-900 shadow-2xl shadow-black/60 ring-1 ring-black/10">
        <ChipLabel visit={visit} doctors={doctors} nowMs={nowMs} selected />
      </div>
      {target && (
        <span
          className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold shadow-lg shadow-black/60 ${
            target.outcome === "full"
              ? "bg-neutral-800 text-white/60"
              : "bg-white text-neutral-900"
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
  return (
    <div
      ref={setNodeRef}
      data-visit-chip={visit.id}
      data-assign-keep
      className={`flex shrink-0 items-stretch overflow-hidden rounded-xl text-left transition-[background-color,color,opacity] duration-200 ${
        selected
          ? "bg-white text-neutral-900"
          : "bg-white/10 text-white hover:bg-white/15"
      } ${isDragging ? "opacity-40" : ""}`}
    >
      <button
        {...listeners}
        aria-pressed={selected}
        onClick={() => onSelect(selected ? null : visit.id)}
        className="select-none px-3 py-1.5 text-left [@media(hover:hover)_and_(pointer:fine)]:cursor-grab"
      >
        <ChipLabel
          visit={visit}
          doctors={doctors}
          nowMs={nowMs}
          selected={selected}
        />
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
        className={`flex items-center px-2 text-[11px] font-semibold ${
          armed
            ? "bg-rose-600 text-white"
            : selected
              ? "text-neutral-500 hover:bg-black/10"
              : "text-white/40 hover:bg-white/10 hover:text-white"
        }`}
      >
        {armed ? "Remove?" : <X className="h-3.5 w-3.5" />}
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
  doctors,
  nowMs,
  selectedId,
  dragging,
  onSelect,
  onRemove,
}: {
  // Waiting visits only, already in display order.
  visits: VisitView[];
  doctors: DoctorRow[];
  nowMs: number;
  selectedId: string | null;
  // A chip is being dragged right now: the "Tap a room" hint stays away,
  // so the board does not shift under the mouse mid-drag.
  dragging: boolean;
  onSelect: (visitId: string | null) => void;
  onRemove: (visitId: string) => void;
}) {
  // Removing is two taps on the ×: the first arms it, the second confirms.
  const [armedRemoveId, setArmedRemoveId] = useState<string | null>(null);
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
      className="mx-auto mb-4 max-w-5xl rounded-2xl bg-neutral-900 px-3 py-2.5"
    >
      <div className="flex items-center gap-3">
        <h2 className="flex shrink-0 items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-white/60">
          <Users className="h-3.5 w-3.5" /> Waiting
          {visits.length > 0 && (
            <span className="rounded-full bg-white/15 px-1.5 text-white">
              {visits.length}
            </span>
          )}
        </h2>
        {visits.length === 0 ? (
          <p className="text-sm text-white/40">No one waiting</p>
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
      </div>
      {selectedId && !dragging && (
        <p className="mt-1.5 text-xs text-white/60">
          Tap a room to send{" "}
          <strong className="text-white">
            {visits.find((v) => v.id === selectedId)?.display_name}
          </strong>{" "}
          there. Tap the name again to cancel.
        </p>
      )}
    </section>
  );
}
