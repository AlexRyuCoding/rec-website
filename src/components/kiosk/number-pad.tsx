"use client";

import { useRef } from "react";
import { Delete } from "lucide-react";
import type { PadKey } from "@/lib/kiosk-entry";
import { kioskTapGuard } from "@/lib/tap-guard";

// How long a key stays visibly lit after the finger lands, even for the
// quickest tap — the patient has to see that the press registered.
const MIN_PRESSED_MS = 140;

// The kiosk's on-screen number pad. Built for people who are not used to
// touch screens, which decides how a press is detected:
//
// - A key fires the moment the finger TOUCHES it (pointerdown), not when
//   it lifts. The browser's "click" needs a clean tap — finger down and up
//   in the same spot, one finger at a time — and silently swallows
//   anything else. Shaky fingers that drift, fingers that press and hold,
//   and a second finger landing before the first has lifted all lose
//   digits that way. Touch-down never does, and each finger counts.
// - touch-action: manipulation switches off double-tap-to-zoom, so the
//   same number twice in a row ("2200") is two presses, not a zoom.
// - No hover styling: on a touch screen "hover" sticks to the last key
//   pressed and looks like a selection.
//
// The component is deliberately defined at module level. Defining it
// inside the screen that uses it would give React a new component type on
// every render and rebuild all twelve buttons after each digit — while a
// finger might still be on one of them.
export default function NumberPad({
  onKey,
  disabled = false,
}: {
  onKey: (key: PadKey) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className="grid w-full select-none grid-cols-3 gap-[min(1.4dvh,12px)]"
      style={{ touchAction: "manipulation" }}
    >
      {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
        <PadButton
          key={d}
          disabled={disabled}
          onPress={() => onKey({ type: "digit", digit: d })}
          variant="digit"
        >
          {d}
        </PadButton>
      ))}
      <PadButton
        disabled={disabled}
        onPress={() => onKey({ type: "clear" })}
        variant="action"
        ariaLabel="Clear all numbers"
      >
        Clear
      </PadButton>
      <PadButton
        disabled={disabled}
        onPress={() => onKey({ type: "digit", digit: "0" })}
        variant="digit"
      >
        0
      </PadButton>
      <PadButton
        disabled={disabled}
        onPress={() => onKey({ type: "backspace" })}
        variant="action"
        ariaLabel="Delete the last number"
      >
        <Delete aria-hidden="true" className="size-[1.1em]" />
        <span>Delete</span>
      </PadButton>
    </div>
  );
}

function PadButton({
  children,
  onPress,
  disabled,
  variant,
  ariaLabel,
}: {
  children: React.ReactNode;
  onPress: () => void;
  disabled: boolean;
  variant: "digit" | "action";
  ariaLabel?: string;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  // True from a pointer landing on the key until shortly after it lifts,
  // so the click the browser synthesizes afterwards is not counted as a
  // second press. Clicks that arrive with no pointer involved (keyboard
  // Enter or Space, assistive technology) are real presses and go through.
  const pointerHandled = useRef(false);
  const releaseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressedAt = useRef(0);

  const light = () => {
    pressedAt.current = Date.now();
    if (ref.current) ref.current.dataset.pressed = "true";
  };
  const unlight = () => {
    const wait = Math.max(0, MIN_PRESSED_MS - (Date.now() - pressedAt.current));
    setTimeout(() => {
      if (ref.current) delete ref.current.dataset.pressed;
    }, wait);
  };
  const pointerDown = () => {
    // A new press cancels the previous press's pending release, so a
    // long hold can never have its flag cleared out from under it.
    if (releaseTimer.current) clearTimeout(releaseTimer.current);
    pointerHandled.current = true;
  };
  const pointerGone = () => {
    unlight();
    // The synthesized click, when there is one, follows the lift almost
    // at once. After that window the flag must not linger and swallow a
    // later keyboard press.
    if (releaseTimer.current) clearTimeout(releaseTimer.current);
    releaseTimer.current = setTimeout(() => {
      pointerHandled.current = false;
    }, 400);
  };

  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled}
      aria-label={ariaLabel}
      onPointerDown={(e) => {
        if (disabled || kioskTapGuard.blocked()) return;
        if (e.pointerType === "mouse" && e.button !== 0) return;
        pointerDown();
        light();
        onPress();
      }}
      onPointerUp={pointerGone}
      onPointerCancel={pointerGone}
      onPointerLeave={pointerGone}
      // No browser-made "click" after a touch (see TapButton).
      onTouchEnd={(e) => e.preventDefault()}
      onClick={() => {
        if (pointerHandled.current) return;
        if (disabled || kioskTapGuard.blocked()) return;
        light();
        unlight();
        onPress();
      }}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        WebkitTapHighlightColor: "transparent",
        WebkitTouchCallout: "none",
      }}
      className={`flex h-[clamp(50px,8.6dvh,96px)] items-center justify-center gap-2 rounded-2xl font-medium landscape:h-[clamp(50px,13.5dvh,112px)] outline-none transition-[transform,background-color,opacity] duration-100 focus-visible:ring-4 focus-visible:ring-gold disabled:opacity-40 data-[pressed=true]:scale-95 ${
        variant === "digit"
          ? "bg-cream text-[clamp(1.75rem,5dvh,3rem)] text-ink data-[pressed=true]:bg-gold"
          : "border-2 border-cream/50 text-[clamp(1rem,2.6dvh,1.4rem)] text-cream data-[pressed=true]:bg-cream/25"
      }`}
    >
      {children}
    </button>
  );
}
