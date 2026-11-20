"use client";
import { useEffect, useRef, useState } from "react";
import type { NowPlaying, PlayStatus, ProgressSnapshot } from "@/lib/music";
import { loadScript, onGesture, quietly } from "./shared";

export interface YouTubeConfig {
  videoId: string | null;
  listId: string | null;
}

// The parts of YouTube's IFrame Player API used here.
interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  nextVideo(): void;
  loadVideoById(videoId: string): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  setVolume(volume: number): void;
  getPlayerState(): number;
  getCurrentTime(): number;
  getDuration(): number;
  getVideoData(): { title?: string; isLive?: boolean } | undefined;
  destroy(): void;
}
declare global {
  interface Window {
    YT?: { Player: new (el: HTMLElement, options: object) => YTPlayer };
    onYouTubeIframeAPIReady?: () => void;
  }
}

const YT = { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3 };
const API_SRC = "https://www.youtube.com/iframe_api";
const READ_MS = 5000;
const API_RETRY_MS = 30_000;
// Asked to play and still silent after this long: the browser is holding
// it back until someone clicks the page.
const BLOCKED_AFTER_MS = 5000;
const NUDGE_EVERY_MS = 10_000;
// A video that would not play is tried again now and then: a live stream
// that was offline comes back without anyone touching the dashboard.
const PROBLEM_RETRY_MS = 2 * 60_000;

let apiReady: Promise<void> | null = null;

// The script announces itself by calling a global function once the
// player class exists, which is later than the script's own load event.
function loadYouTubeApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  if (!apiReady) {
    apiReady = new Promise<void>((resolve, reject) => {
      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        previous?.();
        resolve();
      };
      loadScript(API_SRC).catch((err) => {
        apiReady = null;
        reject(err);
      });
    });
  }
  return apiReady;
}

// YouTube reports 150 both for a video whose owner has switched off
// playing on other sites and for one that does not exist (any more), so
// the note has to cover both.
function errorNote(code: number): string {
  if (code === 100 || code === 101 || code === 150) {
    return "YouTube won't play this video here: it is unavailable, or its owner doesn't allow it on other sites. Choose another.";
  }
  return "YouTube couldn't play this video.";
}

interface Reading {
  status: PlayStatus;
  title: string;
  live: boolean;
  progress: ProgressSnapshot | null;
  note: string | null;
}
const NOTHING_YET: Reading = {
  status: "starting",
  title: "",
  live: false,
  progress: null,
  note: null,
};

