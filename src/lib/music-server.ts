import type { SupabaseClient } from "@supabase/supabase-js";
import {
  checkStreamUrl,
  DEFAULT_VOLUME,
  extractIcyBlock,
  ICY_MAX_METAINT,
  MUSIC_OFF,
  MusicSource,
  parseIcyTitle,
  parseSpotifyLink,
  parseYouTubeLink,
  RADIO_PRESETS,
  SavedStation,
  TvMusic,
} from "./music";

// Database and network side of the waiting-room music (see music.ts).

export const MUSIC_TABLE = "waiting_room_music";

export interface MusicRow {
  source: MusicSource;
  radio_name: string | null;
  radio_url: string | null;
  youtube_url: string | null;
  spotify_url: string | null;
  volume: number;
  paused: boolean;
  updated_at: string;
  // Sealed (see secret-box.ts). Never leaves the server.
  spotify_refresh_token: string | null;
  spotify_account_name: string | null;
  spotify_connected_at: string | null;
}

const COLUMNS =
  "source, radio_name, radio_url, youtube_url, spotify_url, volume, paused, updated_at, spotify_refresh_token, spotify_account_name, spotify_connected_at";

export const EMPTY_MUSIC_ROW: MusicRow = {
  source: "off",
  radio_name: null,
  radio_url: null,
  youtube_url: null,
  spotify_url: null,
  volume: DEFAULT_VOLUME,
  paused: false,
  updated_at: new Date(0).toISOString(),
  spotify_refresh_token: null,
  spotify_account_name: null,
  spotify_connected_at: null,
};

// null = the settings could not be read (database trouble). Callers
// treat that as "leave the music alone",
// never as "music off": a database blip must not stop the music.
export async function loadMusicRow(
  supabase: SupabaseClient
): Promise<MusicRow | null> {
  const { data, error } = await supabase
    .from(MUSIC_TABLE)
    .select(COLUMNS)
    .eq("id", true)
    .maybeSingle();
  if (error) return null;
  return (data as MusicRow | null) ?? EMPTY_MUSIC_ROW;
}

export function radioDisplayName(name: string | null, url: string): string {
  if (name?.trim()) return name.trim();
  const preset = RADIO_PRESETS.find((p) => p.url === url);
  if (preset) return preset.name;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Radio";
  }
}

export const STATIONS_TABLE = "radio_stations";

// Staff's own stations, by name. null = the list could not be read
// (database trouble); the rest of the music panel must keep working
// without it.
export async function loadSavedStations(
  supabase: SupabaseClient
): Promise<SavedStation[] | null> {
  const { data, error } = await supabase
    .from(STATIONS_TABLE)
    .select("id, name, url")
    .order("name");
  if (error) return null;
  return (data ?? []) as SavedStation[];
}

// What the TV is told. Anything unusable (a link that no longer parses)
// comes out as "off" rather than as something the TV has to second-guess.
export function tvMusicFromRow(row: MusicRow): TvMusic {
  const base = { volume: row.volume, paused: row.paused, rev: row.updated_at };
  if (row.source === "radio") {
    const check = checkStreamUrl(row.radio_url ?? "");
    if (!check.ok) return MUSIC_OFF;
    return {
      source: "radio",
      name: radioDisplayName(row.radio_name, check.url),
      url: check.url,
      ...base,
    };
  }
  if (row.source === "youtube") {
    const target = parseYouTubeLink(row.youtube_url ?? "");
    if (!target) return MUSIC_OFF;
    return { source: "youtube", ...target, ...base };
  }
  if (row.source === "spotify") {
    const target = parseSpotifyLink(row.spotify_url ?? "");
    if (!target) return MUSIC_OFF;
    return {
      source: "spotify",
      uri: target.uri,
      connected: row.spotify_refresh_token !== null,
      ...base,
    };
  }
  return MUSIC_OFF;
}

export interface MusicSettingsInput {
  source?: MusicSource;
  radioName?: string;
  radioUrl?: string;
  youtubeUrl?: string;
  spotifyUrl?: string;
  volume?: number;
  paused?: boolean;
}

