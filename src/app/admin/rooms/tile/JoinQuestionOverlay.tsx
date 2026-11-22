"use client";
import { useEffect, useRef } from "react";
import { JoinQuestion } from "@/lib/patient-flow";
import { createTapGuard, SCREEN_CHANGE_GUARD_MS } from "@/lib/tap-guard";
import { tileKey, tileKeySolid } from "./key-styles";

// "Together with Alex R.?" — shown over the tile before a patient is put
// in a room that has someone in it, or behind people already lined up.
export interface TileQuestion {
  // The patient being placed, and the people they would join.
  patientName: string;
  companionNames: string[];
  kind: JoinQuestion["kind"];
}

// The answers are the one choice on this board that decides whether a
// patient walks in on someone: full finger height, and apart from each
// other.
//
// The question appears right where the tile was just tapped, with "Yes"
// under the same finger. A double tap must not answer it: for a moment
// after it opens, its buttons ignore presses (the kiosk's rule).
export default function JoinQuestionOverlay({
  question,
  roomName,
  busy,
  onAnswer,
  onCancel,
}: {
  question: TileQuestion;
  roomName: string;
  busy: boolean;
  // true = "yes, together with the people named"; false = "no, next up".
  onAnswer: (together: boolean) => void;
  onCancel: () => void;
}) {
  const guard = useRef(createTapGuard()).current;
  useEffect(() => {
    guard.block(SCREEN_CHANGE_GUARD_MS);
  }, [guard]);
  const answer = (together: boolean) => {
    if (!guard.blocked()) onAnswer(together);
  };

  return (
    <div
      data-assign-keep
      className="absolute inset-0 z-20 flex flex-col justify-center gap-1.5 rounded-2xl bg-neutral-900/95 p-2 ring-2 ring-inset ring-white/70"
    >
      <p className="truncate text-xs font-medium text-white/70">
        {question.patientName} → {roomName}
      </p>
      <p className="line-clamp-2 text-sm font-semibold leading-tight">
        Together with {question.companionNames.join(" & ")}
        {question.kind === "ask_join_line" && " (next up)"}?
      </p>
      <button
        disabled={busy}
        onClick={() => answer(true)}
        className={`min-h-11 w-full rounded-lg px-2 text-sm font-semibold text-neutral-900 disabled:opacity-40 ${tileKeySolid}`}
      >
        {question.kind === "ask_join_room"
          ? "Yes, send in"
          : "Yes, line up together"}
      </button>
      {question.kind === "ask_join_room" ? (
        <button
          disabled={busy}
          onClick={() => answer(false)}
          className={`mt-0.5 min-h-11 w-full rounded-lg px-2 text-sm font-semibold disabled:opacity-40 ${tileKey}`}
        >
          No, next up
        </button>
      ) : (
        // No "No" here: this room's line is another group, so the
        // answer would be a refusal. Say why instead.
        <p className="text-xs leading-tight text-white/60">
          {roomName} already has someone waiting for it.
        </p>
      )}
      <button
        onClick={onCancel}
        className="min-h-8 w-full rounded-lg px-2 text-xs text-white/60 hover:bg-white/10"
      >
        Cancel
      </button>
    </div>
  );
}
