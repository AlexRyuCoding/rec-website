"use client";
import { useEffect, useState } from "react";
import { VisitView } from "@/lib/patient-flow";
import { visitNote } from "./visit-note";

// How long an armed button waits for its second tap.
export const ARMED_MS = 4000;

// The menu behind a patient's name on a tile: who they are in full (the
// tile only has room for a truncated line), and what staff can do.
//
// "Remove" finishes the patient's visit, and sits a finger's width from
// the buttons above it. Like the × in the waiting list, it takes two
// taps — the first arms it, the second does it — and disarms itself.
export default function PatientMenu({
  visit,
  canMarkWaiting,
  onAction,
  onClose,
}: {
  visit: VisitView;
  // Undo for a mistaken "Doctor in" is offered.
  canMarkWaiting: boolean;
  onAction: (action: "unassign" | "remove" | "mark_waiting") => void;
  onClose: () => void;
}) {
  const [removeArmed, setRemoveArmed] = useState(false);
  useEffect(() => {
    if (!removeArmed) return;
    const t = setTimeout(() => setRemoveArmed(false), ARMED_MS);
    return () => clearTimeout(t);
  }, [removeArmed]);
  // The confirmation belongs to the patient it was armed for.
  useEffect(() => {
    setRemoveArmed(false);
  }, [visit.id]);

  const note = visitNote(visit);
  const item = "min-h-10 w-full rounded-lg px-2 text-sm";

  return (
    <div className="absolute inset-0 z-10 flex flex-col justify-center gap-1.5 rounded-2xl bg-neutral-900/95 p-2">
      <div>
        <p className="truncate text-sm font-semibold">{visit.display_name}</p>
        {note && (
          <p className="line-clamp-2 text-xs leading-tight text-white/70">
            {note}
          </p>
        )}
      </div>
      {/* Undo for a mistaken "Doctor in". Only before the timer runs:
          once needles are in, the doctor has plainly been. */}
      {canMarkWaiting && (
        <button
          onClick={() => onAction("mark_waiting")}
          className={`${item} bg-purple-700 hover:bg-purple-600`}
        >
          Doctor hasn&apos;t come yet
        </button>
      )}
      <button
        onClick={() => onAction("unassign")}
        className={`${item} bg-white/10 hover:bg-white/20`}
      >
        Back to waiting list
      </button>
      <button
        onClick={() => {
          if (!removeArmed) {
            setRemoveArmed(true);
            return;
          }
          onAction("remove");
        }}
        className={`${item} ${
          removeArmed
            ? "bg-rose-600 font-semibold ring-2 ring-inset ring-white"
            : "bg-rose-900/70 hover:bg-rose-900"
        }`}
      >
        {removeArmed ? "Tap again to remove" : "Remove"}
      </button>
      <button
        onClick={onClose}
        className="min-h-8 w-full rounded-lg px-2 text-xs text-white/60 hover:bg-white/10"
      >
        Cancel
      </button>
    </div>
  );
}
