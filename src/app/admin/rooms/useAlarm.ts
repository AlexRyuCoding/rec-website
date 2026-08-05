"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { deriveRoomState, RoomRow } from "@/lib/room-status";

const CHIME_REPEAT_MS = 20_000;
const CHIME_MAX_PLAYS = 5;

// Gentle two-tone chime (A5 → E5 sine, soft envelope) generated with the
// Web Audio API — no audio asset. Browsers block audio until the user
// interacts with the page, so the page shows an enable-sound button that
// calls enableSound() (creating the AudioContext inside the tap handler).
function playChime(ctx: AudioContext) {
  const note = (freq: number, at: number) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, ctx.currentTime + at);
    gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + at + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + at + 1.2);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime + at);
    osc.stop(ctx.currentTime + at + 1.3);
  };
  note(880, 0);
  note(659.25, 0.35);
}

export function useAlarm(rooms: RoomRow[], serverNowMs: number) {
  const [soundEnabled, setSoundEnabled] = useState(false);
  const ctxRef = useRef<AudioContext | null>(null);
  // Count, not boolean: a second room completing while one is already
  // alarming restarts the chime cycle so it gets heard too.
  const alarmingCount = rooms.filter((room) => {
    const status = deriveRoomState(room, serverNowMs).status;
    return status === "complete" || status === "overtime";
  }).length;

  const enableSound = useCallback(() => {
    if (!ctxRef.current) {
      ctxRef.current = new AudioContext();
    }
    ctxRef.current.resume();
    setSoundEnabled(true);
  }, []);

  // Chime up to 5 times, 20 s apart, per alarm episode — then stay quiet
  // until the room is cleared (which stops the cycle early) or another
  // room completes (which starts a fresh cycle).
  useEffect(() => {
    if (alarmingCount === 0 || !soundEnabled || !ctxRef.current) return;
    const ctx = ctxRef.current;
    let plays = 0;
    const play = () => {
      playChime(ctx);
      plays += 1;
      if (plays >= CHIME_MAX_PLAYS) clearInterval(interval);
    };
    const interval = setInterval(play, CHIME_REPEAT_MS);
    play();
    return () => clearInterval(interval);
  }, [alarmingCount, soundEnabled]);

  // Keep the display awake where the browser allows it (tablets on a wall).
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const request = async () => {
      try {
        lock = (await navigator.wakeLock?.request("screen")) ?? null;
      } catch {
        // Unsupported or denied — staff set device sleep to "never" instead.
      }
    };
    request();
    const onVisible = () => {
      if (document.visibilityState === "visible") request();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      lock?.release().catch(() => {});
    };
  }, []);

  return { soundEnabled, enableSound };
}
