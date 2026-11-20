import { describe, expect, it, vi } from "vitest";
import {
  EMPTY_MUSIC_ROW,
  fetchIcyTitle,
  mergeMusicSettings,
  MusicRow,
  radioDisplayName,
  tvMusicFromRow,
} from "./music-server";
import { RADIO_PRESETS } from "./music";

const row = (over: Partial<MusicRow>): MusicRow => ({
  ...EMPTY_MUSIC_ROW,
  updated_at: "2026-11-20T18:00:00.000Z",
  ...over,
});

describe("tvMusicFromRow", () => {
  it("is off by default", () => {
    expect(tvMusicFromRow(EMPTY_MUSIC_ROW)).toEqual({ source: "off" });
  });

  it("describes a radio station, naming a preset by its address", () => {
    const preset = RADIO_PRESETS[0];
    expect(
      tvMusicFromRow(
        row({ source: "radio", radio_url: preset.url, volume: 40 })
      )
    ).toEqual({
      source: "radio",
      name: preset.name,
      url: preset.url,
      volume: 40,
      paused: false,
      rev: "2026-11-20T18:00:00.000Z",
    });
  });

  it("describes a YouTube video and a Spotify playlist", () => {
    expect(
      tvMusicFromRow(
        row({ source: "youtube", youtube_url: "https://youtu.be/dQw4w9WgXcQ" })
      )
    ).toMatchObject({
      source: "youtube",
      videoId: "dQw4w9WgXcQ",
      listId: null,
    });

    const playlist = "https://open.spotify.com/playlist/37i9dQZF1DWZqd5JICZI0u";
    expect(
      tvMusicFromRow(row({ source: "spotify", spotify_url: playlist }))
    ).toMatchObject({
      source: "spotify",
      uri: "spotify:playlist:37i9dQZF1DWZqd5JICZI0u",
      connected: false,
    });
    expect(
      tvMusicFromRow(
        row({
          source: "spotify",
          spotify_url: playlist,
          spotify_refresh_token: "v1.sealed",
        })
      )
    ).toMatchObject({ connected: true });
  });

  it("never sends the Spotify token to the TV", () => {
    const sent = JSON.stringify(
      tvMusicFromRow(
        row({
          source: "spotify",
          spotify_url: "spotify:playlist:37i9dQZF1DWZqd5JICZI0u",
          spotify_refresh_token: "v1.sealed-secret",
          spotify_account_name: "Clinic",
        })
      )
    );
    expect(sent).not.toContain("sealed-secret");
    expect(sent).not.toContain("Clinic");
  });

  it("turns a source with an unusable link into off", () => {
    expect(
      tvMusicFromRow(row({ source: "radio", radio_url: "http://x.test/s" }))
    ).toEqual({ source: "off" });
    expect(
      tvMusicFromRow(row({ source: "youtube", youtube_url: null }))
    ).toEqual({ source: "off" });
    expect(
      tvMusicFromRow(row({ source: "spotify", spotify_url: "nonsense" }))
    ).toEqual({ source: "off" });
  });
});

describe("radioDisplayName", () => {
  it("prefers what staff typed, then the preset, then the host", () => {
    const preset = RADIO_PRESETS[0];
    expect(radioDisplayName("  KUSC  ", preset.url)).toBe("KUSC");
    expect(radioDisplayName(null, preset.url)).toBe(preset.name);
    expect(radioDisplayName("", "https://www.example.org/live.mp3")).toBe(
      "example.org"
    );
  });
});

