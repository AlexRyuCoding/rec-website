import { describe, expect, it } from "vitest";
import {
  checkStreamUrl,
  extractIcyBlock,
  formatTrackTime,
  parseIcyTitle,
  parseSpotifyLink,
  parseYouTubeLink,
  playerVolume,
  progressAt,
  RADIO_PRESETS,
} from "./music";

describe("checkStreamUrl", () => {
  it("accepts a public https stream", () => {
    expect(
      checkStreamUrl(" https://ice1.somafm.com/dronezone-128-mp3 ")
    ).toEqual({ ok: true, url: "https://ice1.somafm.com/dronezone-128-mp3" });
  });

  it("assumes https when staff leave the scheme off", () => {
    expect(checkStreamUrl("stream.radioparadise.com/serenity")).toEqual({
      ok: true,
      url: "https://stream.radioparadise.com/serenity",
    });
  });

  it("refuses http, which an https page will not play", () => {
    const result = checkStreamUrl("http://example.com/stream");
    expect(result.ok).toBe(false);
  });

  it.each([
    "https://localhost/stream",
    "https://127.0.0.1/stream",
    "https://10.0.0.5:8000/stream",
    "https://[::1]/stream",
    "https://printer.local/stream",
    "https://intranet/stream",
    "https://user:pw@example.com/stream",
    "",
    "not a url at all",
  ])("refuses %s", (input) => {
    expect(checkStreamUrl(input).ok).toBe(false);
  });

  it("every preset passes its own check", () => {
    for (const preset of RADIO_PRESETS) {
      expect(checkStreamUrl(preset.url)).toEqual({ ok: true, url: preset.url });
    }
  });
});

describe("parseYouTubeLink", () => {
  const id = "dQw4w9WgXcQ";
  const list = "PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf";

  it.each([
    [`https://www.youtube.com/watch?v=${id}`],
    [`https://youtu.be/${id}?si=abc`],
    [`https://www.youtube.com/live/${id}`],
    [`https://www.youtube.com/embed/${id}`],
    [`https://m.youtube.com/watch?v=${id}&t=30s`],
    [`youtube.com/watch?v=${id}`],
    [id],
  ])("reads the video from %s", (input) => {
    expect(parseYouTubeLink(input)).toEqual({ videoId: id, listId: null });
  });

  it("reads a playlist", () => {
    expect(
      parseYouTubeLink(`https://www.youtube.com/playlist?list=${list}`)
    ).toEqual({ videoId: null, listId: list });
  });

  it("keeps both for a video inside a playlist", () => {
    expect(
      parseYouTubeLink(`https://www.youtube.com/watch?v=${id}&list=${list}`)
    ).toEqual({ videoId: id, listId: list });
  });

  it.each([
    "https://vimeo.com/123456789",
    "https://www.youtube.com/",
    "https://www.youtube.com/watch?v=short",
    "https://www.youtube.com/@somechannel",
    "",
  ])("refuses %s", (input) => {
    expect(parseYouTubeLink(input)).toBeNull();
  });

  it("ignores private list names like Watch Later", () => {
    expect(
      parseYouTubeLink(`https://www.youtube.com/watch?v=${id}&list=WL`)
    ).toEqual({ videoId: id, listId: null });
  });
});

describe("parseSpotifyLink", () => {
  const id = "37i9dQZF1DWZqd5JICZI0u";

  it("reads a shared playlist link", () => {
    expect(
      parseSpotifyLink(`https://open.spotify.com/playlist/${id}?si=xyz`)
    ).toEqual({ kind: "playlist", id, uri: `spotify:playlist:${id}` });
  });

  it("reads a link with a language prefix", () => {
    expect(
      parseSpotifyLink(`https://open.spotify.com/intl-de/album/${id}`)
    ).toEqual({ kind: "album", id, uri: `spotify:album:${id}` });
  });

  it("reads a spotify: URI", () => {
    expect(parseSpotifyLink(`spotify:artist:${id}`)?.uri).toBe(
      `spotify:artist:${id}`
    );
  });

  it.each([
    // A single track is not something that plays all day.
    `https://open.spotify.com/track/${id}`,
    "https://open.spotify.com/playlist/tooshort",
    `https://example.com/playlist/${id}`,
    "spotify:playlist:",
    "",
  ])("refuses %s", (input) => {
    expect(parseSpotifyLink(input)).toBeNull();
  });
});

