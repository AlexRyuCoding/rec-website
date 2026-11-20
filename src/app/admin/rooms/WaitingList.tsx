"use client";
import { useEffect, useRef, useState } from "react";
import { Users, X } from "lucide-react";
import { gsap, useGSAP } from "@/lib/gsap";
import { matchRosterDoctor, VisitView } from "@/lib/patient-flow";
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

// Checked-in patients who have no room yet, oldest first. Tapping a chip
// selects that patient; the room tiles then offer "Send here" / "Next up
// here" (page.tsx owns the selection). Tapping the chip again cancels.
export default function WaitingList({
  visits,
  doctors,
  nowMs,
  selectedId,
  onSelect,
  onRemove,
}: {
  // Waiting visits only, already in display order.
  visits: VisitView[];
  doctors: DoctorRow[];
  nowMs: number;
  selectedId: string | null;
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
            {visits.map((visit) => {
              const selected = visit.id === selectedId;
              const armed = visit.id === armedRemoveId;
              const rosterName = matchRosterDoctor(
                visit.practitioner_name,
                doctors
              );
              const rosterColor = doctors.find(
                (d) => d.name === rosterName
              )?.color;
              return (
                <div
                  key={visit.id}
                  data-visit-chip={visit.id}
                  data-assign-keep
                  className={`flex shrink-0 items-stretch overflow-hidden rounded-xl text-left transition-colors duration-200 ${
                    selected
                      ? "bg-white text-neutral-900"
                      : "bg-white/10 text-white hover:bg-white/15"
                  }`}
                >
                  <button
                    aria-pressed={selected}
                    onClick={() => onSelect(selected ? null : visit.id)}
                    className="px-3 py-1.5 text-left"
                  >
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
                  </button>
                  <button
                    aria-label={
                      armed
                        ? `Confirm removing ${visit.display_name}`
                        : `Remove ${visit.display_name} from the waiting list`
                    }
                    onClick={() => {
                      if (armed) {
                        setArmedRemoveId(null);
                        onRemove(visit.id);
                      } else {
                        setArmedRemoveId(visit.id);
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
            })}
          </div>
        )}
      </div>
      {selectedId && (
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
