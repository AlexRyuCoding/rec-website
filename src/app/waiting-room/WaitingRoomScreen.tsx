"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchWithTimeout } from "@/lib/fetch-timeout";
import { DUCK_MS, MUSIC_OFF, TvMusic } from "@/lib/music";
import { CALL_DISPLAY_MS } from "@/lib/patient-flow";
import { playSound } from "@/lib/sounds";
import { createBrowserClient } from "@/lib/supabase-browser";
import { FLOW_EVENT, ROOMS_CHANNEL, ROOMS_EVENT } from "@/lib/rooms-realtime";
import CallBoard, { BoardPhase, Call } from "./CallBoard";
import { useMusic } from "./music/useMusic";

const POLL_LIVE_MS = 10_000;
const POLL_PAIRING_MS = 5_000;
const POLL_ERROR_MS = 30_000;
// A request that never settles would stop the poll loop for good (each
// poll waits for the last one), so every request gives up after this.
const REQUEST_TIMEOUT_MS = 8_000;

// Data, pairing and sound for the waiting-room TV. The page is a public
// shell with no patient data in it; everything comes from
// /api/display/calls, which answers only a paired screen (or signed-in
// staff). The screen walks itself through pairing and recovers from
// anything on its own — nobody is standing in front of it to help:
//   401 -> ask for a pairing code and show it
//   403 -> still waiting for staff to type the code in
//   200 -> live
// Polling alone keeps it correct; realtime hints only make it faster.
export default function WaitingRoomScreen() {
  const [phase, setPhase] = useState<BoardPhase>({ kind: "loading" });
  const [calls, setCalls] = useState<Call[]>([]);
  const [reconnecting, setReconnecting] = useState(false);
  const [soundReady, setSoundReady] = useState(false);
  const [tickMs, setTickMs] = useState(() => Date.now());
  const offsetRef = useRef(0);
  const phaseRef = useRef<BoardPhase["kind"]>("loading");
  const loadingRef = useRef(false);
  const ctxRef = useRef<AudioContext | null>(null);
  const knownCallIdsRef = useRef<Set<string> | null>(null);
  const [music, setMusic] = useState<TvMusic>(MUSIC_OFF);
  const musicKeyRef = useRef(JSON.stringify(MUSIC_OFF));
  const [ducked, setDucked] = useState(false);
  const duckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The setting arrives with every poll; only a real change may reach the
  // players, or the music would restart every ten seconds.
  const applyMusic = useCallback((next: TvMusic) => {
    const key = JSON.stringify(next);
    if (key === musicKeyRef.current) return;
    musicKeyRef.current = key;
    setMusic(next);
  }, []);

  // Drop the music under the chime while a patient is being called.
  const duck = useCallback(() => {
    setDucked(true);
    if (duckTimerRef.current) clearTimeout(duckTimerRef.current);
    duckTimerRef.current = setTimeout(() => setDucked(false), DUCK_MS);
  }, []);
  useEffect(
    () => () => {
      if (duckTimerRef.current) clearTimeout(duckTimerRef.current);
    },
    []
  );

  const enter = useCallback((next: BoardPhase) => {
    phaseRef.current = next.kind;
    setPhase(next);
  }, []);

  const load = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      const res = await fetchWithTimeout(
        "/api/display/calls",
        { cache: "no-store" },
        REQUEST_TIMEOUT_MS
      );
      if (res.ok) {
        const data = (await res.json()) as {
          calls: Call[];
          serverTime: string;
          // Left out when the server could not read the setting: keep
          // playing whatever is playing.
          music?: TvMusic;
        };
        offsetRef.current = Date.parse(data.serverTime) - Date.now();
        setCalls(data.calls);
        if (data.music) applyMusic(data.music);
        setReconnecting(false);
        enter({ kind: "live" });
        return;
      }
      if (res.status === 403) {
        const data = (await res.json().catch(() => ({}))) as { code?: string };
        if (data.code) enter({ kind: "pairing", code: data.code });
        return;
      }
      if (res.status === 401) {
        // Not paired (first run, revoked, or the code expired): drop any
        // names on screen and ask for a fresh code.
        setCalls([]);
        knownCallIdsRef.current = null;
        // A revoked screen goes quiet as well as blank.
        applyMusic(MUSIC_OFF);
        const pair = await fetchWithTimeout(
          "/api/display/pair",
          { method: "POST" },
          REQUEST_TIMEOUT_MS
        );
        const data = (await pair.json().catch(() => ({}))) as {
          code?: string;
        };
        if (pair.ok && data.code) enter({ kind: "pairing", code: data.code });
        else if (!pair.ok) enter({ kind: "error" });
        return;
      }
      throw new Error("calls fetch failed");
    } catch {
      // Live: keep what is on screen (calls still expire by the clock)
      // and flag it. Anything else: say so and keep retrying.
      if (phaseRef.current === "live") setReconnecting(true);
      else if (phaseRef.current !== "pairing") enter({ kind: "error" });
    } finally {
      loadingRef.current = false;
    }
  }, [enter, applyMusic]);

  // Poll forever, at a pace that suits the current phase.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const loop = async () => {
      await load();
      if (cancelled) return;
      const delay =
        phaseRef.current === "live"
          ? POLL_LIVE_MS
          : phaseRef.current === "pairing"
            ? POLL_PAIRING_MS
            : POLL_ERROR_MS;
      timer = setTimeout(loop, delay);
    };
    loop();
    const onWake = () => void load();
    window.addEventListener("online", onWake);
    document.addEventListener("visibilitychange", onWake);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      window.removeEventListener("online", onWake);
      document.removeEventListener("visibilitychange", onWake);
    };
  }, [load]);

  // Realtime hints (empty payloads — no patient data travels on them)
  // make a call appear at once instead of on the next poll. TV browsers
  // vary, and WebKit throws synchronously from a blocked WebSocket, so
  // the subscribe is guarded and entirely optional.
  useEffect(() => {
    let supabase: ReturnType<typeof createBrowserClient> | null = null;
    let channel: ReturnType<
      ReturnType<typeof createBrowserClient>["channel"]
    > | null = null;
    const onHint = () => {
      if (phaseRef.current === "live") void load();
    };
    try {
      supabase = createBrowserClient();
      channel = supabase
        .channel(ROOMS_CHANNEL)
        .on("broadcast", { event: FLOW_EVENT }, onHint)
        .on("broadcast", { event: ROOMS_EVENT }, onHint)
        .subscribe();
    } catch {
      channel = null;
    }
    return () => {
      if (supabase && channel) {
        try {
          supabase.removeChannel(channel);
        } catch {
          // Teardown must never crash the screen.
        }
      }
    };
  }, [load]);

  useEffect(() => {
    const t = setInterval(() => setTickMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Browsers only allow sound after a key press or tap on the page. Any
  // remote key counts; until then the board shows a small hint. The
  // listeners stay on to resume a context the browser suspends later.
  useEffect(() => {
    const unlock = () => {
      try {
        const first = !ctxRef.current;
        if (!ctxRef.current) ctxRef.current = new AudioContext();
        ctxRef.current.resume().catch(() => {});
        setSoundReady(true);
        // Play the chime once when sound is switched on: whoever pressed
        // the button hears that it worked, and what a call will sound like.
        if (first) {
          playSound(ctxRef.current, "room_ready");
          duck();
        }
      } catch {
        // No Web Audio on this device — the screen stays visual-only.
      }
    };
    document.addEventListener("keydown", unlock);
    document.addEventListener("pointerdown", unlock);
    return () => {
      document.removeEventListener("keydown", unlock);
      document.removeEventListener("pointerdown", unlock);
    };
  }, [duck]);

  // Keep the TV awake where the browser allows it.
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const request = async () => {
      try {
        lock = (await navigator.wakeLock?.request("screen")) ?? null;
      } catch {
        // Unsupported or denied — the TV's own sleep setting must be off.
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

  // A call drops off by the clock even if the network is down.
  const nowMs = tickMs + offsetRef.current;
  const visibleCalls = calls.filter(
    (c) => nowMs - Date.parse(c.calledAt) < CALL_DISPLAY_MS
  );

  // Chime once per newly called patient. The first list after (re)pairing
  // or page load is not news.
  const callIdsKey = visibleCalls.map((c) => c.id).join(",");
  useEffect(() => {
    if (phase.kind !== "live") return;
    const current = new Set(callIdsKey ? callIdsKey.split(",") : []);
    const previous = knownCallIdsRef.current;
    knownCallIdsRef.current = current;
    if (!previous) return;
    const hasNew = [...current].some((id) => !previous.has(id));
    // The gentle rising chime (see src/lib/sounds.ts) — deliberately
    // unlike anything the staff board plays.
    if (hasNew && ctxRef.current) {
      playSound(ctxRef.current, "room_ready");
      duck();
    }
  }, [callIdsKey, phase.kind, duck]);

  // Background music plays only on a live (paired) board, and only once
  // sound has been switched on for this screen.
  const nowPlaying = useMusic(phase.kind === "live" ? music : MUSIC_OFF, {
    armed: soundReady,
    ducked,
  });

  return (
    <CallBoard
      phase={phase}
      calls={visibleCalls}
      nowMs={nowMs}
      reconnecting={reconnecting}
      soundReady={soundReady}
      music={nowPlaying}
      localNowMs={tickMs}
    />
  );
}
