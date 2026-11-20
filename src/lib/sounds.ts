// The clinic's alert sounds, generated with the Web Audio API (no audio
// files). Each one is described as data — which notes, when, how they are
// sounded — so that what makes them different from one another is written
// down and tested (sounds.test.ts), not left to the ear of whoever last
// edited a frequency.
//
// Staff hear these across a room while doing something else, so each
// sound differs from the others in every way at once — melody, tone
// colour, rhythm and pitch range — and each is modelled on something
// people already know the meaning of:
//
//   patient_waiting  a doorbell   "someone has arrived"       ding-dong ×3
//   timer_done       a timer      "time is up — needles out"  beep-beep-beep-beep ×3
//   overtime         an alarm     "this has gone on too long" low two-tone, steady
//   room_ready       a PA chime   "your room is ready"        four soft rising notes
//                    (waiting-room TV — for patients, so it is the gentle one)

export type SoundId =
  | "patient_waiting"
  | "timer_done"
  | "overtime"
  | "room_ready";

export const SOUND_IDS: readonly SoundId[] = [
  "patient_waiting",
  "timer_done",
  "overtime",
  "room_ready",
];

// The sounds the staff rooms board makes. room_ready belongs to the
// waiting-room TV.
export const STAFF_SOUND_IDS: readonly SoundId[] = [
  "patient_waiting",
  "timer_done",
  "overtime",
];

export interface Tone {
  // Seconds after the sound starts.
  at: number;
  // Fundamental, Hz.
  freq: number;
  // Seconds until this note is silent again.
  dur: number;
  // ring: struck once and left to fade, like a bell or a chime bar.
  // beep: switched on and off at full level, like an electronic buzzer.
  shape: "ring" | "beep";
  wave: OscillatorType;
  // Peak level, 0–1.
  gain: number;
  // Overtones as [multiple of freq, level relative to the fundamental].
  // Several inharmonic ones are what make a "ring" sound like a bell.
  partials?: [number, number][];
}

export interface Sound {
  id: SoundId;
  // What it means, as staff would say it.
  name: string;
  // What it sounds like, for the "Sounds" panel on the board.
  soundsLike: string;
  tones: Tone[];
}

const BELL: [number, number][] = [
  [1, 1],
  [2, 0.45],
  [3, 0.2],
  [4.2, 0.1],
];

// Doorbell: ding (A5) – dong (F5), three times.
const doorbell: Tone[] = [0, 1.45, 2.9].flatMap((ring) => [
  {
    at: ring,
    freq: 880,
    dur: 1.4,
    shape: "ring",
    wave: "sine",
    gain: 0.5,
    partials: BELL,
  },
  {
    at: ring + 0.42,
    freq: 698.46,
    dur: 1.4,
    shape: "ring",
    wave: "sine",
    gain: 0.5,
    partials: BELL,
  },
]);

// Kitchen timer: four short beeps on one very high note (C7), three times.
const timerBeeps: Tone[] = [0, 0.95, 1.9].flatMap((burst) =>
  [0, 0.18, 0.36, 0.54].map((beep) => ({
    at: burst + beep,
    freq: 2093,
    dur: 0.09,
    shape: "beep" as const,
    wave: "square" as const,
    gain: 0.23,
  }))
);

// Alarm: D5 / A4 back and forth with no gaps — lower, buzzier and more
// insistent than the timer it follows.
const twoToneAlarm: Tone[] = Array.from({ length: 10 }, (_, i) => ({
  at: i * 0.25,
  freq: i % 2 === 0 ? 587.33 : 440,
  dur: 0.25,
  shape: "beep" as const,
  wave: "sawtooth" as const,
  gain: 0.26,
}));

// PA chime: G4 – C5 – E5 – G5, soft and unhurried, once.
const risingChime: Tone[] = [392, 523.25, 659.25, 783.99].map((freq, i) => ({
  at: i * 0.34,
  freq,
  dur: 2.2,
  shape: "ring" as const,
  wave: "triangle" as const,
  gain: 0.45,
}));

