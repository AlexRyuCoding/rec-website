import type { ReactNode } from "react";

// A small flat label for a KIND of thing ("TV", "Kiosk", "PIN reset").
// Not a status — statuses are pills (StatusPill).
export default function Tag({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-md border border-ui-line bg-ui-panel-2 px-2 py-0.5 text-[13px] font-normal text-ui-text-2 ${className}`}
    >
      {children}
    </span>
  );
}