describe("radio track names", () => {
  function stream(metaint: number, text: string): Uint8Array {
    const meta = new TextEncoder().encode(text);
    const blocks = Math.ceil(meta.length / 16);
    const bytes = new Uint8Array(metaint + 1 + blocks * 16 + 50);
    bytes.fill(0xaa, 0, metaint);
    bytes[metaint] = blocks;
    bytes.set(meta, metaint + 1);
    return bytes;
  }

  it("finds the block after the first stretch of audio", () => {
    const text = "StreamTitle='Rule 42 - Earendel';StreamUrl='';";
    const block = extractIcyBlock(stream(16000, text), 16000);
    expect(block).toBe(text);
    expect(parseIcyTitle(block!)).toBe("Rule 42 - Earendel");
  });

  it("asks for more bytes until the whole block has arrived", () => {
    const bytes = stream(16000, "StreamTitle='A - B';");
    expect(extractIcyBlock(bytes.subarray(0, 16000), 16000)).toBeNull();
    expect(extractIcyBlock(bytes.subarray(0, 16010), 16000)).toBeNull();
  });

  it("reads an empty block as nothing announced", () => {
    const bytes = new Uint8Array(200);
    expect(extractIcyBlock(bytes, 100)).toBe("");
    expect(parseIcyTitle("")).toBeNull();
  });

  it("keeps apostrophes inside a title", () => {
    expect(parseIcyTitle("StreamTitle='Don't Panic - It's Fine';")).toBe(
      "Don't Panic - It's Fine"
    );
  });

  it("treats a bare dash as no title", () => {
    expect(parseIcyTitle("StreamTitle=' - ';")).toBeNull();
    expect(parseIcyTitle("StreamTitle='';")).toBeNull();
  });
});

describe("progressAt", () => {
  const base = { positionMs: 60_000, durationMs: 180_000, atMs: 1_000_000 };

  it("moves with the clock while running", () => {
    const p = progressAt({ ...base, running: true }, 1_030_000);
    expect(p.positionMs).toBe(90_000);
    expect(p.fraction).toBeCloseTo(0.5);
  });

  it("stays put while paused", () => {
    expect(progressAt({ ...base, running: false }, 1_030_000).positionMs).toBe(
      60_000
    );
  });

  it("never runs past the end or before the reading", () => {
    expect(progressAt({ ...base, running: true }, 9_000_000)).toEqual({
      positionMs: 180_000,
      fraction: 1,
    });
    expect(progressAt({ ...base, running: true }, 0).positionMs).toBe(60_000);
  });

  it("gives 0 for an unknown length", () => {
    expect(
      progressAt({ ...base, durationMs: 0, running: true }, 1_030_000).fraction
    ).toBe(0);
  });
});

describe("formatTrackTime", () => {
  it.each([
    [0, "0:00"],
    [134_000, "2:14"],
    [599_999, "9:59"],
    [3_734_000, "1:02:14"],
    [-5, "0:00"],
  ])("%d ms -> %s", (ms, text) => {
    expect(formatTrackTime(ms)).toBe(text);
  });
});

describe("playerVolume", () => {
  it("scales 0–100 to 0–1 and dips while a patient is called", () => {
    expect(playerVolume(60, false)).toBeCloseTo(0.6);
    expect(playerVolume(60, true)).toBeCloseTo(0.15);
    expect(playerVolume(250, false)).toBe(1);
    expect(playerVolume(-3, false)).toBe(0);
  });
});
