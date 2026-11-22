"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { deriveRoomState, DoctorRow, RoomRow } from "@/lib/room-status";
import { VisitView } from "@/lib/patient-flow";
import { alertSoundStatus, playSound, SoundId } from "@/lib/sounds";
import {
  DoctorWait,
  doorbellStep,
  effectiveDoctors,
  RungAt,
} from "@/lib/alert-escalation";

// The sounds themselves — what each one is and why they differ — live in
// src/lib/sounds.ts. This hook decides WHEN they play:
//
// - timer_done (quick high beeps): a room's timer reached zero. Repeats
//   after every ALARM_PAUSE_MS until staff tap the check.
// - overtime (low two-tone alarm): a room is more than five minutes past
//   zero. Same repeat. If one room is done and another is in overtime,
//   each cycle plays both, one after the other, so neither hides the other.
// - patient_waiting (doorbell ×3): a patient started waiting for the
//   doctor. Rings at the call on the tablets set to that doctor (or to
//   everyone); after five minutes with nobody going it rings on every
//   tablet, and again every three minutes. Rules: alert-escalation.ts.
//
// Browsers block audio until the user interacts with the page, so the
// page shows an enable-sound button that calls enableSound() (creating
// the AudioContext inside the tap handler).
const ALARM_PAUSE_MS = 20_000;
const BETWEEN_SOUNDS_S = 0.5;

const SOUND_PREF_KEY = "rooms-chime-enabled";
// Per device: the doctors this tablet rings the doorbell for (JSON list
// of roster names; empty = everyone).
const DOORBELL_PREF_KEY = "rooms-doorbell-doctors";
// How long sounds must have been blocked before the board says so. Long
// enough that the instant between a tap and audio starting shows nothing.
const SILENT_NOTICE_DELAY_MS = 600;

