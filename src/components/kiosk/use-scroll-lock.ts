"use client";

import { useEffect } from "react";

// Pins the kiosk page in place: it must not scroll, bounce, pan or zoom in
// any direction, whatever is used to try — a finger, a mouse wheel, a
// trackpad, a pinch, a double tap. A patient who is unsure of a touch
// screen drags and pinches by accident; if the page moves, the number pad
// is no longer where they were aiming, or half of it is off screen with no
// obvious way back.
//
// Three layers, because no single one covers every browser:
//
// 1. CSS (globals.css, `html.kiosk-locked`): nothing overflows, overscroll
//    is off, and the body is fixed so iPad Safari has nothing to
//    rubber-band.
// 2. touch-action: none on the kiosk itself (set by the page): tells the
//    browser not to start a pan or pinch from a touch there at all.
// 3. This hook: cancels the wheel / touch-move / pinch-gesture events that
//    would move or zoom the page, for the browsers and input devices the
//    CSS does not reach (trackpad pinch arrives as a ctrl+wheel; Safari
//    has its own gesture events). Buttons are unaffected — they act on
//    pointer events, which cancelling these does not touch.
export function useScrollLock() {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("kiosk-locked");

    const cancel = (e: Event) => {
      if (e.cancelable) e.preventDefault();
    };
    // If something does shift the page (iPad Safari slides it up to show a
    // text field above the on-screen keyboard), put it back once that
    // field is left.
    const settle = () => {
      if (window.scrollX !== 0 || window.scrollY !== 0) window.scrollTo(0, 0);
    };

    const opts: AddEventListenerOptions = { passive: false };
    window.addEventListener("wheel", cancel, opts);
    window.addEventListener("touchmove", cancel, opts);
    // Safari-only pinch events.
    window.addEventListener("gesturestart", cancel, opts);
    window.addEventListener("gesturechange", cancel, opts);
    window.addEventListener("gestureend", cancel, opts);
    window.addEventListener("focusout", settle);
    window.addEventListener("scroll", settle);

    return () => {
      root.classList.remove("kiosk-locked");
      window.removeEventListener("wheel", cancel, opts);
      window.removeEventListener("touchmove", cancel, opts);
      window.removeEventListener("gesturestart", cancel, opts);
      window.removeEventListener("gesturechange", cancel, opts);
      window.removeEventListener("gestureend", cancel, opts);
      window.removeEventListener("focusout", settle);
      window.removeEventListener("scroll", settle);
    };
  }, []);
}
