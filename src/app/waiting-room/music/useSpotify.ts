"use client";
import { useEffect, useRef, useState } from "react";
import { fetchWithTimeout } from "@/lib/fetch-timeout";
import type { NowPlaying, PlayStatus, ProgressSnapshot } from "@/lib/music";
import { loadScript, onGesture, quietly } from "./shared";

export interface SpotifyConfig {
  // spotify:playlist:… / spotify:album:… / spotify:artist:…
  uri: string;
  // A Spotify account has been connected in the dashboard.
  connected: boolean;
  // Changes whenever staff press Save.
  rev: string;
}

// The parts of Spotify's Web Playback SDK used here.
interface SpotifyTrack {
  name: string;
  duration_ms?: number;
  artists?: { name: string }[];
}
interface SpotifyState {
  paused: boolean;
  position: number;
  duration?: number;
  context?: { uri?: string | null; metadata?: Record<string, unknown> | null };
  track_window?: { current_track?: SpotifyTrack | null };
}
interface SpotifyPlayer {
  connect(): Promise<boolean>;
  disconnect(): void;
  addListener(event: string, handler: (payload: never) => void): void;
  getCurrentState(): Promise<SpotifyState | null>;
  setVolume(volume: number): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  activateElement(): Promise<void>;
}
declare global {
  interface Window {
    Spotify?: {
      Player: new (options: {
        name: string;
        getOAuthToken: (cb: (token: string) => void) => void;
        volume?: number;
      }) => SpotifyPlayer;
    };
    onSpotifyWebPlaybackSDKReady?: () => void;
  }
}

const SDK_SRC = "https://sdk.scdn.co/spotify-player.js";
const API = "https://api.spotify.com/v1";
const REQUEST_TIMEOUT_MS = 8000;
const RESYNC_MS = 15_000;
const RETRY_MS = 5000;
const SDK_RETRY_MS = 30_000;
const DEVICE_NAME = "Waiting Room TV";

const RECONNECT_NOTE =
  "Spotify needs connecting again: Dashboard → Waiting-room music → Connect Spotify.";

let sdkReady: Promise<void> | null = null;

// Like YouTube's, the SDK calls a global function when it is usable —
// and it must exist before the script runs.
function loadSpotifySdk(): Promise<void> {
  if (window.Spotify?.Player) return Promise.resolve();
  if (!sdkReady) {
    sdkReady = new Promise<void>((resolve, reject) => {
      window.onSpotifyWebPlaybackSDKReady = () => resolve();
      loadScript(SDK_SRC).catch((err) => {
        sdkReady = null;
        reject(err);
      });
    });
  }
  return sdkReady;
}

interface Reading {
  status: PlayStatus;
  title: string;
  context: string | null;
  progress: ProgressSnapshot | null;
  note: string | null;
}
const NOTHING_YET: Reading = {
  status: "starting",
  title: "",
  context: null,
  progress: null,
  note: null,
};