// A YouTube video, live stream or playlist — sound only. The player is a
// real one (YouTube offers no audio-only mode) kept out of sight behind
// the board. A single video repeats; a playlist loops; a clip that will
// not play is skipped when it is part of a playlist.
export function useYouTube(
  config: YouTubeConfig | null,
  // 0–1
  volume: number,
  paused: boolean,
  armed: boolean
): NowPlaying | null {
  const [reading, setReading] = useState<Reading>(NOTHING_YET);
  const playerRef = useRef<YTPlayer | null>(null);
  const volumeRef = useRef(volume);
  const pausedRef = useRef(paused);

  const videoId = config?.videoId ?? null;
  const listId = config?.listId ?? null;
  const active = (videoId !== null || listId !== null) && armed;

  useEffect(() => {
    volumeRef.current = volume;
    const player = playerRef.current;
    if (player) quietly(() => player.setVolume(Math.round(volume * 100)));
  }, [volume]);

  useEffect(() => {
    pausedRef.current = paused;
    const player = playerRef.current;
    if (!player) return;
    quietly(() => (paused ? player.pauseVideo() : player.playVideo()));
  }, [paused]);

  useEffect(() => {
    if (!active) return;

    let stopped = false;
    let player: YTPlayer | null = null;
    let apiRetry: ReturnType<typeof setTimeout> | null = null;
    let problem: string | null = null;
    let problemAtMs = 0;
    let askedAtMs = Date.now();
    let lastNudgeMs = 0;

    // Laid out at YouTube's minimum player size and fully transparent,
    // rather than display:none — a frame that is not rendered at all may
    // be refused playback.
    const host = document.createElement("div");
    host.setAttribute("aria-hidden", "true");
    host.style.cssText =
      "position:fixed;left:0;bottom:0;width:200px;height:200px;opacity:0;pointer-events:none;z-index:-1;overflow:hidden";
    const mount = document.createElement("div");
    host.appendChild(mount);
    document.body.appendChild(host);

    const read = () => {
      if (stopped || !player) return;
      try {
        const state = player.getPlayerState();
        const data = player.getVideoData() ?? {};
        const durationMs = (player.getDuration() || 0) * 1000;
        const live = data.isLive === true;
        const wantPlay = !pausedRef.current;
        const now = Date.now();

        if (state === YT.PLAYING) problem = null;

        let status: PlayStatus;
        if (!wantPlay) status = "paused";
        else if (state === YT.PLAYING) status = "playing";
        else if (problem) status = "problem";
        else if (state === YT.BUFFERING) status = "starting";
        else
          status = now - askedAtMs > BLOCKED_AFTER_MS ? "blocked" : "starting";

        if (
          wantPlay &&
          problem &&
          videoId &&
          now - problemAtMs > PROBLEM_RETRY_MS
        ) {
          problemAtMs = now;
          player.loadVideoById(videoId);
        }

        // Something stopped it (a "still watching?" pause, a hiccup):
        // ask again, gently.
        if (
          wantPlay &&
          !problem &&
          state !== YT.PLAYING &&
          state !== YT.BUFFERING &&
          now - lastNudgeMs > NUDGE_EVERY_MS
        ) {
          lastNudgeMs = now;
          player.playVideo();
        }

        setReading({
          status,
          title: data.title ?? "",
          live,
          progress:
            live || durationMs <= 0
              ? null
              : {
                  positionMs: player.getCurrentTime() * 1000,
                  durationMs,
                  atMs: now,
                  running: state === YT.PLAYING,
                },
          note: status === "problem" ? problem : null,
        });
      } catch {
        // The player is mid-teardown; the next reading sorts it out.
      }
    };

    const create = () => {
      if (stopped || !window.YT) return;
      const created = new window.YT.Player(mount, {
        width: 200,
        height: 200,
        ...(videoId ? { videoId } : {}),
        playerVars: {
          autoplay: pausedRef.current ? 0 : 1,
          controls: 0,
          disablekb: 1,
          fs: 0,
          iv_load_policy: 3,
          playsinline: 1,
          rel: 0,
          loop: 1,
          // A playlist loops as a whole; a single video loops by being a
          // one-item playlist of itself.
          ...(listId
            ? { listType: "playlist", list: listId }
            : { playlist: videoId }),
        },
        events: {
          onReady: () => {
            if (stopped) return;
            player = created;
            playerRef.current = created;
            askedAtMs = Date.now();
            quietly(() =>
              created.setVolume(Math.round(volumeRef.current * 100))
            );
            if (!pausedRef.current) quietly(() => created.playVideo());
            read();
          },
          onStateChange: (event: { data: number }) => {
            if (stopped) return;
            if (event.data === YT.ENDED && !listId && !pausedRef.current) {
              quietly(() => {
                created.seekTo(0, true);
                created.playVideo();
              });
            }
            read();
          },
          onError: (event: { data: number }) => {
            if (stopped) return;
            if (listId) {
              quietly(() => created.nextVideo());
            } else {
              problem = errorNote(event.data);
              problemAtMs = Date.now();
            }
            read();
          },
        },
      });
    };

    const start = () => {
      loadYouTubeApi().then(create, () => {
        if (stopped) return;
        setReading({
          ...NOTHING_YET,
          status: "problem",
          note: "Can't reach YouTube right now. Trying again.",
        });
        apiRetry = setTimeout(start, API_RETRY_MS);
      });
    };

    setReading(NOTHING_YET);
    start();
    const reader = setInterval(read, READ_MS);
    const offGesture = onGesture(() => {
      if (player && !pausedRef.current) {
        const p = player;
        quietly(() => {
          if (p.getPlayerState() !== YT.PLAYING) p.playVideo();
        });
      }
    });

    return () => {
      stopped = true;
      if (apiRetry) clearTimeout(apiRetry);
      clearInterval(reader);
      offGesture();
      playerRef.current = null;
      const p = player;
      if (p) quietly(() => p.destroy());
      host.remove();
    };
  }, [active, videoId, listId]);

  if (!config) return null;
  return {
    source: "youtube",
    status: paused ? "paused" : !armed ? "blocked" : reading.status,
    title: reading.title || "YouTube",
    detail: reading.live ? "YouTube · Live" : "YouTube",
    live: reading.live,
    progress: reading.progress,
    note: reading.note,
  };
}
