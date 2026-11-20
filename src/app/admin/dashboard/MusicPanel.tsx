"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Music, Pause, Play } from "lucide-react";
import type { MusicSource, RadioPreset } from "@/lib/music";

interface Settings {
  source: MusicSource;
  radioName: string;
  radioUrl: string;
  youtubeUrl: string;
  spotifyUrl: string;
  volume: number;
  paused: boolean;
}

interface SpotifyStatus {
  // The server has Spotify app keys (SPOTIFY_CLIENT_ID / _SECRET).
  configured: boolean;
  connected: boolean;
  accountName: string | null;
}

interface Reply {
  settings: Settings;
  spotify: SpotifyStatus;
  presets: RadioPreset[];
}

const SOURCES: { id: MusicSource; label: string }[] = [
  { id: "off", label: "Off" },
  { id: "radio", label: "Radio" },
  { id: "youtube", label: "YouTube" },
  { id: "spotify", label: "Spotify" },
];

const OTHER_STATION = "other";

const SPOTIFY_RESULT: Record<string, { ok: boolean; text: string }> = {
  connected: { ok: true, text: "Spotify is connected." },
  failed: {
    ok: false,
    text: "Spotify wasn't connected. Try again, and choose Agree on Spotify's page.",
  },
  "not-configured": {
    ok: false,
    text: "Spotify isn't set up on the server yet (SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET).",
  },
};