// ready: the board has loaded its first data. Until then the visit list is
// just empty, and treating that as "nobody waiting" would make every
// patient already waiting look like a new arrival on page load.
export function useAlarm(
  rooms: RoomRow[],
  serverNowMs: number,
  visits: VisitView[] = [],
  ready = true,
  doctors: DoctorRow[] = []
) {
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [audioReady, setAudioReady] = useState(false);
  const ctxRef = useRef<AudioContext | null>(null);
  // The audio context's own state ("running", "suspended", …); null while
  // there is no context yet. This is what tells a board that is ringing
  // from one that only looks ready — see alertSoundStatus.
  const [contextState, setContextState] = useState<string | null>(null);
  // Counts, not booleans: a second room finishing while one is already
  // alarming restarts the cycle so it gets heard too.
  const statuses = rooms.map(
    (room) => deriveRoomState(room, serverNowMs).status
  );
  const completeCount = statuses.filter((st) => st === "complete").length;
  const overtimeCount = statuses.filter((st) => st === "overtime").length;

  const ensureAudio = useCallback(() => {
    if (!ctxRef.current) {
      const created = new AudioContext();
      created.onstatechange = () => setContextState(created.state);
      ctxRef.current = created;
    }
    const ctx = ctxRef.current;
    setContextState(ctx.state);
    ctx
      .resume()
      .then(() => setContextState(ctx.state))
      .catch(() => {});
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

  // The enable choice is remembered per device, so the "turn on" banner
  // only ever appears once.
  useEffect(() => {
    try {
      if (localStorage.getItem(SOUND_PREF_KEY) === "1") setSoundEnabled(true);
    } catch {
      // Storage unavailable — fall back to the banner.
    }
  }, []);

  // Browsers still require one user gesture per page load before audio
  // may start, so while sounds are on, the first tap anywhere on the page
  // (any timer button) unlocks the audio context. The listeners stay
  // attached to re-resume a context the browser suspends later (a tab
  // switch, a locked tablet).
  useEffect(() => {
    if (!soundEnabled) return;
    const unlock = () => ensureAudio();
    document.addEventListener("pointerdown", unlock);
    document.addEventListener("keydown", unlock);
    return () => {
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("keydown", unlock);
    };
  }, [soundEnabled, ensureAudio]);

  // Until that tap the board is silent while looking exactly like one
  // that rings — a wall tablet that reloaded by itself overnight would
  // let a timer end unheard. The page shows a notice for as long as that
  // lasts.
  const soundStatus = alertSoundStatus(soundEnabled, contextState);
  const [silentNotice, setSilentNotice] = useState(false);
  useEffect(() => {
    if (soundStatus !== "blocked") {
      setSilentNotice(false);
      return;
    }
    const t = setTimeout(() => setSilentNotice(true), SILENT_NOTICE_DELAY_MS);
    return () => clearTimeout(t);
  }, [soundStatus]);

  // Ring immediately, then again after every pause, indefinitely — the
  // only thing that stops it is the alarm condition ending (staff clear
  // the room). Any change in how many rooms are done or in overtime
  // restarts the cycle at once, so a second room finishing, or a room
  // tipping into overtime, is heard the moment it happens.
  useEffect(() => {
    if (completeCount + overtimeCount === 0) return;
    if (!soundEnabled || !audioReady) return;
    const ctx = ctxRef.current;
    if (!ctx) return;
    const ring = () => {
      let at = 0;
      if (completeCount > 0) {
        at = playSound(ctx, "timer_done", at) + BETWEEN_SOUNDS_S;
      }
      if (overtimeCount > 0) at = playSound(ctx, "overtime", at);
      return at;
    };
    const lengthS = ring();
    const interval = setInterval(ring, lengthS * 1000 + ALARM_PAUSE_MS);
    return () => clearInterval(interval);
  }, [completeCount, overtimeCount, soundEnabled, audioReady]);

  // Which doctors' patients this tablet rings the doorbell for — a choice
  // remembered per device (the "Sounds" panel). Nothing chosen = everyone.
  const [chosenDoctors, setChosenDoctors] = useState<string[]>([]);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(DOORBELL_PREF_KEY) ?? "[]");
      if (Array.isArray(saved)) {
        setChosenDoctors(saved.filter((n) => typeof n === "string"));
      }
    } catch {
      // Storage unavailable or garbled — ring for everyone.
    }
  }, []);
  const setDoorbellDoctors = useCallback((names: string[]) => {
    setChosenDoctors(names);
    try {
      localStorage.setItem(DOORBELL_PREF_KEY, JSON.stringify(names));
    } catch {
      // Not remembered past this page load.
    }
  }, []);
  const doorbellDoctors = effectiveDoctors(chosenDoctors, doctors);

  // Doctor alert: the doorbell, when a patient starts waiting for the
  // doctor — newly called to a room (including a late partner joining a
  // room whose timer is already running), or put back to "waiting" after
  // a mistaken "Doctor in" — and again, on every tablet, for as long as
  // nobody goes. When it rings, and on which tablets, is decided in
  // src/lib/alert-escalation.ts (doorbellStep); this only asks it, once
  // per render (the board rerenders every second).
  //
  // The first list a device loads is history, not news, and only primes
  // the bookkeeping — and "first list" means the first one after the
  // board has data, not the empty list it renders with while loading.
  const rungAtRef = useRef<RungAt | null>(null);
  useEffect(() => {
    if (!ready) return;
    const waits: DoctorWait[] = visits
      .filter(
        (v) => v.room_id !== null && v.called_at !== null && v.seen_at === null
      )
      .map((v) => ({
        visitId: v.id,
        doctorName: rooms.find((r) => r.id === v.room_id)?.doctor_name ?? null,
        calledAtMs: Date.parse(v.called_at!),
      }));
    const step = doorbellStep(
      waits,
      doorbellDoctors,
      rungAtRef.current ?? new Map(),
      serverNowMs,
      rungAtRef.current === null
    );
    rungAtRef.current = step.rungAt;
    if (step.ring && soundEnabled && audioReady && ctxRef.current) {
      playSound(ctxRef.current, "patient_waiting");
    }
  });

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

  // "Sounds" panel on the board: play one sound on request so staff can
  // learn which is which. A tap, so it may also start audio on a device
  // where it was not on yet.
  const testSound = useCallback(
    (id: SoundId) => {
      enableSound();
      if (ctxRef.current) playSound(ctxRef.current, id);
    },
    [enableSound]
  );

  return {
    soundEnabled,
    silentNotice,
    enableSound,
    testSound,
    doorbellDoctors,
    setDoorbellDoctors,
  };
}
