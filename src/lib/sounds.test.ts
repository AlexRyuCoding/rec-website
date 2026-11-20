import { describe, expect, it } from "vitest";
import {
  SOUND_IDS,
  soundContour,
  soundDuration,
  SOUNDS,
  STAFF_SOUND_IDS,
} from "./sounds";

const freqs = (id: keyof typeof SOUNDS) => SOUNDS[id].tones.map((t) => t.freq);

describe("alert sounds", () => {
  it("patient waiting is a doorbell: three ding-dongs, each one falling", () => {
    const { tones } = SOUNDS.patient_waiting;
    expect(tones).toHaveLength(6);
    for (let ring = 0; ring < 3; ring++) {
      const ding = tones[ring * 2];
      const dong = tones[ring * 2 + 1];
      expect(ding.freq).toBeGreaterThan(dong.freq);
      expect(dong.at).toBeGreaterThan(ding.at);
    }
    // Struck and left to ring, with overtones: a bell, not a beep.
    expect(tones.every((t) => t.shape === "ring")).toBe(true);
    expect(tones.every((t) => (t.partials?.length ?? 0) >= 3)).toBe(true);
    expect(soundContour(SOUNDS.patient_waiting)).toBe("falling-pairs");
  });

  it("timer done is a timer: bursts of quick beeps on one high pitch", () => {
    const { tones } = SOUNDS.timer_done;
    expect(new Set(freqs("timer_done")).size).toBe(1);
    expect(tones.length).toBeGreaterThanOrEqual(8);
    expect(tones.every((t) => t.shape === "beep" && t.dur <= 0.15)).toBe(true);
    expect(soundContour(SOUNDS.timer_done)).toBe("flat");
  });

  it("overtime is a steady two-tone alarm with no gaps", () => {
    const { tones } = SOUNDS.overtime;
    expect(new Set(freqs("overtime")).size).toBe(2);
    for (let i = 1; i < tones.length; i++) {
      expect(tones[i].freq).not.toBe(tones[i - 1].freq);
      // Each note starts as the last one ends: continuous, unlike the
      // timer's separate beeps.
      expect(tones[i].at).toBeCloseTo(tones[i - 1].at + tones[i - 1].dur, 3);
    }
    expect(soundContour(SOUNDS.overtime)).toBe("alternating");
  });

  it("room ready (the waiting-room TV) is a rising chime played once", () => {
    const f = freqs("room_ready");
    expect(f).toHaveLength(4);
    for (let i = 1; i < f.length; i++) expect(f[i]).toBeGreaterThan(f[i - 1]);
    expect(SOUNDS.room_ready.tones.every((t) => t.shape === "ring")).toBe(true);
    expect(soundContour(SOUNDS.room_ready)).toBe("rising");
  });

  it("no two sounds share a melody shape", () => {
    const contours = SOUND_IDS.map((id) => soundContour(SOUNDS[id]));
    expect(new Set(contours).size).toBe(SOUND_IDS.length);
  });

  it("no two sounds share a tone colour and rhythm", () => {
    // Wave + how notes are sounded + the gap between note starts.
    const signature = (id: (typeof SOUND_IDS)[number]) => {
      const { tones } = SOUNDS[id];
      const step = Math.round((tones[1].at - tones[0].at) * 100);
      return `${tones[0].wave}/${tones[0].shape}/${step}`;
    };
    const signatures = SOUND_IDS.map(signature);
    expect(new Set(signatures).size).toBe(SOUND_IDS.length);
  });

  it("the timer is far higher in pitch than every other sound", () => {
    const timer = Math.min(...freqs("timer_done"));
    for (const id of SOUND_IDS) {
      if (id === "timer_done") continue;
      expect(timer).toBeGreaterThanOrEqual(2 * Math.max(...freqs(id)));
    }
  });

  it("the overtime alarm is the lowest sound on the staff board", () => {
    const highestOvertime = Math.max(...freqs("overtime"));
    expect(highestOvertime).toBeLessThan(Math.min(...freqs("patient_waiting")));
    expect(highestOvertime).toBeLessThan(Math.min(...freqs("timer_done")));
  });

  it("the doorbell and the TV chime share no notes", () => {
    const tv = new Set(freqs("room_ready"));
    expect(freqs("patient_waiting").some((f) => tv.has(f))).toBe(false);
  });

  it("each sound is long enough to notice and short enough to live with", () => {
    for (const id of SOUND_IDS) {
      const d = soundDuration(SOUNDS[id]);
      expect(d).toBeGreaterThan(1.5);
      expect(d).toBeLessThan(6);
    }
  });

  it("the staff board uses three sounds; the TV chime is not one of them", () => {
    expect(STAFF_SOUND_IDS).toEqual([
      "patient_waiting",
      "timer_done",
      "overtime",
    ]);
  });

  it("every sound says in words what it means", () => {
    for (const id of SOUND_IDS) {
      expect(SOUNDS[id].name.length).toBeGreaterThan(3);
      expect(SOUNDS[id].soundsLike.length).toBeGreaterThan(10);
    }
  });
});
