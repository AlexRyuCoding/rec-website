"use client";
import { useRef } from "react";
import { ChevronDown, Stethoscope } from "lucide-react";
import { gsap, useGSAP } from "@/lib/gsap";
import { doctorColorClasses, DoctorRow } from "@/lib/room-status";
import { tileKey, tileKeySolid, tilePress } from "./key-styles";

// The roster, laid over the tile: assign a doctor without entering edit
// mode. The panel emerges from the pull tab at the bottom edge, options
// following with a slight stagger. Closing is intentionally instant.
export default function DoctorPanel({
  doctors,
  current,
  onPick,
  onClose,
}: {
  doctors: DoctorRow[];
  current: string | null;
  onPick: (doctorName: string | null) => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (!panelRef.current) return;
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
    { dependencies: [] }
  );

  return (
    <div
      ref={panelRef}
      className="absolute inset-0 z-10 flex flex-col overflow-hidden rounded-2xl bg-neutral-900/95 p-2"
    >
      <p className="mb-1 flex items-center justify-center gap-1 text-xs font-semibold uppercase tracking-widest text-white/60">
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
                onClick={() => onPick(doctor.name)}
                className={`min-h-10 w-full truncate rounded-lg px-2 text-sm font-medium ${tilePress} ${doctorColorClasses(
                  doctor.color
                )} ${
                  doctor.name === current
                    ? "ring-2 ring-inset ring-white"
                    : "opacity-85 hover:opacity-100"
                }`}
              >
                {doctor.name}
              </button>
            ))}
            <button
              data-doctor-option
              onClick={() => onPick(null)}
              className={`min-h-10 w-full truncate rounded-lg px-2 text-sm ${
                current === null
                  ? `${tileKeySolid} font-medium text-neutral-900`
                  : tileKey
              }`}
            >
              None
            </button>
          </>
        )}
      </div>
      <button
        aria-label="Close doctor list"
        onClick={onClose}
        className="mt-1 flex h-7 w-full shrink-0 items-center justify-center rounded-lg bg-white/10 text-white/70 hover:bg-white/20"
      >
        <ChevronDown className="h-4 w-4" />
      </button>
    </div>
  );
}
