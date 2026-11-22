"use client";
import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

const ARMED_MS = 800;

const useBrowserLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

// The raised thumb that slides to the chosen item of a switch or of the
// tab row. One absolutely-placed element, sized and moved to whichever
// child of the container carries data-thumb-item={active}. The container
// must be `relative`.
//
// It SLIDES only for a change that follows a press or a key on the
// control (call `arm()` from the items' onPointerDown / onKeyDown).
// Every other time it is simply put in place: on first show, when the
// window or a font changes the sizes, when a hidden tab is opened, and
// when the value changes for a reason the person did not just cause (the
// stored theme being read after load).
export function useThumb(active: string) {
  const containerRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLSpanElement>(null);
  const activeRef = useRef(active);
  // When the control was last pressed. A press only vouches for a change
  // that follows it at once — pressing the item already chosen changes
  // nothing, and must not make some later, unrelated change slide.
  const armedAt = useRef(-Infinity);

  const place = useCallback((slide: boolean) => {
    const container = containerRef.current;
    const thumb = thumbRef.current;
    if (!container || !thumb) return;
    const item = Array.from(
      container.querySelectorAll<HTMLElement>("[data-thumb-item]")
    ).find((el) => el.dataset.thumbItem === activeRef.current);
    // Not laid out (inside a hidden tab): the ResizeObserver below calls
    // again when it is.
    if (!item || item.offsetWidth === 0) return;
    thumb.classList.toggle("ui-thumb-still", !slide);
    thumb.style.width = `${item.offsetWidth}px`;
    thumb.style.height = `${item.offsetHeight}px`;
    thumb.style.transform = `translate(${item.offsetLeft}px, ${item.offsetTop}px)`;
  }, []);

  useBrowserLayoutEffect(() => {
    activeRef.current = active;
    place(performance.now() - armedAt.current < ARMED_MS);
    armedAt.current = -Infinity;
  }, [active, place]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let first = true;
    const observer = new ResizeObserver(() => {
      // The observer reports once as soon as it starts: nothing changed.
      if (first) {
        first = false;
        if (thumbRef.current?.style.width) return;
      }
      place(false);
    });
    observer.observe(container);
    let alive = true;
    document.fonts?.ready
      .then(() => {
        if (alive) place(false);
      })
      .catch(() => {});
    return () => {
      alive = false;
      observer.disconnect();
    };
  }, [place]);

  const arm = useCallback(() => {
    armedAt.current = performance.now();
  }, []);

  return { containerRef, thumbRef, arm };
}
