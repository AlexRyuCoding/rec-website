import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchWithTimeout } from "./fetch-timeout";
import { MUSIC_TABLE } from "./music-server";
import { openSecret, sealSecret } from "./secret-box";

// The clinic's Spotify connection. A staff member connects the clinic's
// Premium account once (Dashboard → Waiting-room music → Connect Spotify,
// the standard authorization-code flow). The long-lived refresh token is
// stored encrypted; the TV is only ever handed a one-hour access token,
// which is what Spotify's in-browser player needs to play.

const TOKEN_URL = "https://accounts.spotify.com/api/token";
const AUTHORIZE_URL = "https://accounts.spotify.com/authorize";
const SEAL_PURPOSE = "spotify-refresh-token";
const REQUEST_TIMEOUT_MS = 8000;

// "streaming" plays in the browser (with the two user-read scopes the
// Web Playback SDK asks for); the playback scopes let the TV start the
// chosen playlist on itself and set shuffle/repeat.
export const SPOTIFY_SCOPES = [
  "streaming",
  "user-read-email",
  "user-read-private",
  "user-read-playback-state",
  "user-modify-playback-state",
];

export const SPOTIFY_STATE_COOKIE = "rac_spotify_state";

export function spotifyConfigured(): boolean {
  return Boolean(
    process.env.SPOTIFY_CLIENT_ID &&
      process.env.SPOTIFY_CLIENT_SECRET &&
      process.env.NEXTAUTH_SECRET
  );
}

// Must match a Redirect URI saved in the Spotify app's settings exactly.
// Spotify refuses "localhost": for local development set
// SPOTIFY_REDIRECT_URI=http://127.0.0.1:3000/api/admin/spotify/callback.
export function spotifyRedirectUri(): string {
  if (process.env.SPOTIFY_REDIRECT_URI) return process.env.SPOTIFY_REDIRECT_URI;
  const base = (process.env.NEXTAUTH_URL ?? "").replace(/\/+$/, "");
  return `${base}/api/admin/spotify/callback`;
}

export function spotifyAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.SPOTIFY_CLIENT_ID ?? "",
    scope: SPOTIFY_SCOPES.join(" "),
    redirect_uri: spotifyRedirectUri(),
    state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

interface TokenReply {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
}

type TokenResult =
  | { ok: true; reply: TokenReply }
  // Spotify said no (revoked access, bad code): asking again won't help.
  | { ok: false; refused: true }
  // Could not reach Spotify, or it had a bad moment: worth retrying.
  | { ok: false; refused: false };

