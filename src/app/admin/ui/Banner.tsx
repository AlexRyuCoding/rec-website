import type { ReactNode } from "react";

const TONE = {
  error: "border-ui-error text-ui-error",
  caution: "border-ui-caution text-ui-caution",
  note: "border-ui-line text-ui-text-2",
} as const;

// A message between panels. It has a surface of its own because the page
// behind it is a photograph; flat, because it is read, not pressed.
export default function Banner({
  tone,
  role,
  children,
  className = "",
}: {
  tone: keyof typeof TONE;
  role?: "alert" | "status";
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      role={role}
      className={`rounded-lg border bg-ui-panel px-3.5 py-2 text-sm ${TONE[tone]} ${className}`}
    >
      {children}
    </p>
  );
}
