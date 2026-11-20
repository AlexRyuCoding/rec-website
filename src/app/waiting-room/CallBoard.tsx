"use client";
import { useRef } from "react";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { gsap, useGSAP } from "@/lib/gsap";

export interface Call {
  id: string;
  displayName: string;
  roomName: string;
  calledAt: string;
}

export type BoardPhase =
  | { kind: "loading" }
  | { kind: "pairing"; code: string }
  | { kind: "live" }
  | { kind: "error" };

const CLINIC_TZ = "America/Los_Angeles";

// What the waiting-room TV shows. Pure presentation: WaitingRoomScreen
// owns the data, pairing and sound. Read from across a room, so the type
// is as large as the number of calls allows and nothing ever scrolls.
export default function CallBoard({
  phase,
  calls,
  nowMs,
  reconnecting,
  soundReady,
}: {
  phase: BoardPhase;
  // Newest call first.
  calls: Call[];
  nowMs: number;
  reconnecting: boolean;
  soundReady: boolean;
}) {
  const listRef = useRef<HTMLUListElement>(null);
  const seenIdsRef = useRef<Set<string> | null>(null);

  // A new call slides in and its row glows gold for a few seconds, so it
  // is noticed even with the sound off. Calls already on screen when the
  // page loads are not news and stay still.
  const idsKey = calls.map((c) => c.id).join(",");
  useGSAP(
    () => {
      const ids = new Set(calls.map((c) => c.id));
      const previous = seenIdsRef.current;
      seenIdsRef.current = ids;
      if (!previous || !listRef.current) return;
      for (const id of ids) {
        if (previous.has(id)) continue;
        const row = listRef.current.querySelector(`[data-call="${id}"]`);
        const glow = row?.querySelector("[data-call-glow]");
        if (!row || !glow) continue;
        gsap.from(row, { opacity: 0, y: 40, duration: 0.7, ease: "house" });
        gsap.fromTo(
          glow,
          { opacity: 0.9 },
          { opacity: 0, duration: 5, ease: "power2.out", delay: 0.4 }
        );
      }
    },
    { dependencies: [idsKey] }
  );

  const clock = new Date(nowMs).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: CLINIC_TZ,
  });

  // Up to three calls get the full size; more shrink to share the height.
  // A row is about 1.6x its font size tall and the list has roughly 72vh
  // to itself, hence 44 / count.
  const rowVh = Math.min(12, 44 / Math.max(calls.length, 1));

  return (
    <main className="flex h-dvh w-full flex-col overflow-hidden bg-canvas px-[5vw] py-[4vh] text-cream">
      <header className="flex shrink-0 items-center justify-between">
        <Image
          src="/rac-logo-white.png"
          alt="Ryu Acupuncture Clinic"
          width={200}
          height={200}
          priority
          className="h-[9vh] w-auto opacity-90"
        />
        {phase.kind === "live" && (
          <p
            suppressHydrationWarning
            className="font-serif text-[5vh] leading-none text-cream/60"
          >
            {clock}
          </p>
        )}
      </header>

      <section className="flex min-h-0 flex-1 flex-col justify-center">
        {phase.kind === "loading" && null}

        {phase.kind === "error" && (
          <p className="text-center font-serif text-[5vh] text-cream/60">
            This screen can&apos;t connect right now.
            <span className="mt-[2vh] block font-sans text-[2.4vh] text-cream/40">
              It will keep trying on its own.
            </span>
          </p>
        )}

        {phase.kind === "pairing" && (
          <div className="text-center">
            <p className="text-[2.6vh] uppercase tracking-[0.3em] text-cream/50">
              Staff: enter this code in Dashboard → Screens
            </p>
            <p className="mt-[4vh] font-sans text-[18vh] font-semibold leading-none tracking-[0.18em] text-gold">
              {phase.code}
            </p>
            <p className="mt-[5vh] text-[2.4vh] text-cream/40">
              No patient information is shown until this screen is paired.
            </p>
          </div>
        )}

        {phase.kind === "live" && calls.length === 0 && (
          <div className="text-center">
            <p className="font-serif text-[11vh] leading-tight">
              Please have a seat.
            </p>
            <p className="mt-[3vh] text-[3.4vh] text-cream/60">
              Your name will appear here when your room is ready.
            </p>
          </div>
        )}

        {phase.kind === "live" && calls.length > 0 && (
          <>
            <h1 className="mb-[3vh] shrink-0 text-[3vh] uppercase tracking-[0.3em] text-gold">
              Your room is ready
            </h1>
            <ul ref={listRef} className="min-h-0 overflow-hidden">
              {calls.map((call) => (
                <li
                  key={call.id}
                  data-call={call.id}
                  className="relative flex items-center justify-between gap-[3vw] border-t border-cream/15 px-[1.5vw] last:border-b"
                  style={{
                    fontSize: `min(${rowVh}vh, 6.5vw)`,
                    paddingBlock: `${rowVh * 0.18}vh`,
                  }}
                >
                  <span
                    data-call-glow
                    aria-hidden
                    className="pointer-events-none absolute inset-0 bg-gold/25 opacity-0"
                  />
                  <span className="relative min-w-0 truncate font-serif leading-tight">
                    {call.displayName}
                  </span>
                  <span className="relative flex shrink-0 items-center gap-[2vw] font-serif leading-tight text-gold">
                    <ArrowRight
                      aria-hidden
                      style={{ width: "0.7em", height: "0.7em" }}
                    />
                    {call.roomName}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <footer className="flex h-[3vh] shrink-0 items-center justify-between text-[1.8vh] text-cream/35">
        <span>{reconnecting ? "Reconnecting…" : ""}</span>
        <span>
          {phase.kind === "live" && !soundReady
            ? "Press OK to turn on sound"
            : ""}
        </span>
      </footer>
    </main>
  );
}