async function requestToken(
  params: Record<string, string>
): Promise<TokenResult> {
  const basic = Buffer.from(
    `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
  ).toString("base64");
  try {
    const res = await fetchWithTimeout(
      TOKEN_URL,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${basic}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams(params).toString(),
        cache: "no-store",
      },
      REQUEST_TIMEOUT_MS
    );
    if (res.status >= 400 && res.status < 500 && res.status !== 429) {
      return { ok: false, refused: true };
    }
    if (!res.ok) return { ok: false, refused: false };
    const reply = (await res.json()) as Partial<TokenReply>;
    if (typeof reply.access_token !== "string") {
      return { ok: false, refused: false };
    }
    return {
      ok: true,
      reply: {
        access_token: reply.access_token,
        expires_in:
          typeof reply.expires_in === "number" ? reply.expires_in : 3600,
        refresh_token: reply.refresh_token,
      },
    };
  } catch {
    return { ok: false, refused: false };
  }
}

// Step 2 of connecting: swap the one-time code Spotify sent back for
// tokens, and note whose account it is so the dashboard can say so.
export async function connectSpotify(
  supabase: SupabaseClient,
  code: string
): Promise<boolean> {
  const result = await requestToken({
    grant_type: "authorization_code",
    code,
    redirect_uri: spotifyRedirectUri(),
  });
  if (!result.ok || !result.reply.refresh_token) return false;

  let accountName: string | null = null;
  try {
    const me = await fetchWithTimeout(
      "https://api.spotify.com/v1/me",
      {
        headers: { Authorization: `Bearer ${result.reply.access_token}` },
        cache: "no-store",
      },
      REQUEST_TIMEOUT_MS
    );
    if (me.ok) {
      const profile = (await me.json()) as {
        display_name?: string;
        id?: string;
      };
      accountName = profile.display_name || profile.id || null;
    }
  } catch {
    // The name is a nicety; the connection works without it.
  }

  const { error } = await supabase.from(MUSIC_TABLE).upsert({
    id: true,
    spotify_refresh_token: sealSecret(
      result.reply.refresh_token,
      process.env.NEXTAUTH_SECRET!,
      SEAL_PURPOSE
    ),
    spotify_account_name: accountName,
    spotify_connected_at: new Date().toISOString(),
  });
  accessCache = null;
  return !error;
}

export async function disconnectSpotify(
  supabase: SupabaseClient
): Promise<boolean> {
  const { error } = await supabase
    .from(MUSIC_TABLE)
    .update({
      spotify_refresh_token: null,
      spotify_account_name: null,
      spotify_connected_at: null,
    })
    .eq("id", true);
  accessCache = null;
  return !error;
}

export type AccessTokenResult =
  | { ok: true; accessToken: string; expiresInS: number }
  | {
      ok: false;
      // not_connected / refused: staff must (re)connect in the dashboard.
      // unavailable: temporary — the TV just asks again.
      reason: "not_connected" | "refused" | "unavailable";
    };

// One access token is good for an hour; reuse it while this server
// instance lives instead of asking Spotify on every request.
let accessCache: {
  sealed: string;
  accessToken: string;
  expiresAtMs: number;
} | null = null;
const EXPIRY_MARGIN_MS = 5 * 60 * 1000;

export async function getSpotifyAccessToken(
  supabase: SupabaseClient,
  nowMs: number = Date.now()
): Promise<AccessTokenResult> {
  if (!spotifyConfigured()) return { ok: false, reason: "not_connected" };

  const { data, error } = await supabase
    .from(MUSIC_TABLE)
    .select("spotify_refresh_token")
    .eq("id", true)
    .maybeSingle();
  if (error) return { ok: false, reason: "unavailable" };
  const sealed: string | null = data?.spotify_refresh_token ?? null;
  if (!sealed) return { ok: false, reason: "not_connected" };

  if (
    accessCache &&
    accessCache.sealed === sealed &&
    accessCache.expiresAtMs - nowMs > EXPIRY_MARGIN_MS
  ) {
    return {
      ok: true,
      accessToken: accessCache.accessToken,
      expiresInS: Math.floor((accessCache.expiresAtMs - nowMs) / 1000),
    };
  }

  const refreshToken = openSecret(
    sealed,
    process.env.NEXTAUTH_SECRET!,
    SEAL_PURPOSE
  );
  // Sealed with an older NEXTAUTH_SECRET: only reconnecting fixes it.
  if (!refreshToken) return { ok: false, reason: "refused" };

  const result = await requestToken({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  if (!result.ok) {
    return { ok: false, reason: result.refused ? "refused" : "unavailable" };
  }

  // Spotify may hand out a replacement refresh token; the old one then
  // stops working, so keep the new one.
  let storedAs = sealed;
  if (
    result.reply.refresh_token &&
    result.reply.refresh_token !== refreshToken
  ) {
    const next = sealSecret(
      result.reply.refresh_token,
      process.env.NEXTAUTH_SECRET!,
      SEAL_PURPOSE
    );
    const { error: saveError } = await supabase
      .from(MUSIC_TABLE)
      .update({ spotify_refresh_token: next })
      .eq("id", true);
    if (!saveError) storedAs = next;
  }

  accessCache = {
    sealed: storedAs,
    accessToken: result.reply.access_token,
    expiresAtMs: nowMs + result.reply.expires_in * 1000,
  };
  return {
    ok: true,
    accessToken: result.reply.access_token,
    expiresInS: result.reply.expires_in,
  };
}