export type MergeResult =
  | {
      ok: true;
      values: Pick<
        MusicRow,
        | "source"
        | "radio_name"
        | "radio_url"
        | "youtube_url"
        | "spotify_url"
        | "volume"
        | "paused"
      >;
    }
  | { ok: false; error: string };

// A change from the dashboard laid over what is stored. Only the link of
// the source being switched ON has to be usable; the others are kept as
// typed, so a half-finished YouTube link does not block "pause the radio".
export function mergeMusicSettings(
  row: MusicRow,
  input: MusicSettingsInput
): MergeResult {
  const text = (next: string | undefined, current: string | null) =>
    next === undefined ? current : next.trim() || null;

  const values = {
    source: input.source ?? row.source,
    radio_name: text(input.radioName, row.radio_name),
    radio_url: text(input.radioUrl, row.radio_url),
    youtube_url: text(input.youtubeUrl, row.youtube_url),
    spotify_url: text(input.spotifyUrl, row.spotify_url),
    volume: input.volume ?? row.volume,
    paused: input.paused ?? row.paused,
  };

  if (values.source === "radio") {
    const check = checkStreamUrl(values.radio_url ?? "");
    if (!check.ok) {
      return {
        ok: false,
        error: values.radio_url ? check.reason : "Choose a station first.",
      };
    }
    values.radio_url = check.url;
  }
  if (
    values.source === "youtube" &&
    !parseYouTubeLink(values.youtube_url ?? "")
  ) {
    return {
      ok: false,
      error: values.youtube_url
        ? "That doesn't look like a YouTube video or playlist link."
        : "Paste a YouTube link first.",
    };
  }
  if (
    values.source === "spotify" &&
    !parseSpotifyLink(values.spotify_url ?? "")
  ) {
    return {
      ok: false,
      error: values.spotify_url
        ? "Paste a Spotify playlist, album or artist link (Share → Copy link)."
        : "Paste a Spotify playlist link first.",
    };
  }
  return { ok: true, values };
}

// ---- Radio: what is playing right now -------------------------------------

const ICY_TIMEOUT_MS = 6000;
const ICY_CACHE_MS = 15_000;
// Some stations answer plain HTTP clients with an empty reply.
const ICY_USER_AGENT =
  "Mozilla/5.0 (compatible; WaitingRoomScreen/1.0; +https://www.ryuacupuncture.com)";

const icyCache = new Map<string, { title: string | null; atMs: number }>();

// Reads just far enough into the stream to see the first track
// announcement, then hangs up. null = this station does not announce
// tracks (or could not be reached) — the TV then shows the station name.
export async function fetchIcyTitle(
  url: string,
  nowMs: number = Date.now(),
  fetchImpl: typeof fetch = fetch
): Promise<string | null> {
  const cached = icyCache.get(url);
  if (cached && nowMs - cached.atMs < ICY_CACHE_MS) return cached.title;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ICY_TIMEOUT_MS);
  let title: string | null = null;
  try {
    const res = await fetchImpl(url, {
      headers: { "Icy-MetaData": "1", "User-Agent": ICY_USER_AGENT },
      signal: controller.signal,
      cache: "no-store",
    });
    const metaint = Number(res.headers.get("icy-metaint"));
    if (
      res.ok &&
      res.body &&
      Number.isInteger(metaint) &&
      metaint > 0 &&
      metaint <= ICY_MAX_METAINT
    ) {
      const reader = res.body.getReader();
      // The longest possible block is 255 × 16 bytes.
      const limit = metaint + 1 + 255 * 16;
      const bytes = new Uint8Array(limit);
      let length = 0;
      let block: string | null = null;
      while (block === null && length < limit) {
        const { done, value } = await reader.read();
        if (done || !value) break;
        const take = value.subarray(0, limit - length);
        bytes.set(take, length);
        length += take.length;
        block = extractIcyBlock(bytes.subarray(0, length), metaint);
      }
      if (block !== null) title = parseIcyTitle(block);
    }
  } catch {
    title = null;
  } finally {
    clearTimeout(timer);
    // Hang up: it is an endless stream.
    controller.abort();
  }

  icyCache.set(url, { title, atMs: nowMs });
  return title;
}
