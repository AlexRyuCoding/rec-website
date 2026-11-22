"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Music, Pause, Play, Plus, Radio } from "lucide-react";
import type { MusicSource, RadioPreset, SavedStation } from "@/lib/music";
import { goToStaffLogin } from "@/lib/staff-login-redirect";

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
  // Only in the reply to loading the panel, not to a settings change.
  stations?: SavedStation[];
  stationsAvailable?: boolean;
}

// The services' own marks, as single-colour glyphs (shapes from Simple
// Icons, CC0). Drawn in the text colour, so the caller decides the colour.
const GLYPHS = {
  spotify:
    "M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z",
  youtube:
    "M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z",
};

// Each service in its own colour: Spotify green, YouTube red. Radio has
// no brand of its own, so it takes the clinic's gold.
const SOURCE_COLOR: Partial<Record<MusicSource, string>> = {
  radio: "text-brand-accent",
  youtube: "text-[#FF0000]",
  spotify: "text-[#1ED760]",
};

// The small mark in front of a source's name. Decoration only — the name
// beside it is what is read out.
function SourceIcon({
  source,
  className = "",
}: {
  source: MusicSource;
  className?: string;
}) {
  if (source === "radio") {
    return <Radio aria-hidden className={`size-4 shrink-0 ${className}`} />;
  }
  if (source === "youtube" || source === "spotify") {
    return (
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        fill="currentColor"
        className={`size-4 shrink-0 ${className}`}
      >
        <path d={GLYPHS[source]} />
      </svg>
    );
  }
  return null;
}

const SOURCES: { id: MusicSource; label: string }[] = [
  { id: "off", label: "Off" },
  { id: "radio", label: "Radio" },
  { id: "youtube", label: "YouTube" },
  { id: "spotify", label: "Spotify" },
];

const OTHER_STATION = "other";
// <select> values for staff's own stations, kept apart from preset ids.
const MINE = "mine:";

function streamHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

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
//
// Radio stations come from two lists: the built-in presets, and "My
// stations" — ones staff have added (a name and a stream address) so they
// are pasted only once. Adding or removing a station never changes what
// is playing; only Save does.
export default function MusicPanel() {
  const [saved, setSaved] = useState<Settings | null>(null);
  const savedRef = useRef<Settings | null>(null);
  const [draft, setDraft] = useState<Settings | null>(null);
  const [spotify, setSpotify] = useState<SpotifyStatus | null>(null);
  const [presets, setPresets] = useState<RadioPreset[]>([]);
  const [stations, setStations] = useState<SavedStation[]>([]);
  // false = the list couldn't be read (migration 0013 not applied yet).
  const [stationsAvailable, setStationsAvailable] = useState(true);
  const [removingId, setRemovingId] = useState<string | null>(null);
  // "Other station…" was picked by hand: keep its fields open even if what
  // is typed happens to match a listed station, or is still empty.
  const [otherChosen, setOtherChosen] = useState(false);
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
    if (data.stations) setStations(data.stations);
    if (data.stationsAvailable !== undefined) {
      setStationsAvailable(data.stationsAvailable);
    }
    if (!keepDraft) {
      setDraft(data.settings);
      setOtherChosen(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/music");
      if (res.status === 401) {
        goToStaffLogin();
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
          goToStaffLogin();
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

  const addStation = async () => {
    if (!draft) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/music/stations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: draft.radioName, url: draft.radioUrl }),
      });
      if (res.status === 401) {
        goToStaffLogin();
        return;
      }
      const data = (await res.json().catch(() => ({}))) as {
        station?: SavedStation;
        error?: string;
      };
      if (!res.ok || !data.station) {
        setMessage({
          ok: false,
          text:
            res.status === 400 && data.error
              ? data.error
              : "Couldn't add the station. If this is a new install, migration 0013 may not be applied yet.",
        });
        return;
      }
      const added = data.station;
      setStations((list) =>
        [...list, added].sort((a, b) => a.name.localeCompare(b.name))
      );
      // Show it selected in the list, with the tidied name and address.
      setDraft((d) =>
        d ? { ...d, radioUrl: added.url, radioName: added.name } : d
      );
      setOtherChosen(false);
      setMessage({
        ok: true,
        text: `${added.name} is in My stations. Press Save to play it.`,
      });
    } catch {
      setMessage({ ok: false, text: "Connection problem. Try again." });
    } finally {
      setBusy(false);
    }
  };

  const removeStation = async (station: SavedStation) => {
    setBusy(true);
    setRemovingId(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/music/stations/${station.id}`, {
        method: "DELETE",
      });
      if (res.status === 401) {
        goToStaffLogin();
        return;
      }
      // 404 = someone else already removed it: the same outcome.
      if (!res.ok && res.status !== 404) throw new Error("remove failed");
      setStations((list) => list.filter((s) => s.id !== station.id));
      const playing =
        savedRef.current?.source === "radio" &&
        savedRef.current.radioUrl === station.url;
      setMessage({
        ok: true,
        text: playing
          ? `${station.name} is removed from My stations. It keeps playing until you choose something else.`
          : `${station.name} is removed from My stations.`,
      });
    } catch {
      setMessage({ ok: false, text: "Couldn't remove it. Try again." });
    } finally {
      setBusy(false);
    }
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
  // A dropdown must NOT be transparent: the browser paints the open list
  // itself, and with no background of its own it falls back to white —
  // under this page's light text. A solid dark background, dark-scheme
  // native controls, and the same colours on every entry keep the list
  // readable in every browser.
  const selectField =
    "w-full rounded-lg border border-brand-foreground bg-brand-background px-3 py-2 text-brand-foreground [color-scheme:dark]";
  const optionColors = "bg-brand-background text-brand-foreground";

  const set = (change: Partial<Settings>) =>
    setDraft((d) => (d ? { ...d, ...change } : d));

  // Which entry of the Station list the address in the form stands for.
  const mine = draft ? stations.find((s) => s.url === draft.radioUrl) : null;
  const preset = draft ? presets.find((p) => p.url === draft.radioUrl) : null;
  const stationChoice = otherChosen
    ? OTHER_STATION
    : mine
      ? `${MINE}${mine.id}`
      : preset
        ? preset.id
        : draft?.radioUrl
          ? OTHER_STATION
          : "";

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
                className={`flex items-center gap-2 px-5 py-2 rounded-full border transition-colors ${
                  draft.source === s.id
                    ? "border-brand-primary bg-brand-primary text-white"
                    : "border-brand-foreground hover:bg-brand-muted"
                }`}
              >
                {/* In its brand colour; white on the filled (chosen)
                    button, where green or red on teal would be hard to
                    see. */}
                <SourceIcon
                  source={s.id}
                  className={
                    draft.source === s.id ? "" : (SOURCE_COLOR[s.id] ?? "")
                  }
                />
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
                    value={stationChoice}
                    onChange={(e) => {
                      const value = e.target.value;
                      const pickedMine = value.startsWith(MINE)
                        ? stations.find((s) => MINE + s.id === value)
                        : undefined;
                      const pickedPreset = presets.find((p) => p.id === value);
                      setOtherChosen(value === OTHER_STATION);
                      if (pickedMine) {
                        // The name goes along, so the screen shows it (and
                        // keeps showing it if the station is later removed).
                        set({
                          radioUrl: pickedMine.url,
                          radioName: pickedMine.name,
                        });
                      } else if (pickedPreset) {
                        set({ radioUrl: pickedPreset.url, radioName: "" });
                      } else {
                        set({ radioUrl: "", radioName: "" });
                      }
                    }}
                    className={selectField}
                  >
                    <option value="" disabled className={optionColors}>
                      Choose a station…
                    </option>
                    {stations.length > 0 && (
                      <optgroup label="My stations" className={optionColors}>
                        {stations.map((s) => (
                          <option
                            key={s.id}
                            value={MINE + s.id}
                            className={optionColors}
                          >
                            {s.name}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    <optgroup label="Built-in" className={optionColors}>
                      {presets.map((p) => (
                        <option
                          key={p.id}
                          value={p.id}
                          className={optionColors}
                        >
                          {p.name} — {p.about}
                        </option>
                      ))}
                    </optgroup>
                    <option value={OTHER_STATION} className={optionColors}>
                      Other station…
                    </option>
                  </select>
                </label>
                {stationChoice === OTHER_STATION && (
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
                    {stationsAvailable && (
                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          onClick={addStation}
                          disabled={
                            busy ||
                            !draft.radioUrl.trim() ||
                            !draft.radioName.trim()
                          }
                          className={`${pill} flex items-center gap-2`}
                        >
                          <Plus className="size-4" /> Add to My stations
                        </button>
                        <p className="text-sm opacity-60">
                          Keeps it in the Station list for next time.
                        </p>
                      </div>
                    )}
                  </>
                )}
                {stations.length > 0 && (
                  <div className="pt-2">
                    <h3 className="text-sm font-semibold">My stations</h3>
                    <ul className="mt-1 divide-y divide-brand-foreground/20">
                      {stations.map((s) => (
                        <li
                          key={s.id}
                          className="flex flex-wrap items-center justify-between gap-3 py-2"
                        >
                          <div className="min-w-0">
                            <p className="truncate font-medium">{s.name}</p>
                            <p className="truncate text-sm opacity-60">
                              {streamHost(s.url)}
                            </p>
                          </div>
                          {removingId === s.id ? (
                            <span className="flex items-center gap-2">
                              <button
                                onClick={() => removeStation(s)}
                                disabled={busy}
                                className="px-3 py-1 rounded-full bg-brand-danger text-white disabled:opacity-40"
                              >
                                Confirm remove
                              </button>
                              <button
                                onClick={() => setRemovingId(null)}
                                className="px-3 py-1 rounded-full border border-brand-foreground hover:bg-brand-muted transition-colors"
                              >
                                Cancel
                              </button>
                            </span>
                          ) : (
                            <button
                              onClick={() => setRemovingId(s.id)}
                              disabled={busy}
                              aria-label={`Remove ${s.name}`}
                              className="px-3 py-1 rounded-full border border-brand-foreground hover:bg-brand-muted transition-colors disabled:opacity-40"
                            >
                              Remove
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
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
