"use client";

// Landing page sound design, synthesized with WebAudio (no audio files).
// Browsers only allow audio after a user gesture, so nothing plays until the
// visitor first taps or clicks. Visitors can mute it; the choice is remembered.

const KEY = "yoru-landing-sound";
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = true;
let unlocked = false;

try {
  enabled = typeof window === "undefined" ? true : localStorage.getItem(KEY) !== "off";
} catch {
  /* storage unavailable */
}

function audio() {
  if (typeof window === "undefined" || !enabled || !unlocked) return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function tone(freq: number, dur: number, type: OscillatorType = "sine", gain = 0.12, delay = 0, slideTo?: number) {
  const a = audio();
  if (!a || !master) return;
  const t = a.currentTime + delay;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

function air(dur: number, gain = 0.08, from = 400, to = 3200, delay = 0) {
  const a = audio();
  if (!a || !master) return;
  const t = a.currentTime + delay;
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = "bandpass";
  f.Q.value = 1.4;
  f.frequency.setValueAtTime(from, t);
  f.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.35);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t);
}

// A minor-pentatonic palette keeps everything sounding like one instrument.
const SCALE = [440, 523.25, 587.33, 659.25, 783.99, 880, 1046.5];

export const sfx = {
  /** Soft tick for hovers and slider moves. */
  tick: (step = 0) => tone(SCALE[Math.abs(step) % SCALE.length] * 2, 0.05, "sine", 0.035),
  /** Bright two-note chime for buttons. */
  click: () => {
    tone(783.99, 0.14, "triangle", 0.09);
    tone(1174.66, 0.22, "sine", 0.06, 0.06);
  },
  /** Bubble pop for likes and chat messages. */
  pop: () => tone(520, 0.09, "sine", 0.1, 0, 1100),
  /** Breathy sweep for reveals and section changes. */
  whoosh: () => air(0.45, 0.07),
  /** Deep temple-bell hit for the hero entrance. */
  gong: () => {
    tone(110, 2.4, "sine", 0.16);
    tone(220.5, 1.8, "sine", 0.06);
    tone(331, 1.2, "triangle", 0.03);
    air(1.2, 0.03, 200, 900);
  },
  /** Rising arpeggio for level ups and downloads. */
  levelUp: () => [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => tone(f, i === 4 ? 0.6 : 0.16, "triangle", 0.08, i * 0.08)),
  /** Little sparkle. */
  sparkle: () => [1568, 2093, 2637].forEach((f, i) => tone(f, 0.12, "sine", 0.03, i * 0.05)),
};

export function soundEnabled() {
  return enabled;
}

export function setSoundEnabled(on: boolean) {
  enabled = on;
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    /* storage unavailable */
  }
}

/** Call from the first user gesture; returns true the first time. */
export function unlockAudio() {
  if (unlocked) return false;
  unlocked = true;
  audio();
  return true;
}