describe("mergeMusicSettings", () => {
  it("changes only what was sent", () => {
    const current = row({
      source: "radio",
      radio_url: RADIO_PRESETS[0].url,
      youtube_url: "https://youtu.be/dQw4w9WgXcQ",
      volume: 60,
    });
    const merged = mergeMusicSettings(current, { paused: true });
    expect(merged).toEqual({
      ok: true,
      values: {
        source: "radio",
        radio_name: null,
        radio_url: RADIO_PRESETS[0].url,
        youtube_url: "https://youtu.be/dQw4w9WgXcQ",
        spotify_url: null,
        volume: 60,
        paused: true,
      },
    });
  });

  it("refuses to switch to a source whose link is missing or wrong", () => {
    expect(mergeMusicSettings(row({}), { source: "radio" }).ok).toBe(false);
    expect(
      mergeMusicSettings(row({}), {
        source: "radio",
        radioUrl: "http://plain.example.com/stream",
      })
    ).toMatchObject({ ok: false });
    expect(
      mergeMusicSettings(row({}), { source: "youtube", youtubeUrl: "hello" }).ok
    ).toBe(false);
    expect(
      mergeMusicSettings(row({}), {
        source: "spotify",
        spotifyUrl: "https://open.spotify.com/track/37i9dQZF1DWZqd5JICZI0u",
      }).ok
    ).toBe(false);
  });

  it("does not let a half-typed link for another source block a change", () => {
    const current = row({ source: "radio", radio_url: RADIO_PRESETS[0].url });
    const merged = mergeMusicSettings(current, {
      youtubeUrl: "https://youtu",
      volume: 30,
    });
    expect(merged.ok).toBe(true);
  });

  it("tidies the stream address and turns empty text into nothing", () => {
    const merged = mergeMusicSettings(row({}), {
      source: "radio",
      radioUrl: "  stream.radioparadise.com/serenity ",
      radioName: "   ",
    });
    expect(merged).toMatchObject({
      ok: true,
      values: {
        radio_url: "https://stream.radioparadise.com/serenity",
        radio_name: null,
      },
    });
  });

  it("always allows switching off", () => {
    expect(
      mergeMusicSettings(row({ source: "youtube", youtube_url: "broken" }), {
        source: "off",
      }).ok
    ).toBe(true);
  });
});

describe("fetchIcyTitle", () => {
  function icyResponse(metaint: number, text: string, chunk = 4096): Response {
    const meta = new TextEncoder().encode(text);
    const blocks = Math.ceil(meta.length / 16);
    const bytes = new Uint8Array(metaint + 1 + blocks * 16 + 100_000);
    bytes[metaint] = blocks;
    bytes.set(meta, metaint + 1);
    let sent = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent >= bytes.length) return controller.close();
        controller.enqueue(bytes.subarray(sent, sent + chunk));
        sent += chunk;
      },
    });
    return new Response(body, {
      headers: { "icy-metaint": String(metaint), "content-type": "audio/mpeg" },
    });
  }

  it("reads the track name out of the stream and asks for it by header", async () => {
    const fetchImpl = vi.fn(async () =>
      icyResponse(16000, "StreamTitle='Mosca - Brand New Polaroid';")
    );
    const title = await fetchIcyTitle(
      "https://a.example.com/one",
      1_000_000,
      fetchImpl as unknown as typeof fetch
    );
    expect(title).toBe("Mosca - Brand New Polaroid");
    const init = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect((init[1].headers as Record<string, string>)["Icy-MetaData"]).toBe(
      "1"
    );
  });

  it("answers from memory for a few seconds instead of reconnecting", async () => {
    const fetchImpl = vi.fn(async () =>
      icyResponse(8192, "StreamTitle='A - B';")
    );
    const impl = fetchImpl as unknown as typeof fetch;
    const url = "https://a.example.com/two";
    await fetchIcyTitle(url, 1_000_000, impl);
    await fetchIcyTitle(url, 1_010_000, impl);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await fetchIcyTitle(url, 1_020_000, impl);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("gives null for a station that announces nothing, or is down", async () => {
    const plain = vi.fn(
      async () => new Response("audio", { headers: {} })
    ) as unknown as typeof fetch;
    expect(await fetchIcyTitle("https://a.example.com/3", 1, plain)).toBeNull();

    const down = vi.fn(async () => {
      throw new Error("unreachable");
    }) as unknown as typeof fetch;
    expect(await fetchIcyTitle("https://a.example.com/4", 1, down)).toBeNull();

    const absurd = vi.fn(async () =>
      icyResponse(16000, "x").clone()
    ) as unknown as typeof fetch;
    // A sane block with no StreamTitle in it.
    expect(
      await fetchIcyTitle("https://a.example.com/5", 1, absurd)
    ).toBeNull();
  });
});
