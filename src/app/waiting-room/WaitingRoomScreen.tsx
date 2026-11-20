"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { CALL_DISPLAY_MS } from "@/lib/patient-flow";
import { createBrowserClient } from "@/lib/supabase-browser";
import { FLOW_EVENT, ROOMS_CHANNEL, ROOMS_EVENT } from "@/lib/rooms-realtime";
import CallBoard, { BoardPhase, Call } from "./CallBoard";

const POLL_LIVE_MS = 10_000;
const POLL_PAIRING_MS = 5_000;
const POLL_ERROR_MS = 30_000;

// Soft three-note rise (C5 E5 G5): "your room is ready".
function playCallChime(ctx: AudioContext) {
  [523.25, 659.25, 783.99].forEach((freq, i) => {
    const at = ctx.currentTime + i * 0.28;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(0.2, at + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, at + 1.4);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(at);
    osc.stop(at + 1.5);
  });
}

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

  const enter = useCallback((next: BoardPhase) => {
    phaseRef.current = next.kind;
    setPhase(next);
  }, []);

  const load = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      const res = await fetch("/api/display/calls", { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as {
          calls: Call[];
          serverTime: string;
        };
        offsetRef.current = Date.parse(data.serverTime) - Date.now();
        setCalls(data.calls);
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
        const pair = await fetch("/api/display/pair", { method: "POST" });
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
  }, [enter]);

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
        if (!ctxRef.current) ctxRef.current = new AudioContext();
        ctxRef.current.resume().catch(() => {});
        setSoundReady(true);
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
  }, []);

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
    if (hasNew && ctxRef.current) playCallChime(ctxRef.current);
  }, [callIdsKey, phase.kind]);

  return (
    <CallBoard
      phase={phase}
      calls={visibleCalls}
      nowMs={nowMs}
      reconnecting={reconnecting}
      soundReady={soundReady}
    />
  );
}