export const SOUNDS: Record<SoundId, Sound> = {
  patient_waiting: {
    id: "patient_waiting",
    name: "Patient waiting for the doctor",
    soundsLike: "A doorbell: ding-dong, three times",
    tones: doorbell,
  },
  timer_done: {
    id: "timer_done",
    name: "Timer done — remove needles",
    soundsLike: "A kitchen timer: quick high beeps, in threes",
    tones: timerBeeps,
  },
  overtime: {
    id: "overtime",
    name: "Overtime — needles still in",
    soundsLike: "A low two-tone alarm, steady and buzzing",
    tones: twoToneAlarm,
  },
  room_ready: {
    id: "room_ready",
    name: "Your room is ready",
    soundsLike: "A soft chime: four rising notes",
    tones: risingChime,
  },
};

export function soundDuration(sound: Sound): number {
  return Math.max(...sound.tones.map((t) => t.at + t.dur));
}

export type SoundContour =
  | "rising"
  | "flat"
  | "alternating"
  | "falling-pairs"
  | "other";

// The shape of the melody, which is what the ear picks out first.
export function soundContour(sound: Sound): SoundContour {
  const f = sound.tones.map((t) => t.freq);
  const distinct = new Set(f).size;
  if (distinct === 1) return "flat";
  if (f.every((x, i) => i === 0 || x > f[i - 1])) return "rising";
  const flips = f.every((x, i) => i === 0 || x !== f[i - 1]);
  const evenGaps = sound.tones.every(
    (t, i, all) =>
      i === 0 || Math.abs(t.at - (all[i - 1].at + all[i - 1].dur)) < 0.001
  );
  if (distinct === 2 && flips && evenGaps) return "alternating";
  const pairsFall =
    f.length % 2 === 0 && f.every((x, i) => i % 2 === 0 || x < f[i - 1]);
  if (pairsFall) return "falling-pairs";
  return "other";
}

// One output chain per audio context: everything goes through a
// compressor, so the sounds can be loud without distorting when two of
// them overlap (a doorbell arriving during a timer alarm).
const outputs = new WeakMap<BaseAudioContext, AudioNode>();

function output(ctx: BaseAudioContext): AudioNode {
  let node = outputs.get(ctx);
  if (!node) {
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.ratio.value = 6;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.2;
    compressor.connect(ctx.destination);
    node = compressor;
    outputs.set(ctx, node);
  }
  return node;
}

// Schedules a sound on the context's clock, `delay` seconds from now.
// Returns how long it lasts, so callers can queue the next one after it.
export function playSound(
  ctx: BaseAudioContext,
  id: SoundId,
  delay = 0
): number {
  const sound = SOUNDS[id];
  const out = output(ctx);
  const t0 = ctx.currentTime + delay + 0.02;

  for (const tone of sound.tones) {
    const start = t0 + tone.at;
    (tone.partials ?? [[1, 1]]).forEach(([multiple, level], index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = tone.wave;
      osc.frequency.value = tone.freq * multiple;
      const peak = tone.gain * level;

      if (tone.shape === "ring") {
        // Struck: near-instant attack, then a long fade. Higher overtones
        // die away sooner, as they do in a real bell.
        const end = start + tone.dur / (1 + index * 0.6);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.linearRampToValueAtTime(peak, start + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0001, end);
      } else {
        // Switched: full level for the whole note, with just enough ramp
        // at each end to avoid clicks.
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(peak, start + 0.005);
        gain.gain.setValueAtTime(peak, start + tone.dur - 0.008);
        gain.gain.linearRampToValueAtTime(0, start + tone.dur);
      }

      osc.connect(gain);
      if (tone.wave === "sine" || tone.wave === "triangle") {
        gain.connect(out);
      } else {
        // Take the harshest edge off square and sawtooth waves; they stay
        // clearly "electronic" but are not painful at volume.
        const soften = ctx.createBiquadFilter();
        soften.type = "lowpass";
        soften.frequency.value = Math.max(3000, tone.freq * 2.5);
        gain.connect(soften);
        soften.connect(out);
      }
      osc.start(start);
      osc.stop(start + tone.dur + 0.05);
    });
  }

  return delay + soundDuration(sound);
}