// A Spotify playlist (or album/artist) played in this page by Spotify's
// Web Playback SDK. The page becomes a Spotify Connect device called
// "Waiting Room TV" on the clinic's Premium account and starts the chosen
// playlist on itself, on repeat.
//
// A Spotify account plays on one device at a time. If someone starts
// music on the same account elsewhere, Spotify moves playback there and
// this screen goes quiet. It does NOT grab playback back by itself (that
// would cut off whoever is listening, over and over); pressing Save in
// the dashboard brings it back here.
export function useSpotify(
  config: SpotifyConfig | null,
  // 0–1
  volume: number,
  paused: boolean,
  armed: boolean
): NowPlaying | null {
  const [reading, setReading] = useState<Reading>(NOTHING_YET);
  const volumeRef = useRef(volume);
  const pausedRef = useRef(paused);
  // The running player's controls, for the small effects below.
  const controlsRef = useRef<{
    setVolume(v: number): void;
    setPaused(p: boolean): void;
    saved(): void;
  } | null>(null);

  const uri = config?.uri ?? null;
  const connected = config?.connected ?? false;
  const rev = config?.rev ?? null;
  const active = uri !== null && connected && armed;

  useEffect(() => {
    volumeRef.current = volume;
    controlsRef.current?.setVolume(volume);
  }, [volume]);

  useEffect(() => {
    pausedRef.current = paused;
    controlsRef.current?.setPaused(paused);
  }, [paused]);

  useEffect(() => {
    controlsRef.current?.saved();
  }, [rev]);

  useEffect(() => {
    if (!active || !uri) return;

    let stopped = false;
    let player: SpotifyPlayer | null = null;
    let deviceId: string | null = null;
    // Playback is on this screen (we have seen a state from it).
    let ours = false;
    let blocked = false;
    let fatal: string | null = null;
    let token: { value: string; expiresAtMs: number } | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let last: Reading = NOTHING_YET;

    const show = (next: Partial<Reading>) => {
      if (stopped) return;
      last = { ...last, ...next };
      setReading(last);
    };

    const getToken = async (): Promise<string | null> => {
      if (token && token.expiresAtMs - Date.now() > 120_000) return token.value;
      try {
        const res = await fetchWithTimeout(
          "/api/display/spotify-token",
          { cache: "no-store" },
          REQUEST_TIMEOUT_MS
        );
        if (res.status === 409) {
          fatal = RECONNECT_NOTE;
          show({ status: "problem", note: fatal });
          return null;
        }
        if (!res.ok) return null;
        const data = (await res.json()) as {
          accessToken: string;
          expiresInS: number;
        };
        token = {
          value: data.accessToken,
          expiresAtMs: Date.now() + data.expiresInS * 1000,
        };
        return token.value;
      } catch {
        return null;
      }
    };

    const api = async (method: string, path: string, body?: object) => {
      const bearer = await getToken();
      if (!bearer) return null;
      try {
        return await fetchWithTimeout(
          `${API}${path}`,
          {
            method,
            headers: {
              Authorization: `Bearer ${bearer}`,
              "Content-Type": "application/json",
            },
            body: body ? JSON.stringify(body) : undefined,
          },
          REQUEST_TIMEOUT_MS
        );
      } catch {
        return null;
      }
    };

    const retryStart = () => {
      if (stopped || retry) return;
      retry = setTimeout(() => {
        retry = null;
        void startPlaylist();
      }, RETRY_MS);
    };

    // "Play this playlist on this screen", then keep it going round.
    const startPlaylist = async () => {
      if (stopped || !deviceId || fatal || pausedRef.current) return;
      const device = encodeURIComponent(deviceId);
      const res = await api("PUT", `/me/player/play?device_id=${device}`, {
        context_uri: uri,
      });
      if (stopped) return;
      if (
        !res ||
        res.status === 404 ||
        res.status >= 500 ||
        res.status === 429
      ) {
        // 404: Spotify has not registered the new device yet — common in
        // the first second or two after "ready".
        retryStart();
        return;
      }
      if (res.status === 401) {
        token = null;
        retryStart();
        return;
      }
      if (!res.ok) {
        show({
          status: "problem",
          note:
            res.status === 403
              ? "Spotify refused to play this here. It needs a Premium account and a playlist that account can open."
              : "Spotify couldn't start this playlist. Check the link.",
        });
        return;
      }
      // Without this the music stops for good at the end of the list.
      await api("PUT", `/me/player/repeat?state=context&device_id=${device}`);
    };

    const apply = (state: SpotifyState | null) => {
      if (stopped || fatal) return;
      if (!state) {
        if (ours) {
          ours = false;
          show({
            status: "problem",
            progress: null,
            note: "Spotify is playing on another device. Press Save in Dashboard → Waiting-room music to play it here again.",
          });
        }
        return;
      }
      ours = true;
      if (!state.paused) blocked = false;
      const track = state.track_window?.current_track ?? null;
      const artists = (track?.artists ?? []).map((a) => a.name).join(", ");
      const durationMs = state.duration ?? track?.duration_ms ?? 0;
      const context = state.context?.metadata?.context_description;

      let status: PlayStatus;
      if (pausedRef.current) status = "paused";
      else if (!state.paused) status = "playing";
      else status = blocked ? "blocked" : "starting";

      show({
        status,
        title: track
          ? artists
            ? `${track.name} — ${artists}`
            : track.name
          : "",
        context: typeof context === "string" && context ? context : null,
        progress:
          durationMs > 0
            ? {
                positionMs: state.position,
                durationMs,
                atMs: Date.now(),
                running: !state.paused,
              }
            : null,
        note: null,
      });
    };

    const create = () => {
      if (stopped || !window.Spotify) return;
      const created = new window.Spotify.Player({
        name: DEVICE_NAME,
        getOAuthToken: (cb) => {
          void getToken().then((value) => cb(value ?? ""));
        },
        volume: volumeRef.current,
      });
      player = created;

      const on = <T>(event: string, handler: (payload: T) => void) =>
        created.addListener(event, handler as (payload: never) => void);

      on<{ device_id: string }>("ready", ({ device_id }) => {
        deviceId = device_id;
        void startPlaylist();
      });
      on("not_ready", () => {
        deviceId = null;
        show({ status: "starting" });
      });
      on<SpotifyState | null>("player_state_changed", apply);
      on("autoplay_failed", () => {
        blocked = true;
        show({ status: "blocked" });
      });
      on("initialization_error", () => {
        fatal =
          "This browser can't play Spotify. Use Chrome, Edge, Firefox or Safari on a computer.";
        show({ status: "problem", note: fatal });
      });
      on("authentication_error", () => {
        fatal = fatal ?? RECONNECT_NOTE;
        show({ status: "problem", note: fatal });
      });
      on("account_error", () => {
        fatal = "Spotify Premium is needed to play music on this screen.";
        show({ status: "problem", note: fatal });
      });
      on("playback_error", () => {
        if (!ours) retryStart();
      });

      created.connect().catch(() => {});
    };

    controlsRef.current = {
      setVolume: (v) => {
        const p = player;
        if (p) quietly(() => p.setVolume(v));
      },
      setPaused: (p) => {
        const current = player;
        if (!current) return;
        if (p) {
          quietly(() => current.pause());
          show({ status: "paused" });
        } else if (ours) {
          quietly(() => current.resume());
        } else {
          void startPlaylist();
        }
      },
      // Staff pressed Save. If the music is already playing here, leave
      // it alone (a volume change must not restart the playlist); if it
      // wandered off to another device, bring it back.
      saved: () => {
        if (!ours) void startPlaylist();
      },
    };

    let sdkRetry: ReturnType<typeof setTimeout> | null = null;
    const start = () => {
      loadSpotifySdk().then(create, () => {
        if (stopped) return;
        show({
          status: "problem",
          note: "Can't reach Spotify right now. Trying again.",
        });
        sdkRetry = setTimeout(start, SDK_RETRY_MS);
      });
    };

    setReading(NOTHING_YET);
    start();

    // The SDK reports changes, not the passing of time; re-read now and
    // then so the progress bar cannot drift.
    const resync = setInterval(() => {
      const p = player;
      if (p && ours) p.getCurrentState().then(apply, () => {});
    }, RESYNC_MS);

    const offGesture = onGesture(() => {
      const p = player;
      if (!p) return;
      // Must run inside the click itself for browsers that hold sound back.
      quietly(() => p.activateElement());
      if (blocked && !pausedRef.current) {
        if (ours) quietly(() => p.resume());
        else void startPlaylist();
      }
    });

    return () => {
      stopped = true;
      controlsRef.current = null;
      if (retry) clearTimeout(retry);
      if (sdkRetry) clearTimeout(sdkRetry);
      clearInterval(resync);
      offGesture();
      const p = player;
      if (p) quietly(() => p.disconnect());
    };
  }, [active, uri]);

  if (!config) return null;
  if (!connected) {
    return {
      source: "spotify",
      status: "problem",
      title: "Spotify",
      detail: "Spotify",
      live: false,
      progress: null,
      note: "Spotify isn't connected yet: Dashboard → Waiting-room music → Connect Spotify.",
    };
  }
  return {
    source: "spotify",
    status: paused ? "paused" : !armed ? "blocked" : reading.status,
    title: reading.title || "Spotify",
    detail: reading.context ? `Spotify · ${reading.context}` : "Spotify",
    live: false,
    progress: reading.progress,
    note: reading.note,
  };
}
