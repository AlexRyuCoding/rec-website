"use client";
import { useEffect, useRef, useState } from "react";
import { Play, Volume2 } from "lucide-react";
import { SoundId, SOUNDS, STAFF_SOUND_IDS } from "@/lib/sounds";

// A legend for the board's alert sounds: what each one means, what it
// sounds like, and a button to hear it. Sounds only work as alerts if
// staff know which is which without looking, so the board lets them
// listen on demand instead of waiting for the real thing.
export default function SoundsPanel({
  onPlay,
}: {
  onPlay: (id: SoundId) => void;
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

  return (
    <div ref={rootRef} className="relative">
      <button
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 text-sm hover:bg-white/20"
      >
        <Volume2 className="h-4 w-4" /> Sounds
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
        </div>
      )}
    </div>
  );
}
