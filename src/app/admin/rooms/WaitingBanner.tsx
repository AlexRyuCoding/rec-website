"use client";
import { useRef } from "react";
import { BellRing, DoorOpen } from "lucide-react";
import { gsap, useGSAP } from "@/lib/gsap";
import { doctorColorClasses, formatTimerDisplay } from "@/lib/room-status";

export interface WaitingAlert {
  roomId: string;
  roomName: string;
  // Roster doctor on the room's pill, if any.
  doctorName: string | null;
  doctorColor: string | null;
  // "First L." of everyone in the room the doctor has not seen yet.
  patientNames: string[];
  // When the longest-waiting of them was called.
  sinceMs: number;
  // Nobody has come for LONG_WAIT_MS: by now it rings on every tablet,
  // and keeps ringing (alert-escalation.ts).
  long: boolean;
}

// The doctor's alert: one large, bright bar per room where a patient is
// waiting and no doctor has come. It is deliberately impossible to miss —
// full width, in the doctor's own color, pinned to the top of the board —
// and it stays until someone taps "Doctor in" (here or on the tile) or
// starts the room's timer. Nothing dismisses it otherwise: an alert that
// can be waved away is how a patient ends up forgotten in a room.
export default function WaitingBanner({
  alerts,
  nowMs,
  busyRoomIds,
  onDoctorIn,
}: {
  // Longest-waiting first.
  alerts: WaitingAlert[];
  nowMs: number;
  busyRoomIds: Set<string>;
  onDoctorIn: (roomId: string) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const seenRoomIdsRef = useRef<Set<string> | null>(null);

  // A new alert drops in and flashes three times, in step with the three
  // chimes. Alerts already showing when the board loads just appear.
  const idsKey = alerts.map((a) => a.roomId).join(",");
  useGSAP(
    () => {
      const ids = new Set(alerts.map((a) => a.roomId));
      const previous = seenRoomIdsRef.current;
      seenRoomIdsRef.current = ids;
      if (!previous || !rootRef.current) return;
      for (const id of ids) {
        if (previous.has(id)) continue;
        const el = rootRef.current.querySelector(`[data-alert="${id}"]`);
        if (!el) continue;
        gsap.from(el, { y: -40, opacity: 0, duration: 0.45, ease: "house" });
        gsap.fromTo(
          el,
          { scale: 1 },
          {
            scale: 1.025,
            duration: 0.28,
            ease: "power1.inOut",
            yoyo: true,
            repeat: 5,
            delay: 0.4,
          }
        );
        const flash = el.querySelector("[data-alert-flash]");
        if (flash) {
          gsap.fromTo(
            flash,
            { opacity: 0.85 },
            {
              opacity: 0,
              duration: 0.55,
              ease: "power2.out",
              repeat: 2,
              repeatDelay: 0.55,
            }
          );
        }
      }
    },
    { dependencies: [idsKey], scope: rootRef }
  );

  if (alerts.length === 0) return null;

  return (
    <div
      ref={rootRef}
      role="alert"
      aria-live="assertive"
      className="sticky top-2 z-30 mx-auto mb-4 flex max-w-5xl flex-col gap-2"
    >
      {alerts.map((alert) => {
        const waited = Math.max(0, Math.floor((nowMs - alert.sinceMs) / 1000));
        const several = alert.patientNames.length > 1;
        return (
          <div
            key={alert.roomId}
            data-alert={alert.roomId}
            // Its own dark edge (the ring's offset), then the halo: the
            // alert's pale fill is next to nothing against the light
            // theme's pale photo, and the white halo shows only on dark.
            // The edge is the same in both themes — like a room tile, the
            // alert does not follow the theme.
            className={`relative flex flex-wrap items-center gap-x-5 gap-y-3 overflow-hidden rounded-2xl px-5 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_4px_0_rgba(0,0,0,0.45)] ring-offset-2 ring-offset-[#0b0f12] ${
              alert.long ? "ring-[6px] ring-rose-500" : "ring-4 ring-white/40"
            } ${
              alert.doctorName
                ? doctorColorClasses(alert.doctorColor)
                : "bg-amber-300 text-amber-950"
            }`}
          >
            <span
              data-alert-flash
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-white opacity-0"
            />
            <BellRing
              aria-hidden
              className="relative h-12 w-12 shrink-0 animate-pulse sm:h-14 sm:w-14"
            />
            <div className="relative min-w-0 flex-1">
              <p className="text-sm font-bold uppercase tracking-widest opacity-80">
                {alert.doctorName
                  ? `${alert.doctorName} — your patient${
                      several ? "s are" : " is"
                    } waiting`
                  : `Patient${several ? "s" : ""} waiting`}
              </p>
              <p className="text-4xl font-extrabold leading-tight sm:text-5xl">
                {alert.roomName}
              </p>
              <p className="truncate text-lg font-semibold sm:text-xl">
                {alert.patientNames.join(" · ")}
                {alert.long ? (
                  <span className="ml-2 inline-block rounded-md bg-rose-600 px-2 align-middle text-base font-bold tabular-nums text-white">
                    Long wait {formatTimerDisplay(waited)}
                  </span>
                ) : (
                  <span className="ml-2 font-normal tabular-nums opacity-75">
                    waiting {formatTimerDisplay(waited)}
                  </span>
                )}
              </p>
            </div>
            <button
              disabled={busyRoomIds.has(alert.roomId)}
              onClick={() => onDoctorIn(alert.roomId)}
              className="relative flex shrink-0 items-center gap-2 rounded-xl bg-neutral-950 px-6 py-4 text-xl font-bold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_3px_0_rgba(0,0,0,0.6)] transition-[transform,box-shadow] duration-100 hover:bg-neutral-800 [&:not(:disabled)]:active:translate-y-[3px] [&:not(:disabled)]:active:shadow-none [&:not(:disabled)]:active:before:absolute [&:not(:disabled)]:active:before:inset-x-0 [&:not(:disabled)]:active:before:-top-[3px] [&:not(:disabled)]:active:before:h-[3px] [&:not(:disabled)]:active:before:content-[''] motion-reduce:[&:not(:disabled)]:active:translate-y-0 disabled:opacity-50"
            >
              <DoorOpen aria-hidden className="h-6 w-6" /> Doctor in
            </button>
          </div>
        );
      })}
    </div>
  );
}
