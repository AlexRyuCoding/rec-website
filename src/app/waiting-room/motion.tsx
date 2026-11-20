"use client";
import {
  CSSProperties,
  ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Lingering, mergeLingering, nextDeparted } from "@/lib/lingering";

// Building blocks for the waiting-room TV's motion (styles: board.css).
// React removes an element the instant its data is gone; these keep it
// for the length of its exit animation so it can leave gracefully.

// How long a block and a call row take to leave. board.css reads the same
// numbers through the variables below, so script and styles agree.
export const OUT_MS = 450;
export const ROW_OUT_MS = 800;

export const motionVars = {
  "--tv-out-ms": `${OUT_MS}ms`,
  "--tv-row-out-ms": `${ROW_OUT_MS}ms`,
} as CSSProperties;

// The server renders this page too, where layout effects do not exist.
const useBeforePaint =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

// Shows its children while `show` is true. They fade up into place when
// it turns true and fade away when it turns false — still showing what
// they last showed, even though the data behind them is already gone.
export function Appear({
  show,
  children,
  className = "",
  delayMs = 0,
}: {
  show: boolean;
  children: ReactNode;
  className?: string;
  // Lets several blocks arrive one after another instead of all at once.
  delayMs?: number;
}) {
  const [lingering, setLingering] = useState(false);
  const last = useRef<ReactNode>(children);
  if (show) last.current = children;

  useEffect(() => {
    if (show) {
      setLingering(true);
      return;
    }
    const timer = setTimeout(() => setLingering(false), OUT_MS);
    return () => clearTimeout(timer);
  }, [show]);

  if (!show && !lingering) return null;
  return (
    <div
      className={`${className} ${show ? "tv-in" : "tv-out"}`}
      style={show && delayMs ? { animationDelay: `${delayMs}ms` } : undefined}
    >
      {show ? children : last.current}
    </div>
  );
}

// Shows one view at a time. When `viewKey` changes, the old view fades
// away first (frozen as it last looked) and only then does the new one
// fade in — two big pieces of text never overlap.
export function Swap({
  viewKey,
  children,
  className = "",
}: {
  viewKey: string;
  children: ReactNode;
  className?: string;
}) {
  const [shownKey, setShownKey] = useState(viewKey);
  const last = useRef<ReactNode>(children);
  const changing = viewKey !== shownKey;
  if (!changing) last.current = children;

  useEffect(() => {
    if (viewKey === shownKey) return;
    const timer = setTimeout(() => setShownKey(viewKey), OUT_MS);
    return () => clearTimeout(timer);
  }, [viewKey, shownKey]);

  return (
    <div
      key={shownKey}
      className={`${className} ${changing ? "tv-out" : "tv-in"}`}
    >
      {changing ? last.current : children}
    </div>
  );
}

// A list whose removed items stay for `lingerMs`, marked as leaving and
// kept in their place (see mergeLingering).
export function useLingering<T extends { id: string }>(
  items: T[],
  lingerMs: number,
  rank: (item: T) => number
): Lingering<T>[] {
  const [departed, setDeparted] = useState<T[]>([]);
  const before = useRef<T[]>(items);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const latest = useRef(items);
  latest.current = items;

  // Before the browser paints the change, so a row that just left the
  // data is never missing for a frame before it starts to fade.
  const idsKey = items.map((item) => item.id).join(",");
  useBeforePaint(() => {
    const now = latest.current;
    const previous = before.current;
    before.current = now;

    const present = new Set(now.map((item) => item.id));
    for (const [id, timer] of timers.current) {
      if (present.has(id)) {
        clearTimeout(timer);
        timers.current.delete(id);
      }
    }
    setDeparted((current) => {
      const next = nextDeparted(current, previous, now);
      const same =
        next.length === current.length &&
        next.every((item, i) => item.id === current[i].id);
      return same ? current : next;
    });
    for (const item of previous) {
      if (present.has(item.id) || timers.current.has(item.id)) continue;
      timers.current.set(
        item.id,
        setTimeout(() => {
          timers.current.delete(item.id);
          setDeparted((current) => current.filter((d) => d.id !== item.id));
        }, lingerMs)
      );
    }
  }, [idsKey, lingerMs]);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    };
  }, []);

  return mergeLingering(items, departed, rank);
}
