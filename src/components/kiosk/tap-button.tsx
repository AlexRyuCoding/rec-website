"use client";

import { useRef } from "react";
import { kioskTapGuard } from "@/lib/tap-guard";

// How far outside the button a finger may lift and still count.
const SLOP_PX = 14;

// A kiosk button for deliberate choices (Continue, Yes, No, Go back).
//
// Unlike the number pad, these should not fire on touch-down — a brushed
// "Yes" must not check someone in. But the browser's own "click" is too
// strict for unsteady hands: it is cancelled when the finger slides a
// little between landing and lifting. So this fires when the finger LIFTS
// while still on (or just beside) the button, however much it wandered in
// between. Keyboard and assistive-technology clicks work as usual.
export default function TapButton({
  onTap,
  disabled = false,
  className = "",
  children,
  ariaLabel,
}: {
  onTap: () => void;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
  ariaLabel?: string;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  // Set when a pointer lift has already fired the tap, so the click the
  // browser may add right after is ignored.
  const pointerHandled = useRef(false);
  const releaseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setPressed = (on: boolean) => {
    if (!ref.current) return;
    if (on) ref.current.dataset.pressed = "true";
    else delete ref.current.dataset.pressed;
  };

  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled}
      aria-label={ariaLabel}
      onPointerDown={(e) => {
        if (disabled) return;
        if (e.pointerType === "mouse" && e.button !== 0) return;
        if (releaseTimer.current) clearTimeout(releaseTimer.current);
        pointerHandled.current = false;
        // Keep receiving this finger's events even if it slides off.
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // Capture is a nicety; the lift still reaches us without it.
        }
        setPressed(true);
      }}
      onPointerUp={(e) => {
        const wasPressed = ref.current?.dataset.pressed === "true";
        setPressed(false);
        if (disabled || !wasPressed) return;
        const r = e.currentTarget.getBoundingClientRect();
        const inside =
          e.clientX >= r.left - SLOP_PX &&
          e.clientX <= r.right + SLOP_PX &&
          e.clientY >= r.top - SLOP_PX &&
          e.clientY <= r.bottom + SLOP_PX;
        if (!inside) return;
        // The screen has only just changed: this is the tail of a double
        // tap, not an answer to what is now showing.
        if (kioskTapGuard.blocked()) return;
        pointerHandled.current = true;
        releaseTimer.current = setTimeout(() => {
          pointerHandled.current = false;
        }, 400);
        onTap();
      }}
      onPointerCancel={() => setPressed(false)}
      // Stops the browser from following a touch with its own delayed
      // "click". By then this button may have been replaced by another in
      // the same place, which would receive that click as a ghost press.
      onTouchEnd={(e) => e.preventDefault()}
      onClick={() => {
        if (pointerHandled.current) return;
        if (disabled || kioskTapGuard.blocked()) return;
        onTap();
      }}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        touchAction: "manipulation",
        WebkitTapHighlightColor: "transparent",
        WebkitTouchCallout: "none",
      }}
      className={`select-none outline-none transition-[transform,background-color,opacity] duration-100 focus-visible:ring-4 focus-visible:ring-gold disabled:opacity-40 data-[pressed=true]:scale-[0.97] ${className}`}
    >
      {children}
    </button>
  );
}
