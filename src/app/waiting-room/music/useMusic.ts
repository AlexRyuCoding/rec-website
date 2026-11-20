"use client";
import { NowPlaying, playerVolume, TvMusic } from "@/lib/music";
import { useRadio } from "./useRadio";
import { useSpotify } from "./useSpotify";
import { useYouTube } from "./useYouTube";

// Plays whatever staff chose for the waiting room and reports what is
// playing, for the bar at the top of the board. All three players are
// always mounted (hooks cannot come and go); the two that are not chosen
// are handed nothing and stay idle — they load no outside code.
//
//   armed   the page has been clicked once, so the browser allows sound.
//           Nothing starts before that: a staff member previewing the
//           screen on another computer must not start a second copy of
//           the music (or pull Spotify away from the TV) just by looking.
//   ducked  a patient is being called: drop the music under the chime.
export function useMusic(
  music: TvMusic,
  { armed, ducked }: { armed: boolean; ducked: boolean }
): NowPlaying | null {
  const on = music.source !== "off";
  const volume = on ? playerVolume(music.volume, ducked) : 0;
  const paused = on ? music.paused : false;

  const radio = useRadio(
    music.source === "radio" ? music : null,
    volume,
    paused,
    armed
  );
  const youtube = useYouTube(
    music.source === "youtube" ? music : null,
    volume,
    paused,
    armed
  );
  const spotify = useSpotify(
    music.source === "spotify" ? music : null,
    volume,
    paused,
    armed
  );

  return radio ?? youtube ?? spotify;
}
