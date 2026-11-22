"use client";
import { useEffect, useRef, useState } from "react";
import { Play, Volume2 } from "lucide-react";
import { doctorColorClasses, DoctorRow } from "@/lib/room-status";
import { SoundId, SOUNDS, STAFF_SOUND_IDS } from "@/lib/sounds";

// The board's sounds, on one panel.
//
// A legend: what each alert sound means, what it sounds like, and a
// button to hear it. Sounds only work as alerts if staff know which is
// which without looking, so the board lets them listen on demand instead
// of waiting for the real thing.
//
// And one setting, kept on this tablet: whose patients the doorbell rings
// for here. A tablet in one doctor's room need not ring every time
// another doctor's patient is shown in — but it is only ever quiet for
// the first five minutes: after that a waiting patient rings everywhere
// (src/lib/alert-escalation.ts). The timer sounds are not affected.
export default function SoundsPanel({
  onPlay,
  doctors,
  doorbellDoctors,
  onDoorbellDoctors,
}: {
  onPlay: (id: SoundId) => void;
  doctors: DoctorRow[];
  // The doctors this tablet rings for; empty = everyone.
  doorbellDoctors: string[];
  onDoorbellDoctors: (names: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const everyone = doorbellDoctors.length === 0;
  const toggle = (name: string) =>
    onDoorbellDoctors(
      doorbellDoctors.includes(name)
        ? doorbellDoctors.filter((n) => n !== name)
        : [...doorbellDoctors, name]
    );
  const choice =
    "min-h-10 rounded-full px-4 text-sm font-semibold transition-opacity";

  return (
    <div ref={rootRef} className="relative">
      <button
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 text-sm hover:bg-white/20"
      >
        <Volume2 className="h-4 w-4" /> Sounds
        {/* A tablet that rings for some doctors only says so, so nobody
            wonders why it stayed quiet. */}
        {!everyone && (
          <span className="max-w-28 truncate rounded-full bg-white/15 px-2 text-xs">
            {doorbellDoctors.join(", ")}
          </span>
        )}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Alert sounds"
          className="absolute right-0 top-full z-40 mt-2 w-80 rounded-2xl bg-neutral-900 p-3 shadow-2xl ring-1 ring-white/10"
        >
          <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-widest text-white/60">
            What each sound means
          </p>
          <ul className="space-y-1.5">
            {STAFF_SOUND_IDS.map((id) => (
              <li
                key={id}
                className="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{SOUNDS[id].name}</p>
                  <p className="text-xs text-white/60">
                    {SOUNDS[id].soundsLike}
                  </p>
                </div>
                <button
                  aria-label={`Play: ${SOUNDS[id].name}`}
                  onClick={() => onPlay(id)}
                  className="flex shrink-0 items-center gap-1 rounded-lg bg-white/90 px-3 py-1.5 text-sm font-semibold text-neutral-900 hover:bg-white"
                >
                  <Play className="h-3.5 w-3.5" /> Play
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 px-1 text-xs text-white/50">
            Playing a sound also turns alert sounds on for this device.
          </p>

          {doctors.length > 0 && (
            <div className="mt-3 border-t border-white/10 pt-3">
              <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-widest text-white/60">
                Doorbell on this tablet rings for
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  aria-pressed={everyone}
                  onClick={() => onDoorbellDoctors([])}
                  className={`${choice} ${
                    everyone
                      ? "bg-white text-neutral-900"
                      : "bg-white/10 text-white/70 hover:bg-white/20"
                  }`}
                >
                  Everyone
                </button>
                {doctors.map((doctor) => {
                  const on = doorbellDoctors.includes(doctor.name);
                  return (
                    <button
                      key={doctor.id}
                      aria-pressed={on}
                      onClick={() => toggle(doctor.name)}
                      className={`${choice} ${doctorColorClasses(doctor.color)} ${
                        on ? "ring-2 ring-white" : "opacity-45 hover:opacity-80"
                      }`}
                    >
                      {doctor.name}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 px-1 text-xs text-white/50">
                {everyone
                  ? "Rings when any patient starts waiting for a doctor."
                  : `Rings when a patient starts waiting for ${doorbellDoctors.join(
                      " or "
                    )}.`}{" "}
                A patient still waiting after 5 minutes rings on every tablet,
                and again every 3 minutes.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
