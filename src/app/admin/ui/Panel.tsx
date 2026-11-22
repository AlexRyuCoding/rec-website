import type { HTMLAttributes } from "react";

// A surface that holds work: filled, hairline edge, raised on a hard
// ledge. Opaque on purpose — it sits on the photo, and nothing is read
// straight off the photo.
export default function Panel({
  as: Element = "div",
  className = "",
  ...rest
}: HTMLAttributes<HTMLElement> & { as?: "div" | "section" }) {
  return (
    <Element
      className={`min-w-0 rounded-xl border border-ui-line bg-ui-panel shadow-lift-2 ${className}`}
      {...rest}
    />
  );
}
