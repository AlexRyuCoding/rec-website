"use client";
import { ReactNode, useEffect, useLayoutEffect, useRef } from "react";

const useBrowserLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

// A box whose height glides when what is inside it changes — the fields
// of a newly chosen music source, a table that opens. It measures the
// height before and after the change of `watch` and animates between
// them, then lets go (height: auto), so later changes inside it — a line
// that wraps, an error that appears — are never clipped.
//
// With "reduce motion" on, the height simply changes.
export default function AutoHeight({
  watch,
  children,
  className = "",
}: {
  watch: string | number | boolean;
  children: ReactNode;
  className?: string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const lastHeight = useRef<number | null>(null);

  useBrowserLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const from = lastHeight.current;
    box.style.height = "auto";
    const to = box.offsetHeight;
    lastHeight.current = to;
    const calm = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    if (from === null || from === to || calm) return;
    box.style.height = `${from}px`;
    // Read the height back so the browser starts the glide from it.
    void box.offsetHeight;
    box.style.height = `${to}px`;
  }, [watch]);

  return (
    <div
      ref={boxRef}
      className={`ui-auto-height ${className}`}
      onTransitionEnd={(e) => {
        if (e.target === boxRef.current && e.propertyName === "height") {
          e.currentTarget.style.height = "auto";
          lastHeight.current = e.currentTarget.offsetHeight;
        }
      }}
    >
      {children}
    </div>
  );
}
