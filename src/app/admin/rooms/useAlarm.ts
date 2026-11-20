"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { deriveRoomState, RoomRow } from "@/lib/room-status";
import { VisitView } from "@/lib/patient-flow";

// Each alarm "instance" is a burst of 3 chimes; instances repeat with a
// 20 s pause in between, forever, until the room is cleared.
const CHIMES_PER_INSTANCE = 3;
const CHIME_SPACING_S = 1.6;
const INSTANCE_PAUSE_MS = 20_000;
const INSTANCE_LENGTH_MS = CHIMES_PER_INSTANCE * CHIME_SPACING_S * 1000;

// Gentle two-tone chime (A5 → E5 sine, soft envelope) generated with the
// Web Audio API — no audio asset. Browsers block audio until the user
// interacts with the page, so the page shows an enable-sound button that
// calls enableSound() (creating the AudioContext inside the tap handler).
function playChime(ctx: AudioContext, atSeconds: number) {
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
  note(880, atSeconds);
  note(659.25, atSeconds + 0.35);
}

// One instance = 3 chimes back to back, scheduled on the audio clock.
function playInstance(ctx: AudioContext) {
  for (let i = 0; i < CHIMES_PER_INSTANCE; i++) {
    playChime(ctx, i * CHIME_SPACING_S);
  }
}

// "A patient is waiting for the doctor": a rising two-tone (E5 → A5), the
// mirror of the falling "remove needles" chime so the two are never
// confused, rung three times. It rings once per new alert and then stops —
// the banner at the top of the board is what persists.
const ARRIVAL_RINGS = 3;
const ARRIVAL_RING_SPACING_S = 1.1;

function playArrivalAlert(ctx: AudioContext) {
  const note = (freq: number, at: number) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, ctx.currentTime + at);
    gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + at + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + at + 0.9);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime + at);
    osc.stop(ctx.currentTime + at + 1);
  };
  for (let ring = 0; ring < ARRIVAL_RINGS; ring++) {
    const at = ring * ARRIVAL_RING_SPACING_S;
    note(659.25, at);
    note(880, at + 0.25);
  }
}

const SOUND_PREF_KEY = "rooms-chime-enabled";

// ready: the board has loaded its first data. Until then the visit list is
// just empty, and treating that as "nobody waiting" would make every
// patient already waiting look like a new arrival on page load.
export function useAlarm(
  rooms: RoomRow[],
  serverNowMs: number,
  visits: VisitView[] = [],
  ready = true
) {
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [audioReady, setAudioReady] = useState(false);
  const ctxRef = useRef<AudioContext | null>(null);
  // Count, not boolean: a second room completing while one is already
  // alarming restarts the chime cycle so it gets heard too.
  const alarmingCount = rooms.filter((room) => {
    const status = deriveRoomState(room, serverNowMs).status;
    return status === "complete" || status === "overtime";
  }).length;

  const ensureAudio = useCallback(() => {
    if (!ctxRef.current) {
      ctxRef.current = new AudioContext();
    }
    ctxRef.current.resume().catch(() => {});
    setAudioReady(true);
  }, []);

  const enableSound = useCallback(() => {
    try {
      localStorage.setItem(SOUND_PREF_KEY, "1");
    } catch {
      // Storage unavailable (private mode) — banner returns next session.
    }
    ensureAudio();
    setSoundEnabled(true);
  }, [ensureAudio]);

  // The enable choice is remembered per device, so the banner only ever
  // appears once. Browsers still require one user gesture per page load
  // before audio may start — with the preference saved, the first tap
  // anywhere on the page (any timer button) unlocks the audio context.
  // The listeners stay attached to re-resume a context the browser
  // suspends later (e.g. after a tab switch).
  useEffect(() => {
    let saved = false;
    try {
      saved = localStorage.getItem(SOUND_PREF_KEY) === "1";
    } catch {
      // Storage unavailable — fall back to the banner.
    }
    if (!saved) return;
    setSoundEnabled(true);
    const unlock = () => ensureAudio();
    document.addEventListener("pointerdown", unlock);
    document.addEventListener("keydown", unlock);
    return () => {
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("keydown", unlock);
    };
  }, [ensureAudio]);

  // Ring a 3-chime instance immediately, then again after every 20 s
  // pause, indefinitely — the only thing that stops it is the alarm
  // condition ending (staff clears the room). A second room completing
  // restarts the rhythm so it gets heard too.
  useEffect(() => {
    if (alarmingCount === 0 || !soundEnabled || !audioReady) return;
    const ctx = ctxRef.current;
    if (!ctx) return;
    playInstance(ctx);
    const interval = setInterval(
      () => playInstance(ctx),
      INSTANCE_LENGTH_MS + INSTANCE_PAUSE_MS
    );
    return () => clearInterval(interval);
  }, [alarmingCount, soundEnabled, audioReady]);

  // Doctor alert: three rings whenever a patient starts waiting for the
  // doctor — newly called to a room (including a late partner joining a
  // room whose timer is already running), or put back to "waiting" after
  // a mistaken "Doctor in". Tracked by visit id. The first list a device
  // loads is history, not news, and only primes the set — and "first
  // list" means the first one after the board has data, not the empty
  // list it renders with while loading.
  const waitingIdsRef = useRef<Set<string> | null>(null);
  const waitingKey = visits
    .filter(
      (v) => v.room_id !== null && v.called_at !== null && v.seen_at === null
    )
    .map((v) => v.id)
    .sort()
    .join(",");
  useEffect(() => {
    if (!ready) return;
    const current = new Set(waitingKey ? waitingKey.split(",") : []);
    const previous = waitingIdsRef.current;
    waitingIdsRef.current = current;
    if (!previous) return;
    const hasNew = [...current].some((id) => !previous.has(id));
    if (!hasNew || !soundEnabled || !audioReady || !ctxRef.current) return;
    playArrivalAlert(ctxRef.current);
  }, [waitingKey, ready, soundEnabled, audioReady]);

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
