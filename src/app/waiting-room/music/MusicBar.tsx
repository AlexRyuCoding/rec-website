"use client";
import { Music, Pause, Radio } from "lucide-react";
import { formatTrackTime, NowPlaying, progressAt } from "@/lib/music";

// What is playing, in the header between the logo and the clock.
//
// This is ambience, not something a patient has to read, so it is the one
// part of the board set below the 2 cm letter rule: big enough to make out
// from a seat, small enough to stay out of the way of the names.
// Sizes are in vh like everything else on the TV.
export default function MusicBar({
  playing,
  // The TV's own clock (not the server-corrected one): progress readings
  // are stamped with it.
  nowMs,
}: {
  playing: NowPlaying;
  nowMs: number;
}) {
  const { status } = playing;
  const Icon =
    status === "paused" ? Pause : playing.source === "radio" ? Radio : Music;

  let title = playing.title;
  let detail = playing.detail;
  if (status === "blocked") {
    title = "Music is ready";
    detail = "Staff: click this page once (or press any key) to start it";
  } else if (status === "problem") {
    title = "No music right now";
    detail = playing.note ?? detail;
  }

  const showProgress =
    playing.progress !== null && (status === "playing" || status === "paused");
  const progress = showProgress ? progressAt(playing.progress!, nowMs) : null;

  let aside = "";
  if (status === "paused") aside = "Paused";
  else if (status === "starting") aside = "Starting…";
  else if (progress) {
    aside = `${formatTrackTime(progress.positionMs)} / ${formatTrackTime(
      playing.progress!.durationMs
    )}`;
  }

  const quiet = status !== "playing";

  return (
    <div
      role="status"
      aria-label="Music playing in the waiting room"
      className={`mx-[3vw] flex min-w-0 flex-1 items-center gap-[1.2vw] transition-opacity duration-700 ${
        quiet ? "opacity-60" : ""
      }`}
    >
      <Icon
        aria-hidden
        strokeWidth={1.8}
        className="size-[4.4vh] shrink-0 text-gold/80"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-[1.5vw]">
          <p className="min-w-0 truncate font-sans text-[3.2vh] font-medium leading-[1.25]">
            {title}
          </p>
          {status === "playing" && playing.live ? (
            <p className="flex shrink-0 items-center gap-[0.8vh] font-sans text-[2.1vh] font-semibold tracking-[0.2em] text-gold/90">
              <span
                aria-hidden
                className="size-[1.2vh] animate-pulse rounded-full bg-gold"
              />
              LIVE
            </p>
          ) : (
            aside && (
              <p className="shrink-0 font-sans text-[2.3vh] tabular-nums text-cream/60">
                {aside}
              </p>
            )
          )}
        </div>
        {progress && (
          <div
            aria-hidden
            className="my-[0.7vh] h-[0.55vh] overflow-hidden rounded-full bg-cream/15"
          >
            <div
              className="h-full rounded-full bg-gold/80"
              style={{
                width: `${(progress.fraction * 100).toFixed(2)}%`,
                // The clock ticks once a second; glide between ticks.
                transition: "width 1s linear",
              }}
            />
          </div>
        )}
        <p className="truncate font-sans text-[2.1vh] leading-[1.3] text-cream/50">
          {detail}
        </p>
      </div>
    </div>
  );
}
