"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { deriveRoomState, RoomRow } from "@/lib/room-status";

const CHIME_REPEAT_MS = 45_000;

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
  const alarming = rooms.some((room) => {
    const status = deriveRoomState(room, serverNowMs).status;
    return status === "complete" || status === "overtime";
  });

  const enableSound = useCallback(() => {
    if (!ctxRef.current) {
      ctxRef.current = new AudioContext();
    }
    ctxRef.current.resume();
    setSoundEnabled(true);
  }, []);

  useEffect(() => {
    if (!alarming || !soundEnabled || !ctxRef.current) return;
    const ctx = ctxRef.current;
    playChime(ctx);
    const interval = setInterval(() => playChime(ctx), CHIME_REPEAT_MS);
    return () => clearInterval(interval);
  }, [alarming, soundEnabled]);

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
