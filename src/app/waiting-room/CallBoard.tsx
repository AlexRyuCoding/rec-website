"use client";
import Image from "next/image";
import { ArrowRight, DoorOpen } from "lucide-react";
import type { NowPlaying } from "@/lib/music";
import MusicBar from "./music/MusicBar";
import { Appear, motionVars, ROW_OUT_MS, Swap, useLingering } from "./motion";

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

// A call counts as news — its row opens up and glows gold — for this long
// after the patient was called. Long enough to cover a slow poll, short
// enough that calls already on screen when the page loads stay still.
// The animations themselves are over well before it ends.
const FRESH_MS = 20_000;

const calledAtMs = (call: Call) => Date.parse(call.calledAt);

// What the waiting-room TV shows. Pure presentation: WaitingRoomScreen
// owns the data, pairing and sound.
//
// It is read on a 42-inch TV from the far side of the waiting room, so
// every size here is in vh (a share of the screen's height), never px or
// rem. On that TV 1vh is about 5 mm; the rule used is that anything a
// patient must read has letters at least ~2 cm tall (text-[5.5vh] and up),
// which holds at 5–6 m. Only notes for staff (reconnecting, sound hint)
// and the music bar are smaller. Nothing ever scrolls.
//
// Nothing pops in or blinks out either (see board.css, motion.tsx):
//   - a block that comes or goes (clock, music bar, door reminder) fades
//     up into place and fades away
//   - the middle of the screen shows one view at a time; the old one
//     fades out before the new one fades in
//   - a called patient's row opens up, pushing the others down, and
//     closes again when the patient has gone in; the rows glide to a
//     smaller size when there are more than three
export default function CallBoard({
  phase,
  calls,
  nowMs,
  reconnecting,
  soundReady,
  music,
  localNowMs,
}: {
  phase: BoardPhase;
  // Newest call first.
  calls: Call[];
  nowMs: number;
  reconnecting: boolean;
  soundReady: boolean;
  // Background music, when staff have chosen some; null = none.
  music: NowPlaying | null;
  // This device's own clock, for the music progress bar.
  localNowMs: number;
}) {
  const live = phase.kind === "live";

  // Rows stay for a moment after their call has ended, so they can close.
  const rows = useLingering(calls, ROW_OUT_MS, calledAtMs);

  // With seconds, so the screen is visibly alive at a glance.
  const clock = new Date(nowMs).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZone: CLINIC_TZ,
  });

  // Up to three calls get the full size; more shrink to share the height.
  // A row is about 1.6x its font size tall and, with the door reminder
  // below it, the list has roughly 53vh to itself — hence 32 / count.
  // Rows on their way out are not counted: the others grow as they close.
  const rowVh = Math.min(11, 32 / Math.max(calls.length, 1));

  // The one thing in the middle of the screen. A change of view is a
  // cross-fade; a new pairing code counts as a new view.
  const view =
    phase.kind === "pairing"
      ? `pairing:${phase.code}`
      : !live
        ? phase.kind
        : calls.length > 0
          ? "calls"
          : "seat";

  return (
    <main
      style={motionVars}
      className="tv-board relative flex h-dvh w-full flex-col overflow-hidden bg-canvas px-[5vw] py-[4vh] text-cream"
    >
      <header className="flex min-h-[9vh] shrink-0 items-center justify-between">
        <Image
          src="/rac-logo-white.png"
          alt="Ryu Acupuncture Clinic"
          width={200}
          height={200}
          priority
          className="h-[9vh] w-auto shrink-0 opacity-90"
        />
        <Appear
          show={live && music !== null}
          className="mx-[3vw] min-w-0 flex-1"
        >
          {music && <MusicBar playing={music} nowMs={localNowMs} />}
        </Appear>
        <Appear show={live} className="shrink-0">
          <p
            suppressHydrationWarning
            // Fixed-width digits (the sans face has them; the serif does
            // not), so the time does not wobble as the seconds change.
            className="font-sans text-[6vh] font-medium tabular-nums leading-none text-cream/70"
          >
            {clock}
          </p>
        </Appear>
      </header>

      <section className="flex min-h-0 flex-1 flex-col">
        <Swap
          viewKey={view}
          className="flex min-h-0 flex-1 flex-col justify-center"
        >
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

          {live && calls.length === 0 && (
            <div className="text-center">
              <p className="font-serif text-[12vh] leading-tight">
                Please have a seat.
              </p>
              <p className="mt-[2.5vh] text-[5.5vh] leading-tight text-cream/70">
                Your name will appear here when your room is ready.
              </p>
            </div>
          )}

          {live && calls.length > 0 && (
            <>
              <h1 className="mb-[2vh] shrink-0 text-[4.5vh] font-medium uppercase tracking-[0.25em] text-gold">
                Your room is ready
              </h1>
              <ul className="min-h-0 overflow-hidden border-b border-cream/15">
                {rows.map(({ item: call, leaving }) => {
                  const fresh = !leaving && nowMs - calledAtMs(call) < FRESH_MS;
                  return (
                    <li
                      key={call.id}
                      aria-hidden={leaving || undefined}
                      className={`tv-row ${
                        leaving ? "tv-row-out" : fresh ? "tv-row-in" : ""
                      }`}
                    >
                      {/* Three layers on purpose. The row's height is
                          animated down to nothing, which only works if
                          the thing being squeezed has no padding or
                          border of its own — so those live one level
                          further in. */}
                      <div className="tv-row-clip">
                        <div
                          className="tv-row-body relative flex items-center justify-between gap-[3vw] border-t border-cream/15 px-[1.5vw]"
                          style={{
                            fontSize: `min(${rowVh}vh, 6.5vw)`,
                            paddingBlock: `${rowVh * 0.18}vh`,
                          }}
                        >
                          {/* Noticed even with the sound off. Rounded,
                              and held just inside the dividing lines. */}
                          {fresh && (
                            <span
                              aria-hidden
                              className="tv-glow pointer-events-none absolute inset-x-0 inset-y-[0.12em] rounded-[0.32em] bg-gold/25"
                            />
                          )}
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
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </Swap>
      </section>

      {/* Always on screen while the board is live: patients read this
          while they wait, before they are ever called. */}
      <Appear show={live} delayMs={200} className="mt-[2vh] shrink-0">
        <aside
          aria-label="Reminder about your room door"
          className="flex items-center gap-[3vw] rounded-[3vh] border-[0.4vh] border-gold/50 bg-cream/[0.06] px-[3vw] py-[2vh]"
        >
          <DoorOpen
            aria-hidden
            strokeWidth={1.6}
            className="size-[15vh] shrink-0 text-gold"
          />
          <p className="font-sans text-[5.8vh] font-medium leading-[1.2]">
            When you enter your room, please close the door,
            <br />
            but <span className="text-gold">leave it slightly open</span>.
          </p>
        </aside>
      </Appear>

      {/* Notes for staff, tucked into the bottom margin so they take no
          room from what patients read. */}
      <footer className="absolute inset-x-[5vw] bottom-[1vh] flex items-center justify-between text-[1.8vh] text-cream/35">
        <span>
          <Appear show={reconnecting}>Reconnecting…</Appear>
        </span>
        <span>
          <Appear show={live && !soundReady}>Press OK to turn on sound</Appear>
        </span>
      </footer>
    </main>
  );
}
