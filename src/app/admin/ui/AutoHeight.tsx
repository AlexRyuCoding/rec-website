"use client";
import {
  ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";

const useBrowserLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

// The glide's length (staff-theme.css, .ui-auto-height) and a little more:
// when the height is let go even if the glide never reported its end.
const LET_GO_MS = 340;

// A box whose height glides when what is inside it changes — the fields
// of a newly chosen music source. It measures the height before and after
// the change of `watch` and animates between them, then lets go
// (height: auto), so later changes inside it — a line that wraps, a field
// that appears — are never clipped.
//
// Letting go must not depend on the glide finishing. It is cancelled when
// its tab is hidden mid-way, and during a theme change the cross-fade
// replaces its transition; a box left at a fixed height would cut off
// whatever grows inside it later. So: the end of the glide, its
// cancellation, or a timer — whichever comes first.
//
// A box that is not laid out (inside a hidden tab) is left alone, and
// with "reduce motion" on the height simply changes.
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
  const letGoTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  );

  const letGo = useCallback(() => {
    clearTimeout(letGoTimer.current);
    const box = boxRef.current;
    if (!box) return;
    box.style.height = "auto";
    if (box.offsetHeight > 0) lastHeight.current = box.offsetHeight;
  }, []);

  useBrowserLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    clearTimeout(letGoTimer.current);
    const from = lastHeight.current;
    box.style.height = "auto";
    const to = box.offsetHeight;
    if (to === 0) return;
    lastHeight.current = to;
    const calm = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    if (from === null || from === to || calm) return;
    box.style.height = `${from}px`;
    // Read the height back so the browser starts the glide from it.
    void box.offsetHeight;
    box.style.height = `${to}px`;
    letGoTimer.current = setTimeout(letGo, LET_GO_MS);
  }, [watch, letGo]);

  // The glide ending — or being cancelled, which React 18 has no prop
  // for, hence the listeners.
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const onGlideOver = (e: TransitionEvent) => {
      if (e.target === box && e.propertyName === "height") letGo();
    };
    box.addEventListener("transitionend", onGlideOver);
    box.addEventListener("transitioncancel", onGlideOver);
    return () => {
      box.removeEventListener("transitionend", onGlideOver);
      box.removeEventListener("transitioncancel", onGlideOver);
      clearTimeout(letGoTimer.current);
    };
  }, [letGo]);

  return (
    <div ref={boxRef} className={`ui-auto-height ${className}`}>
      {children}
    </div>
  );
}
