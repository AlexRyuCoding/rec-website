// Background music for the waiting-room TV: the pure part (what staff may
// type, what the TV is told, how progress is worked out). The database
// side is music-server.ts; the players are in src/app/waiting-room/music/.
//
// Staff choose ONE source in Dashboard → Waiting-room music:
//   radio    an internet radio stream, played by an <audio> element
//   youtube  a video, live stream or playlist — sound only, the player is
//            kept out of sight
//   spotify  a playlist/album played by Spotify's Web Playback SDK on the
//            clinic's connected Premium account
// The TV shows what is playing in a bar between the logo and the clock.

export type MusicSource = "off" | "radio" | "youtube" | "spotify";

export const MUSIC_SOURCES: readonly MusicSource[] = [
  "off",
  "radio",
  "youtube",
  "spotify",
];

export const DEFAULT_VOLUME = 60;
export const LINK_MAX_LENGTH = 500;
export const STATION_NAME_MAX_LENGTH = 60;

// How far the music drops while a patient is being called, so the chime
// (and the moment itself) is not lost in it.
export const DUCK_FACTOR = 0.25;
export const DUCK_MS = 4500;

// What the TV is told (inside the /api/display/calls reply). `rev`
// changes whenever staff press Save, even with identical settings, so
// "Save" doubles as "start it again".
interface TvMusicBase {
  // 0–100
  volume: number;
  paused: boolean;
  rev: string;
}
export type TvMusic =
  | { source: "off" }
  | ({ source: "radio"; name: string; url: string } & TvMusicBase)
  | ({
      source: "youtube";
      videoId: string | null;
      listId: string | null;
    } & TvMusicBase)
  | ({ source: "spotify"; uri: string; connected: boolean } & TvMusicBase);

export const MUSIC_OFF: TvMusic = { source: "off" };

// Calm, ad-free stations whose streams are plain HTTPS (the page is HTTPS,
// so an http:// stream would be blocked) and which publish the track name.
// Checked 2026-11-20. Staff can also paste any other stream address.
export interface RadioPreset {
  id: string;
  name: string;
  about: string;
  url: string;
}
export const RADIO_PRESETS: readonly RadioPreset[] = [
  {
    id: "rp-serenity",
    name: "Radio Paradise · Serenity",
    about: "Quiet, relaxing instrumental",
    url: "https://stream.radioparadise.com/serenity",
  },
  {
    id: "rp-mellow",
    name: "Radio Paradise · Mellow Mix",
    about: "Gentle songs, mostly acoustic",
    url: "https://stream.radioparadise.com/mellow-128",
  },
  {
    id: "soma-dronezone",
    name: "SomaFM · Drone Zone",
    about: "Slow atmospheric ambient",
    url: "https://ice1.somafm.com/dronezone-128-mp3",
  },
  {
    id: "soma-groovesalad",
    name: "SomaFM · Groove Salad",
    about: "Chilled ambient beats",
    url: "https://ice1.somafm.com/groovesalad-128-mp3",
  },
  {
    id: "ambient-sleeping-pill",
    name: "Ambient Sleeping Pill",
    about: "Very soft ambient, no beats",
    url: "https://radio.stereoscenic.com/asp-s",
  },
];

const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/;

