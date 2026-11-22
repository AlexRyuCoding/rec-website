import type { ReactNode } from "react";
import { Check, TriangleAlert, X } from "lucide-react";
import type { CheckinStatus } from "@/lib/visit-stats";

// How a visit's status looks. Each of the seven has its own colour AND a
// shape that says which family it is in, so no status is told apart by
// colour alone:
// - still on the rooms board → a filled pill with a dot;
// - finished or removed → grey, with a mark;
// - never closed (nobody tapped "Room ready") → an outline with a warning.
export interface PillLook {
  tone:
    | "waiting"
    | "next"
    | "called"
    | "doctor"
    | "finished"
    | "removed"
    | "open";
  mark: "dot" | "check" | "x" | "alert";
}

const LOOK: Record<CheckinStatus, PillLook> = {
  waiting: { tone: "waiting", mark: "dot" },
  next_up: { tone: "next", mark: "dot" },
  called: { tone: "called", mark: "dot" },
  with_doctor: { tone: "doctor", mark: "dot" },
  finished: { tone: "finished", mark: "check" },
  removed: { tone: "removed", mark: "x" },
  not_closed: { tone: "open", mark: "alert" },
};

export function pillLook(status: CheckinStatus): PillLook {
  return LOOK[status];
}

const TONE: Record<PillLook["tone"], string> = {
  waiting: "border-transparent bg-ui-st-waiting-bg text-ui-st-waiting",
  next: "border-transparent bg-ui-st-next-bg text-ui-st-next",
  called: "border-transparent bg-ui-st-called-bg text-ui-st-called",
  doctor: "border-transparent bg-ui-st-doctor-bg text-ui-st-doctor",
  finished: "border-ui-line bg-ui-panel-2 text-ui-text-2",
  removed: "border-dashed border-ui-line-strong text-ui-text-3",
  open: "border-ui-st-open text-ui-st-open",
};

function Mark({ mark }: { mark: PillLook["mark"] }) {
  const icon = { className: "size-[13px] shrink-0", strokeWidth: 2.6 };
  if (mark === "check") return <Check aria-hidden {...icon} />;
  if (mark === "x") return <X aria-hidden {...icon} />;
  if (mark === "alert") return <TriangleAlert aria-hidden {...icon} />;
  return (
    <span aria-hidden className="size-2 shrink-0 rounded-full bg-current" />
  );
}

// A status is a pill, and pills are never pressed. When a refresh changes
// a visit's status the colours cross-fade (the row stays where it is).
export default function StatusPill({
  status,
  children,
}: {
  status: CheckinStatus;
  children: ReactNode;
}) {
  const look = pillLook(status);
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border py-[3px] pl-2 pr-2.5 text-[13px] font-semibold transition-colors duration-300 ${TONE[look.tone]}`}
    >
      <Mark mark={look.mark} />
      {children}
    </span>
  );
}
