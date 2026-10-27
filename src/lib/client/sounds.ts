"use client";

// Every sound is synthesized with WebAudio, so there are no audio assets to
// ship or license. playSound() respects the user's "sound effects" setting;
// the soundboard calls playSynth() directly because pressing it is the intent.

let ctx: AudioContext | null = null;
function audio() {
  if (typeof window === "undefined") return null;
  ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function tone(freq: number, dur: number, type: OscillatorType = "sine", gain = 0.2, delay = 0, slideTo?: number) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + delay;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

function noise(dur: number, gain = 0.2, delay = 0, filterFreq = 1200) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + delay;
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = filterFreq;
  const g = a.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(a.destination);
  src.start(t);
}

export const SOUNDS = {
  airhorn: { label: "Air Horn", emoji: "📯", play: () => [0, 0.22, 0.44].forEach((d) => { tone(466, 0.2, "sawtooth", 0.18, d); tone(470, 0.2, "square", 0.08, d); }) },
  boom: { label: "Vine Boom", emoji: "💥", play: () => { tone(110, 0.9, "sine", 0.5, 0, 38); noise(0.35, 0.3, 0, 300); } },
  bruh: { label: "Bruh", emoji: "😐", play: () => { tone(160, 0.45, "sawtooth", 0.18, 0, 110); tone(80, 0.45, "sine", 0.2, 0, 60); } },
  trombone: { label: "Sad Trombone", emoji: "🎺", play: () => [392, 370, 349, 330].forEach((f, i) => tone(f, i === 3 ? 0.9 : 0.35, "sawtooth", 0.13, i * 0.38, i === 3 ? 300 : undefined)) },
  crickets: { label: "Crickets", emoji: "🦗", play: () => { for (let i = 0; i < 8; i++) tone(4200, 0.05, "square", 0.04, i * 0.13 + (i % 2) * 0.04); } },
  drumroll: { label: "Drum Roll", emoji: "🥁", play: () => { for (let i = 0; i < 24; i++) noise(0.06, 0.12 + i * 0.006, i * 0.055, 900); noise(0.5, 0.4, 1.35, 3000); tone(90, 0.4, "sine", 0.4, 1.35); } },
  alarm: { label: "Nuclear Alarm", emoji: "🚨", play: () => [0, 0.5, 1].forEach((d) => tone(700, 0.45, "square", 0.08, d, 1100)) },
  victory: { label: "W Fanfare", emoji: "🏆", play: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, i === 3 ? 0.6 : 0.16, "triangle", 0.18, i * 0.14)) },
  pop: { label: "Pop", emoji: "🫧", play: () => tone(600, 0.08, "sine", 0.15, 0, 1200) },
  boop: { label: "Boop", emoji: "👉", play: () => tone(320, 0.1, "triangle", 0.15, 0, 480) },
} as const;

export type SoundName = keyof typeof SOUNDS;

export function playSynth(name: SoundName) {
  try {
    SOUNDS[name].play();
  } catch {
    /* audio unavailable */
  }
}

export function playSound(name: SoundName) {
  try {
    if (localStorage.getItem("itn-sound") !== "on") return;
  } catch {
    return;
  }
  playSynth(name);
}