function toUrl(input: string): URL | null {
  const text = input.trim();
  if (!text || text.length > LINK_MAX_LENGTH) return null;
  try {
    return new URL(
      /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`
    );
  } catch {
    return null;
  }
}

export type StreamCheck =
  | { ok: true; url: string }
  | { ok: false; reason: string };

// A radio stream address staff typed. HTTPS only: the TV page is HTTPS and
// browsers refuse to play http:// audio on it. The server also fetches
// this address (to read the track name), so it must be an ordinary public
// host — never this machine or an address on a private network.
export function checkStreamUrl(input: string): StreamCheck {
  const url = toUrl(input);
  if (!url) return { ok: false, reason: "That isn't a web address." };
  if (url.protocol !== "https:") {
    return {
      ok: false,
      reason: "The stream address must start with https://",
    };
  }
  if (url.username || url.password) {
    return { ok: false, reason: "Remove the user name from the address." };
  }
  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" ||
    !host.includes(".") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    IPV4_RE.test(host) ||
    host.includes(":") ||
    host.startsWith("[")
  ) {
    return { ok: false, reason: "Use the station's public stream address." };
  }
  return { ok: true, url: url.toString() };
}

const YT_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const YT_LIST_RE = /^[A-Za-z0-9_-]{12,64}$/;
const YT_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "www.youtube-nocookie.com",
  "youtu.be",
]);

export interface YouTubeTarget {
  videoId: string | null;
  listId: string | null;
}

// Any YouTube link staff are likely to paste: a video, a live stream, a
// playlist, or a video inside a playlist (then the playlist plays,
// starting from that video).
export function parseYouTubeLink(input: string): YouTubeTarget | null {
  const text = input.trim();
  if (YT_ID_RE.test(text)) return { videoId: text, listId: null };
  const url = toUrl(text);
  if (!url || !YT_HOSTS.has(url.hostname.toLowerCase())) return null;

  let videoId: string | null = null;
  const parts = url.pathname.split("/").filter(Boolean);
  if (url.hostname.toLowerCase() === "youtu.be") {
    videoId = parts[0] ?? null;
  } else if (parts[0] === "watch") {
    videoId = url.searchParams.get("v");
  } else if (["live", "embed", "shorts", "v"].includes(parts[0] ?? "")) {
    videoId = parts[1] ?? null;
  }
  if (videoId !== null && !YT_ID_RE.test(videoId)) videoId = null;

  let listId = url.searchParams.get("list");
  if (listId !== null && !YT_LIST_RE.test(listId)) listId = null;

  if (!videoId && !listId) return null;
  return { videoId, listId };
}

const SPOTIFY_ID_RE = /^[A-Za-z0-9]{22}$/;
const SPOTIFY_KINDS = ["playlist", "album", "artist"] as const;
export type SpotifyKind = (typeof SPOTIFY_KINDS)[number];

export interface SpotifyTarget {
  kind: SpotifyKind;
  id: string;
  // What Spotify's "start playback" call wants as context_uri.
  uri: string;
}

function spotifyTarget(kind: string, id: string): SpotifyTarget | null {
  if (!(SPOTIFY_KINDS as readonly string[]).includes(kind)) return null;
  if (!SPOTIFY_ID_RE.test(id)) return null;
  return { kind: kind as SpotifyKind, id, uri: `spotify:${kind}:${id}` };
}

// A Spotify "Share → Copy link" address (or a spotify: URI) for something
// that can play on and on: a playlist, an album or an artist.
export function parseSpotifyLink(input: string): SpotifyTarget | null {
  const text = input.trim();
  const uri = /^spotify:([a-z]+):([A-Za-z0-9]+)$/.exec(text);
  if (uri) return spotifyTarget(uri[1], uri[2]);
  const url = toUrl(text);
  if (!url || url.hostname.toLowerCase() !== "open.spotify.com") return null;
  const parts = url.pathname.split("/").filter(Boolean);
  // Links copied outside the US carry a language prefix: /intl-de/playlist/…
  if (parts[0]?.startsWith("intl-")) parts.shift();
  if (parts.length < 2) return null;
  return spotifyTarget(parts[0], parts[1]);
}

// ---- Radio track names -------------------------------------------------
// Internet radio (Icecast/Shoutcast) mixes the track name into the audio:
// after every `metaint` bytes of sound comes one length byte (×16) and
// that many bytes of text like  StreamTitle='Artist - Song';StreamUrl='';
// Browsers hide this from the page, so the server reads it instead.

export const ICY_MAX_METAINT = 512_000;

// The first metadata block in the start of a stream. null = not enough
// bytes yet; "" = the block is there but empty (nothing announced).
export function extractIcyBlock(
  bytes: Uint8Array,
  metaint: number
): string | null {
  if (bytes.length <= metaint) return null;
  const length = bytes[metaint] * 16;
  if (bytes.length < metaint + 1 + length) return null;
  const block = bytes.subarray(metaint + 1, metaint + 1 + length);
  return new TextDecoder("utf-8").decode(block).replace(/\0+$/, "");
}

export function parseIcyTitle(block: string): string | null {
  const match = /StreamTitle='(.*?)';/.exec(block);
  const title = match?.[1].trim() ?? "";
  // Stations send a dash or their own slogan between tracks.
  if (!title || title === "-") return null;
  return title.slice(0, 200);
}

// ---- What the bar shows --------------------------------------------------

export type PlayStatus =
  // Asked to play, nothing audible yet.
  | "starting"
  | "playing"
  // Staff paused it from the dashboard.
  | "paused"
  // The browser will not start sound until someone clicks the page once.
  | "blocked"
  // Not playing and not going to by itself; `note` says why.
  | "problem";

// A reading of the playhead taken at one moment; the bar works out where
// it is now from that, so players need not report every second.
export interface ProgressSnapshot {
  positionMs: number;
  durationMs: number;
  // Date.now() when the reading was taken.
  atMs: number;
  // false while paused or buffering: the playhead is not moving.
  running: boolean;
}

export interface NowPlaying {
  source: Exclude<MusicSource, "off">;
  status: PlayStatus;
  // The track, video or station.
  title: string;
  // Where it comes from: "Radio · SomaFM", "Spotify · Calm Clinic".
  detail: string;
  // Radio and live streams have no beginning or end: no progress bar.
  live: boolean;
  progress: ProgressSnapshot | null;
  // For staff, in small print: why there is no music.
  note: string | null;
}

export function progressAt(
  p: ProgressSnapshot,
  nowMs: number
): { positionMs: number; fraction: number } {
  const elapsed = p.running ? Math.max(0, nowMs - p.atMs) : 0;
  const positionMs = Math.min(
    Math.max(0, p.positionMs + elapsed),
    Math.max(0, p.durationMs)
  );
  const fraction = p.durationMs > 0 ? positionMs / p.durationMs : 0;
  return { positionMs, fraction };
}

// 134000 -> "2:14", 3_734_000 -> "1:02:14"
export function formatTrackTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

// 0–1 for the players, from the dashboard's 0–100 and the call dip.
export function playerVolume(volume: number, ducked: boolean): number {
  const v = Math.min(100, Math.max(0, volume)) / 100;
  return ducked ? v * DUCK_FACTOR : v;
}
