"use client";

// Four boxes showing how far a PIN entry has got. The box the next number
// will land in is outlined in gold, so "where am I?" is answered by the
// screen rather than by counting dots.
//
// reveal: show the digits themselves (creating a PIN, where seeing what
// you chose matters) or hide them as dots (signing in).
export default function DigitSlots({
  value,
  length = 4,
  reveal,
  active,
  tone = "normal",
  size = "lg",
  label,
}: {
  value: string;
  length?: number;
  reveal: boolean;
  // This entry is the one the pad is typing into.
  active: boolean;
  tone?: "normal" | "done" | "error";
  size?: "lg" | "md";
  // What the entry is, for screen readers ("Your PIN").
  label: string;
}) {
  const box =
    size === "lg"
      ? "size-[clamp(48px,8dvh,76px)] text-[clamp(1.6rem,4.4dvh,2.6rem)]"
      : "size-[clamp(40px,6.2dvh,60px)] text-[clamp(1.3rem,3.4dvh,2rem)]";
  return (
    <div
      role="status"
      aria-label={`${label}: ${value.length} of ${length} numbers entered`}
      className="flex justify-center gap-[min(1.6dvh,14px)]"
    >
      {Array.from({ length }, (_, i) => {
        const filled = i < value.length;
        const next = active && i === value.length;
        return (
          <div
            key={i}
            data-filled={filled}
            className={`flex items-center justify-center rounded-xl border-2 font-semibold tabular-nums transition-colors duration-150 ${box} ${
              tone === "error"
                ? "border-error text-error"
                : tone === "done"
                  ? "border-brand-primary bg-brand-primary/15 text-cream"
                  : next
                    ? "animate-pulse border-gold bg-gold/10 text-cream"
                    : filled
                      ? "border-cream bg-cream/10 text-cream"
                      : "border-cream/30 text-cream"
            }`}
          >
            {filled ? (
              reveal ? (
                value[i]
              ) : (
                <span className="size-[0.45em] rounded-full bg-current" />
              )
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