// Background music for the waiting-room TV. Staff pick one source; the TV
// switches within a second or two of Save and shows what is playing at
// the top of the screen. Pause and volume apply straight away, without
// touching whatever is half-typed in the form.
export default function MusicPanel() {
  const [saved, setSaved] = useState<Settings | null>(null);
  const savedRef = useRef<Settings | null>(null);
  const [draft, setDraft] = useState<Settings | null>(null);
  const [spotify, setSpotify] = useState<SpotifyStatus | null>(null);
  const [presets, setPresets] = useState<RadioPreset[]>([]);
  // "Other station…" is a choice of its own, even before an address is typed.
  const [customStation, setCustomStation] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null
  );

  const accept = useCallback((data: Reply, keepDraft: boolean) => {
    savedRef.current = data.settings;
    setSaved(data.settings);
    setSpotify(data.spotify);
    setPresets(data.presets);
    if (!keepDraft) {
      setDraft(data.settings);
      setCustomStation(
        data.settings.radioUrl !== "" &&
          !data.presets.some((p) => p.url === data.settings.radioUrl)
      );
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/music");
      if (res.status === 401) {
        window.location.href = "/admin/login";
        return;
      }
      if (!res.ok) {
        setFailed(true);
        return;
      }
      setFailed(false);
      accept((await res.json()) as Reply, false);
    } catch {
      setFailed(true);
    }
  }, [accept]);

  useEffect(() => {
    refresh();
    // Back from Spotify's consent page: say how it went, then tidy the
    // address so a reload does not say it again.
    const params = new URLSearchParams(window.location.search);
    const result = params.get("spotify");
    if (result && SPOTIFY_RESULT[result]) {
      setMessage(SPOTIFY_RESULT[result]);
      params.delete("spotify");
      const query = params.toString();
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`
      );
    }
  }, [refresh]);

  // Sends only the given fields. `keepDraft` is for pause/volume: they
  // must not overwrite what is being typed.
  const send = useCallback(
    async (
      change: Partial<Settings>,
      { keepDraft, done }: { keepDraft: boolean; done?: string }
    ) => {
      setBusy(true);
      setMessage(null);
      let ok = false;
      try {
        const res = await fetch("/api/admin/music", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(change),
        });
        if (res.status === 401) {
          window.location.href = "/admin/login";
          return;
        }
        const data = (await res.json().catch(() => ({}))) as Partial<Reply> & {
          error?: string;
        };
        if (!res.ok || !data.settings) {
          setMessage({
            ok: false,
            text:
              res.status === 400 && data.error
                ? data.error
                : "Couldn't save. Try again.",
          });
          return;
        }
        ok = true;
        const paused = data.settings.paused;
        accept(data as Reply, keepDraft);
        // The slider keeps wherever it is now: it may have moved again
        // while this was being saved.
        if (keepDraft) setDraft((d) => (d ? { ...d, paused } : d));
        if (done) setMessage({ ok: true, text: done });
      } catch {
        setMessage({ ok: false, text: "Connection problem. Try again." });
      } finally {
        // A volume that could not be saved snaps back, so the slider
        // never shows a level the screen is not playing at (and the
        // save below does not retry in a loop).
        const current = savedRef.current;
        if (!ok && change.volume !== undefined && current) {
          setDraft((d) => (d ? { ...d, volume: current.volume } : d));
        }
        setBusy(false);
      }
    },
    [accept]
  );

  // The volume saves itself shortly after the slider stops moving.
  const draftVolume = draft?.volume;
  const savedVolume = saved?.volume;
  useEffect(() => {
    if (draftVolume === undefined || savedVolume === undefined) return;
    if (busy || draftVolume === savedVolume) return;
    const timer = setTimeout(
      () => send({ volume: draftVolume }, { keepDraft: true }),
      400
    );
    return () => clearTimeout(timer);
  }, [draftVolume, savedVolume, busy, send]);

  const save = () => {
    if (!draft) return;
    send(
      {
        source: draft.source,
        radioName: draft.radioName,
        radioUrl: draft.radioUrl,
        youtubeUrl: draft.youtubeUrl,
        spotifyUrl: draft.spotifyUrl,
        // Choosing something new is a request to hear it.
        paused: false,
      },
      {
        keepDraft: false,
        done:
          draft.source === "off"
            ? "Music is off."
            : "Saved. The waiting-room screen switches within a few seconds.",
      }
    );
  };

  const disconnectSpotify = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/spotify", { method: "DELETE" });
      if (!res.ok) throw new Error("disconnect failed");
      await refresh();
      setMessage({ ok: true, text: "Spotify is disconnected." });
    } catch {
      setMessage({ ok: false, text: "Couldn't disconnect. Try again." });
    } finally {
      setBusy(false);
    }
  };

  const pill =
    "px-4 py-2 rounded-full border border-brand-foreground hover:bg-brand-muted transition-colors disabled:opacity-40";
  const field =
    "w-full rounded-lg border border-brand-foreground bg-transparent px-3 py-2 placeholder:opacity-40";

  const set = (change: Partial<Settings>) =>
    setDraft((d) => (d ? { ...d, ...change } : d));

  const presetId =
    draft && !customStation
      ? (presets.find((p) => p.url === draft.radioUrl)?.id ?? "")
      : OTHER_STATION;

  const playingSomething = saved !== null && saved.source !== "off";

  return (
    <section
      id="music"
      className="mt-10 scroll-mt-6 border border-brand-foreground rounded-lg p-6"
    >
      <h2 className="mb-2 flex items-center gap-2 text-xl font-semibold">
        <Music className="size-5" />
        Waiting-room music
      </h2>
      <p className="mb-5 text-sm opacity-70">
        Plays through the waiting-room screen, which shows what is playing at
        the top. It starts once someone has clicked that screen&apos;s page (the
        same click that turns on the call chime), and dips for a moment whenever
        a patient is called.
      </p>

      {!draft || !saved ? (
        <p className="text-sm opacity-60">
          {failed
            ? "Music settings couldn't be loaded. If this is a new install, migration 0012 may not be applied yet."
            : "Loading…"}
        </p>
      ) : (
        <>
          <div
            role="radiogroup"
            aria-label="Music source"
            className="flex flex-wrap gap-2"
          >
            {SOURCES.map((s) => (
              <button
                key={s.id}
                role="radio"
                aria-checked={draft.source === s.id}
                onClick={() => set({ source: s.id })}
                className={`px-5 py-2 rounded-full border transition-colors ${
                  draft.source === s.id
                    ? "border-brand-primary bg-brand-primary text-white"
                    : "border-brand-foreground hover:bg-brand-muted"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          <div className="mt-5 max-w-2xl space-y-3">
            {draft.source === "radio" && (
              <>
                <label className="flex flex-col gap-1 text-sm">
                  Station
                  <select
                    value={presetId}
                    onChange={(e) => {
                      const preset = presets.find(
                        (p) => p.id === e.target.value
                      );
                      if (preset) {
                        setCustomStation(false);
                        set({ radioUrl: preset.url, radioName: "" });
                      } else {
                        setCustomStation(e.target.value === OTHER_STATION);
                        set({ radioUrl: "", radioName: "" });
                      }
                    }}
                    className={`${field} bg-brand-background`}
                  >
                    <option value="" disabled>
                      Choose a station…
                    </option>
                    {presets.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} — {p.about}
                      </option>
                    ))}
                    <option value={OTHER_STATION}>Other station…</option>
                  </select>
                </label>
                {presetId === OTHER_STATION && (
                  <>
                    <label className="flex flex-col gap-1 text-sm">
                      Stream address
                      <input
                        value={draft.radioUrl}
                        onChange={(e) => set({ radioUrl: e.target.value })}
                        placeholder="https://…"
                        inputMode="url"
                        spellCheck={false}
                        autoComplete="off"
                        maxLength={500}
                        className={field}
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-sm">
                      Station name (shown on the screen)
                      <input
                        value={draft.radioName}
                        onChange={(e) => set({ radioName: e.target.value })}
                        placeholder="e.g. KUSC Classical"
                        maxLength={60}
                        className={field}
                      />
                    </label>
                    <p className="text-sm opacity-60">
                      Use the station&apos;s direct stream address (it usually
                      ends in .mp3 or .aac and starts with https://), not the
                      address of its website.
                    </p>
                  </>
                )}
              </>
            )}

            {draft.source === "youtube" && (
              <>
                <label className="flex flex-col gap-1 text-sm">
                  YouTube link
                  <input
                    value={draft.youtubeUrl}
                    onChange={(e) => set({ youtubeUrl: e.target.value })}
                    placeholder="https://www.youtube.com/watch?v=…"
                    inputMode="url"
                    spellCheck={false}
                    autoComplete="off"
                    maxLength={500}
                    className={field}
                  />
                </label>
                <p className="text-sm opacity-60">
                  A long video, a live stream or a playlist. Only the sound
                  plays; a single video repeats when it ends. YouTube may play
                  adverts unless the screen&apos;s browser is signed in to a
                  YouTube Premium account.
                </p>
              </>
            )}

            {draft.source === "spotify" && spotify && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-brand-foreground/40 px-4 py-3">
                  {spotify.connected ? (
                    <>
                      <p className="text-sm">
                        Connected
                        {spotify.accountName && (
                          <>
                            {" "}
                            as <strong>{spotify.accountName}</strong>
                          </>
                        )}
                      </p>
                      <button
                        onClick={disconnectSpotify}
                        disabled={busy}
                        className="px-3 py-1 rounded-full border border-brand-foreground hover:bg-brand-muted transition-colors disabled:opacity-40"
                      >
                        Disconnect
                      </button>
                    </>
                  ) : spotify.configured ? (
                    <>
                      <p className="text-sm">
                        No Spotify account connected yet (Premium needed).
                      </p>
                      {/* A full page load on purpose: it leaves for
                          Spotify's own sign-in page. */}
                      <a href="/api/admin/spotify/login" className={pill}>
                        Connect Spotify
                      </a>
                    </>
                  ) : (
                    <p className="text-sm text-brand-danger">
                      Spotify isn&apos;t set up on the server yet: add
                      SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in Vercel,
                      then reload this page.
                    </p>
                  )}
                </div>
                <label className="flex flex-col gap-1 text-sm">
                  Spotify playlist link
                  <input
                    value={draft.spotifyUrl}
                    onChange={(e) => set({ spotifyUrl: e.target.value })}
                    placeholder="https://open.spotify.com/playlist/…"
                    inputMode="url"
                    spellCheck={false}
                    autoComplete="off"
                    maxLength={500}
                    className={field}
                  />
                </label>
                <p className="text-sm opacity-60">
                  In Spotify: Share → Copy link to playlist (an album or artist
                  link works too). Spotify plays on one device at a time:
                  starting music on this account anywhere else stops it on the
                  screen until you press Save here again.
                </p>
              </>
            )}
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              onClick={save}
              disabled={busy}
              className="px-5 py-2 rounded-full bg-brand-primary text-white hover:bg-brand-secondary transition-colors disabled:opacity-40"
            >
              Save
            </button>
            {message && (
              <p
                role="status"
                className={`text-sm ${
                  message.ok ? "text-brand-primary" : "text-brand-danger"
                }`}
              >
                {message.text}
              </p>
            )}
          </div>

          {playingSomething && (
            <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-brand-foreground/20 pt-5">
              <button
                onClick={() =>
                  send({ paused: !saved.paused }, { keepDraft: true })
                }
                disabled={busy}
                className={`${pill} flex items-center gap-2`}
              >
                {saved.paused ? (
                  <>
                    <Play className="size-4" /> Resume music
                  </>
                ) : (
                  <>
                    <Pause className="size-4" /> Pause music
                  </>
                )}
              </button>
              <label className="flex items-center gap-3 text-sm">
                Volume
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={draft.volume}
                  onChange={(e) => set({ volume: Number(e.target.value) })}
                  className="w-48 accent-brand-primary"
                />
                <span className="w-10 tabular-nums">{draft.volume}%</span>
              </label>
            </div>
          )}
        </>
      )}
    </section>
  );
}
