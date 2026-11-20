"use client";
import { useEffect, useRef, useState } from "react";
import { fetchWithTimeout } from "@/lib/fetch-timeout";
import type { NowPlaying, PlayStatus } from "@/lib/music";
import { onGesture } from "./shared";

export interface RadioConfig {
  name: string;
  url: string;
}

// A dropped stream is retried sooner at first, then every half minute.
const RETRY_MS = [2000, 5000, 15_000, 30_000];
// Sound that has not moved for this long is a dead connection, even if
// the browser has not noticed.
const STALL_MS = 20_000;
const WATCH_MS = 5000;
const TITLE_POLL_MS = 20_000;
const REQUEST_TIMEOUT_MS = 8000;

// Internet radio through a plain <audio> element. A live stream has no
// "resume": pausing hangs up, and playing again connects afresh, so the
// station is always heard live. Nobody is at the TV to press play again,
// so a broken or stalled stream reconnects by itself, forever.
export function useRadio(
  config: RadioConfig | null,
  // 0–1
  volume: number,
  paused: boolean,
  // false until the page has been clicked once (sound is allowed)
  armed: boolean
): NowPlaying | null {
  const [status, setStatus] = useState<PlayStatus>("starting");
  const [track, setTrack] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const volumeRef = useRef(volume);

  const url = config?.url ?? null;
  const wanted = url !== null && armed && !paused;

  useEffect(() => {
    volumeRef.current = volume;
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  useEffect(() => {
    if (!url || !wanted) return;

    const audio = new Audio();
    audio.preload = "none";
    audio.volume = volumeRef.current;
    audioRef.current = audio;

    let stopped = false;
    let attempt = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let lastTime = 0;
    let lastMovedMs = Date.now();

    const connect = () => {
      if (stopped) return;
      retryTimer = null;
      lastMovedMs = Date.now();
      audio.src = url;
      audio.load();
      audio.play().catch((err: unknown) => {
        if (stopped) return;
        if ((err as { name?: string })?.name === "NotAllowedError") {
          setStatus("blocked");
        }
        // Anything else also fires "error" below, which retries.
      });
    };

    const retryLater = () => {
      if (stopped || retryTimer) return;
      setStatus("starting");
      const delay = RETRY_MS[Math.min(attempt, RETRY_MS.length - 1)];
      attempt += 1;
      retryTimer = setTimeout(connect, delay);
    };

    const onPlaying = () => {
      attempt = 0;
      lastMovedMs = Date.now();
      setStatus("playing");
    };
    audio.addEventListener("playing", onPlaying);
    audio.addEventListener("error", retryLater);
    audio.addEventListener("ended", retryLater);

    const watchdog = setInterval(() => {
      // Paused = refused by the browser (waiting for a click), not stalled.
      if (audio.paused || retryTimer) return;
      if (audio.currentTime !== lastTime) {
        lastTime = audio.currentTime;
        lastMovedMs = Date.now();
      } else if (Date.now() - lastMovedMs > STALL_MS) {
        retryLater();
      }
    }, WATCH_MS);

    const offGesture = onGesture(() => {
      if (!stopped && audio.paused && !retryTimer) connect();
    });

    setStatus("starting");
    connect();

    return () => {
      stopped = true;
      if (retryTimer) clearTimeout(retryTimer);
      clearInterval(watchdog);
      offGesture();
      audio.removeEventListener("playing", onPlaying);
      audio.removeEventListener("error", retryLater);
      audio.removeEventListener("ended", retryLater);
      // Hang up, or the browser keeps downloading the stream.
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      audioRef.current = null;
    };
  }, [url, wanted]);

  // The track name comes from the server (browsers hide a stream's own
  // announcements from the page). Not every station has one.
  useEffect(() => {
    setTrack(null);
    if (!url || !wanted) return;
    let cancelled = false;
    const ask = async () => {
      try {
        const res = await fetchWithTimeout(
          "/api/display/now-playing",
          { cache: "no-store" },
          REQUEST_TIMEOUT_MS
        );
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { title?: string | null };
        if (!cancelled) setTrack(data.title || null);
      } catch {
        // Keep the last name; the next poll tries again.
      }
    };
    ask();
    const timer = setInterval(ask, TITLE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [url, wanted]);

  if (!config) return null;
  return {
    source: "radio",
    status: paused ? "paused" : !armed ? "blocked" : status,
    title: track ?? config.name,
    detail: track ? `Radio · ${config.name}` : "Radio",
    live: true,
    progress: null,
    note: null,
  };
}
