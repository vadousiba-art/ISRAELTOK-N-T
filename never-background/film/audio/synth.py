"""Original score and sound design for YORU — "You were never a background character."

Everything is synthesized here (additive piano, oscillators, filtered noise,
saturation, convolution reverb) and placed on cues.json, the timeline the
picture uses. D minor, 100 BPM (beat 0.6 s).

  0.0–2.75   near silence: room tone, a few distant phone buzzes
  2.75–8.7   a fragile piano; a distant electronic pulse grows and the piano
             starts to distort; interface foley (scroll, typing, deleting, send)
  8.7–9.15   silence
  9.15–9.55  a held breath (reverse swell)
  9.55–15.6  release: impact, cinematic percussion, distorted guitar,
             atmospheric synths, the melodic payoff
  16.0       logo hit
  17.0–25.0  warm and hopeful (F major), quieter under the question, final chord

Output: film/audio/never-background.wav, 48 kHz stereo, 16-bit.
"""

import json
import pathlib
import wave

import numpy as np
from scipy import signal

FILM = pathlib.Path(__file__).resolve().parent.parent
C = json.loads((FILM / "cues.json").read_text())
SR = 48000
DUR = C["duration"]
N = int(round(DUR * SR))
TAIL = 4 * SR
BEAT = 60.0 / C["bpm"]
rng = np.random.default_rng(404)

dry = np.zeros((N + TAIL, 2))
verb = np.zeros((N + TAIL, 2))


# ------------------------------------------------------------------ helpers
def tt(dur):
    return np.arange(int(dur * SR)) / SR


def place(sig, at, gain=1.0, pan=0.0, send=0.0):
    if sig.ndim == 1:
        l = np.cos((pan + 1) * np.pi / 4)
        r = np.sin((pan + 1) * np.pi / 4)
        sig = np.stack([sig * l, sig * r], axis=1) * np.sqrt(2)
    i = int(round(at * SR))
    if i < 0:
        sig = sig[-i:]
        i = 0
    j = min(len(dry), i + len(sig))
    if i >= j:
        return
    seg = sig[: j - i] * gain
    dry[i:j] += seg
    if send:
        verb[i:j] += seg * send


def env(t, a=0.002, d=0.3):
    return np.minimum(1.0, t / max(a, 1e-6)) * np.exp(-t / d)


def adsr(n, a, d, s, r, sr=SR):
    a, d, r = int(a * sr), int(d * sr), int(r * sr)
    sus = max(0, n - a - d - r)
    return np.concatenate([np.linspace(0, 1, max(a, 1)), np.linspace(1, s, max(d, 1)), np.full(sus, s), np.linspace(s, 0, max(r, 1))])[:n]


def sos(kind, f, order=2):
    nyq = SR / 2
    wn = [min(x / nyq, 0.99) for x in f] if isinstance(f, (list, tuple)) else min(f / nyq, 0.99)
    return signal.butter(order, wn, btype=kind, output="sos")


def filt(x, kind, f, order=2):
    return signal.sosfilt(sos(kind, f, order), x, axis=0)


def noise(n):
    return rng.standard_normal(n)


def midi(m):
    return 440.0 * 2 ** ((m - 69) / 12)


NOTE = {"C": 0, "C#": 1, "Db": 1, "D": 2, "Eb": 3, "E": 4, "F": 5, "F#": 6, "G": 7, "Ab": 8, "A": 9, "Bb": 10, "B": 11}


def m(name):
    # "A4" -> midi number
    n, o = name[:-1], int(name[-1])
    return 12 * (o + 1) + NOTE[n]


def saw(f, t):
    # band-limited-ish saw (additive, up to 8 kHz)
    out = np.zeros_like(t)
    k = 1
    while k * f < 8000 and k < 60:
        out += np.sin(2 * np.pi * k * f * t) / k
        k += 1
    return out * (2 / np.pi)


# ------------------------------------------------------------------ instruments
def piano(note, dur=2.5, vel=0.8, bright=1.0):
    f0 = midi(note) if isinstance(note, (int, float)) else midi(m(note))
    t = tt(dur)
    out = np.zeros_like(t)
    B = 0.00035
    for k in range(1, 16):
        fk = k * f0 * np.sqrt(1 + B * k * k)
        if fk > 12000:
            break
        amp = (1 / k**1.15) * (bright if k > 4 else 1)
        dec = 2.6 / (1 + 0.45 * k) * (1.4 if f0 < 200 else 1)
        for det in (-0.6, 0.6):
            out += amp * np.sin(2 * np.pi * (fk + det * k * 0.25) * t + rng.uniform(0, 6)) * np.exp(-t / dec)
    hammer = filt(noise(len(t)), "bandpass", [800, 4000]) * env(t, 0.0005, 0.012) * 0.6
    out = (out / 6 + hammer) * vel
    out *= adsr(len(t), 0.003, 0.1, 1.0, 0.25)
    return out


def kick(t_len=0.5, f0=110, f1=42):
    t = tt(t_len)
    ph = 2 * np.pi * np.cumsum(f1 + (f0 - f1) * np.exp(-t / 0.05)) / SR
    return (np.sin(ph) * env(t, 0.001, 0.22) + filt(noise(len(t)), "highpass", 3000) * env(t, 0.0005, 0.006) * 0.4)


def snare(t_len=0.4):
    t = tt(t_len)
    n = filt(noise(len(t)), "bandpass", [1500, 7000]) * env(t, 0.001, 0.12)
    tone = np.sin(2 * np.pi * 190 * t) * env(t, 0.001, 0.07)
    return n * 0.7 + tone * 0.5


def taiko(t_len=1.4, f=62):
    t = tt(t_len)
    ph = 2 * np.pi * np.cumsum(f * (1 + 0.35 * np.exp(-t / 0.04))) / SR
    body = np.sin(ph) * env(t, 0.002, 0.45)
    skin = filt(noise(len(t)), "bandpass", [100, 900]) * env(t, 0.001, 0.08)
    return np.tanh((body + skin * 0.6) * 1.6)


def hat(t_len=0.08, open_=False):
    t = tt(0.35 if open_ else t_len)
    return filt(noise(len(t)), "highpass", 7000) * env(t, 0.0005, 0.12 if open_ else 0.025)


def guitar_chord(root, dur, mute=False, drive=7.0):
    t = tt(dur)
    f = midi(root)
    x = saw(f, t) + saw(f * 1.4983, t) * 0.8 + saw(f * 2, t) * 0.6 + saw(f * 1.003, t) * 0.5
    x *= adsr(len(t), 0.004, 0.08 if mute else 0.3, 0.5 if mute else 0.85, 0.05 if mute else 0.2)
    if mute:
        x *= np.exp(-t / 0.11)
    y = np.tanh(x * drive)
    y = filt(y, "highpass", 90)
    y = filt(y, "lowpass", 4200, 4)
    return y * 0.55


def pad(notes, dur, bright=1800, gain=1.0):
    t = tt(dur)
    out = np.zeros((len(t), 2))
    for i, n in enumerate(notes):
        f = midi(m(n))
        for d, side in ((-0.09, 0), (0.08, 1), (0.0, None)):
            s = saw(f * (1 + d / 100 * 8), t)
            if side is None:
                out += np.stack([s, s], 1) * 0.5
            else:
                out[:, side] += s
    out = filt(out, "lowpass", bright, 2)
    out *= adsr(len(t), 0.5, 0.4, 0.85, 0.8)[:, None]
    return out / (len(notes) * 2.2) * gain


def lead(note, dur, gain=1.0):
    t = tt(dur)
    f = midi(m(note))
    vib = 1 + 0.004 * np.sin(2 * np.pi * 5.4 * t) * np.minimum(1, t / 0.25)
    ph = 2 * np.pi * np.cumsum(f * vib) / SR
    x = 0.6 * np.sign(np.sin(ph)) * 0.35 + 0.65 * np.sin(ph) + 0.25 * np.sin(2 * ph) + 0.12 * np.sin(3 * ph)
    x = filt(np.tanh(x * 1.6), "lowpass", 3800, 2)
    return x * adsr(len(t), 0.012, 0.12, 0.8, min(0.25, dur * 0.4)) * gain


# ------------------------------------------------------------------ 0 – 2.75: near silence
room = filt(noise(N), "lowpass", 320) * 0.004 + filt(noise(N), "bandpass", [1800, 5000]) * 0.0007
room *= np.minimum(1, np.arange(N) / (0.6 * SR))
place(np.stack([room, filt(noise(N), "lowpass", 320) * 0.004], 1), 0)
for at, pan in ((0.55, -0.6), (1.25, 0.5), (1.85, -0.2), (2.3, 0.7)):
    t = tt(0.35)
    buzz = np.sign(np.sin(2 * np.pi * 165 * t)) * (0.5 + 0.5 * np.sign(np.sin(2 * np.pi * 9 * t)))
    buzz = filt(buzz, "bandpass", [120, 900]) * adsr(len(t), 0.01, 0.05, 1, 0.08)
    place(buzz, at, 0.008, pan, 0.4)
# paper drifting (notifications falling), faint
for i in range(9):
    t = tt(0.5)
    sw = filt(noise(len(t)), "bandpass", [2500, 7000]) * np.sin(np.pi * t / 0.5) ** 2
    place(sw, 0.2 + i * 0.27, 0.006, rng.uniform(-0.8, 0.8), 0.3)

# ------------------------------------------------------------------ 2.75 – 8.7: piano, pulse, foley
P0 = C["piano1"]
motif = [  # (beat offset from P0, note, dur, vel)
    (0, "A4", 3.0, 0.55),
    (1, "F4", 2.6, 0.45),
    (2, "E4", 2.6, 0.42),
    (3, "D4", 3.2, 0.5),
    (4, "A4", 2.5, 0.45),
    (5, "C5", 2.5, 0.42),
    (6, "Bb4", 2.5, 0.42),
    (7, "A4", 3.0, 0.45),
    (8, "F4", 2.4, 0.42),
    (8.5, "E4", 2.4, 0.38),
    (9, "D4", 3.0, 0.42),
]
left = [(0, "D3"), (4, "Bb2"), (7, "F2"), (9, "A2")]
for b, n, d, v in motif:
    place(piano(n, d, v), P0 + b * BEAT, 0.5, 0.1, 0.55)
for b, n in left:
    place(piano(n, 4.0, 0.5, 0.6), P0 + b * BEAT, 0.42, -0.15, 0.5)

# distorted piano echo (grows from 5.4 s): the same notes, crushed and saturated
for b, n, d, v in motif[4:]:
    at = P0 + b * BEAT
    k = np.clip((at - 5.0) / 3.5, 0, 1)
    p = piano(n, d * 0.8, v)
    crushed = np.round(p * 24) / 24
    dist = np.tanh(crushed * 4) * 0.4
    place(filt(dist, "bandpass", [300, 3200]), at + 0.02, 0.22 * k, -0.3, 0.6)

# electronic pulse: muffled sub pulse on eighths, rising
t0, t1 = 3.3, 8.72
n8 = int((t1 - t0) / (BEAT / 2))
for i in range(n8):
    at = t0 + i * BEAT / 2
    k = (at - t0) / (t1 - t0)
    t = tt(0.28)
    p = np.sin(2 * np.pi * 55 * t) * env(t, 0.004, 0.12) + 0.3 * np.sin(2 * np.pi * 110 * t) * env(t, 0.002, 0.05)
    p = filt(p, "lowpass", 300 + 900 * k)
    place(p, at, (0.05 + 0.2 * k) * (1.0 if i % 2 == 0 else 0.6), 0, 0.15)
# a tense high drone creeping in
t = tt(t1 - 4.6)
dr = (np.sin(2 * np.pi * midi(m("A5")) * t) + 0.6 * np.sin(2 * np.pi * midi(m("Bb5")) * t)) * np.linspace(0, 1, len(t)) ** 2
place(filt(dr, "lowpass", 2500) * 0.016, 4.6, 1, 0.2, 0.8)

# foley — scrolling
for i in range(7):
    at = C["scroll"][0] + 0.05 + i * 0.38
    if C["favCard"] < at < C["trendWave"][0]:
        continue
    t = tt(0.18)
    s = filt(noise(len(t)), "bandpass", [1200, 5000]) * np.sin(np.pi * t / 0.18) ** 2
    place(s, at, 0.03, 0.2, 0.2)
# the trend wave: a rushing, same-y whoosh
t = tt(C["trendWave"][1] - C["trendWave"][0] + 0.2)
wv = filt(noise(len(t)), "bandpass", [600, 2400]) * np.linspace(0, 1, len(t)) ** 1.5 * adsr(len(t), 0.01, 0.1, 1, 0.12)
place(wv, C["trendWave"][0], 0.07, 0, 0.3)
# panels slamming in (things they love): soft paper slaps with a small bell
for at in C["interests"]:
    t = tt(0.3)
    slap = filt(noise(len(t)), "bandpass", [400, 3000]) * env(t, 0.001, 0.04)
    place(slap, at, 0.12, rng.uniform(-0.4, 0.4), 0.4)
    place(piano("A5", 1.2, 0.35, 1.2), at, 0.12, 0.3, 0.7)
# typing and deleting
MSG = "have you ever heard of"
a, b = C["typeText"]
for i in range(len(MSG)):
    at = a + (b - a) * i / len(MSG)
    t = tt(0.05)
    click = filt(noise(len(t)), "bandpass", [2000, 6500]) * env(t, 0.0005, 0.008)
    place(click, at + rng.uniform(-0.01, 0.01), 0.07, 0.3, 0.1)
d0, d1 = C["deleteText"]
for i in range(9):
    at = d0 + (d1 - d0) * i / 9
    t = tt(0.05)
    click = filt(noise(len(t)), "bandpass", [900, 2600]) * env(t, 0.0005, 0.01)
    place(click, at, 0.08, 0.3, 0.1)
# the group laughing, muffled and far away as they move on
for i, at in enumerate([6.95, 7.1, 7.22, 7.36]):
    t = tt(0.18)
    f = 280 + i * 40
    hah = np.sin(2 * np.pi * f * t * (1 - 0.15 * t)) * filt(noise(len(t)), "lowpass", 1200) * 0.6 * env(t, 0.01, 0.08)
    place(filt(hah, "lowpass", 900), at, 0.05, 0.5 - i * 0.2, 0.7)
# send tap and the message sinking
t = tt(0.06)
place(filt(noise(len(t)), "bandpass", [1500, 5000]) * env(t, 0.0005, 0.01), C["sendTap"], 0.1, 0.2)
t = tt(0.5)
place(np.sin(2 * np.pi * (900 - 600 * t) * t) * env(t, 0.005, 0.18) * 0.3, C["sendTap"] + 0.02, 0.06, 0, 0.5)
t = tt(C["sink"][1] - C["sink"][0])
sink = filt(noise(len(t)), "lowpass", 600) * np.linspace(0, 1, len(t))
place(sink, C["sink"][0], 0.08, 0, 0.4)

# ------------------------------------------------------------------ 8.72 – 9.55: silence, then a held breath
hush0, hush1 = C["hush"]
# (silence: nothing placed from hush0 to 9.15 except the piano tail, ducked in the mix below)
t = tt(C["impact"] - 9.15)
k = np.linspace(0, 1, len(t))
swell = filt(noise(len(t)), "bandpass", [500, 6000]) * k**3
swell += np.sin(2 * np.pi * (60 + 140 * k**2) * t) * k**2 * 0.5
place(np.stack([swell, filt(noise(len(t)), "bandpass", [500, 6000]) * k**3], 1), 9.15, 0.11, 0, 0.8)

# ------------------------------------------------------------------ 9.55: the impact and the release
I0 = C["impact"]
t = tt(3.0)
boom = np.sin(2 * np.pi * np.cumsum(30 + 40 * np.exp(-t / 0.15)) / SR) * env(t, 0.001, 0.9)
crack = filt(noise(len(t)), "highpass", 1500) * env(t, 0.0005, 0.09)
place(np.tanh(boom * 1.4) * 0.7 + crack * 0.5, I0, 0.95, 0, 0.5)
t = tt(0.6)
slash = filt(noise(len(t)), "bandpass", [2000, 9000]) * env(t, 0.002, 0.12)
place(np.stack([slash * 0.5, slash], 1), I0 + 0.04, 0.35, 0, 0.6)
# shards
for i in range(14):
    t = tt(0.25)
    f = rng.uniform(3000, 9000)
    sh = np.sin(2 * np.pi * f * t) * env(t, 0.0005, 0.05) + filt(noise(len(t)), "highpass", 5000) * env(t, 0.0005, 0.02)
    place(sh, I0 + 0.08 + rng.uniform(0, 0.6), 0.05, rng.uniform(-0.9, 0.9), 0.6)

# groove: 100 BPM from the impact to the logo
R0, R1 = I0, C["logo"][0]
nbeats = int((R1 - R0) / BEAT)
for b in range(nbeats):
    at = R0 + b * BEAT
    place(kick(), at, 0.55 if b % 2 == 0 else 0.4, 0)
    if b % 2 == 1:
        place(snare(), at, 0.32, 0.05, 0.3)
    for s16 in range(4):
        place(hat(), at + s16 * BEAT / 4, 0.05 if s16 % 2 else 0.08, 0.35)
    if b % 4 == 0:
        place(taiko(), at, 0.38, -0.25, 0.4)
    if b % 4 == 3:
        place(taiko(f=82), at + BEAT / 2, 0.26, 0.3, 0.4)
# guitar: i–VI–III–VII (D5 Bb5 F5 C5), chugging eighths with a held hit each bar
prog = ["D3", "Bb2", "F2", "C3"]
for bar in range(int(np.ceil(nbeats / 2))):
    root = m(prog[bar % 4])
    at = R0 + bar * 2 * BEAT
    if at >= R1:
        break
    place(guitar_chord(root, BEAT * 0.95), at, 0.24, -0.45, 0.15)
    place(guitar_chord(root, BEAT * 0.95), at + 0.012, 0.24, 0.45, 0.15)
    for e in range(1, 4):
        place(guitar_chord(root, BEAT / 2, mute=True), at + BEAT * 0.5 * e + BEAT * 0.5, 0.16, -0.5 if e % 2 else 0.5, 0.1)
# atmospheric pad
chords = [["D3", "A3", "F4"], ["Bb2", "F3", "D4"], ["F3", "C4", "A4"], ["C3", "G3", "E4"]]
for bar in range(int(np.ceil(nbeats / 2))):
    at = R0 + bar * 2 * BEAT
    if at >= R1:
        break
    place(pad(chords[bar % 4], 2 * BEAT + 0.6, 2200), at, 0.32, 0, 0.6)
# the melodic payoff
mel = [
    (0, "D5", 1), (1, "F5", 0.5), (1.5, "E5", 0.5), (2, "D5", 1), (3, "A4", 1),
    (4, "Bb4", 1), (5, "D5", 0.5), (5.5, "C5", 0.5), (6, "A4", 2),
    (8, "F5", 1), (9, "G5", 0.5), (9.5, "A5", 0.5), (10, "G5", 1), (11, "F5", 1),
    (12, "E5", 1.5), (13.5, "D5", 0.5), (14, "C5", 1), (15, "E5", 1),
]
M0 = C["individuals"][0] - 0.1
for b, n, d in mel:
    at = M0 + b * BEAT
    if at > R1 - 0.1:
        break
    x = lead(n, d * BEAT * 0.98)
    place(x, at, 0.2, 0.15, 0.45)
    place(x, at + 0.28, 0.06, -0.4, 0.6)  # echo
# a piano doubling the payoff an octave down, for warmth
for b, n, d in mel[:10]:
    place(piano(m(n) - 12, 1.8, 0.4), M0 + b * BEAT, 0.16, -0.1, 0.4)

# ------------------------------------------------------------------ 15.6 – 17.0: logo
L0 = C["logoLines"][0]
t = tt(C["logoIn"] - L0)
k = np.linspace(0, 1, len(t))
rise = filt(noise(len(t)), "bandpass", [800, 8000]) * k**2
place(rise, L0, 0.08, 0, 0.6)
t = tt(3.0)
hit = np.tanh(np.sin(2 * np.pi * np.cumsum(38 + 50 * np.exp(-t / 0.12)) / SR) * env(t, 0.001, 0.8) * 1.5)
shimmer = sum(np.sin(2 * np.pi * midi(m(n)) * t) for n in ("D6", "A6", "F6")) * env(t, 0.01, 1.4) * 0.15
place(hit * 0.7 + shimmer, C["logoIn"], 0.7, 0, 0.6)
place(pad(["D3", "A3", "D4", "F4"], 1.6, 1500), C["logoIn"], 0.25, 0, 0.8)

# ------------------------------------------------------------------ 17.0 – 25.0: warm, hopeful (F major), then the question
F0 = C["final"][0]
warm = [(["F3", "C4", "A4"], 0.0, 1.3), (["C3", "G3", "E4"], 1.2, 1.1), (["Bb2", "F3", "D4"], 2.2, 1.0)]
for ch, off, d in warm:
    place(pad(ch, d + 0.8, 1300), F0 + off, 0.26, 0, 0.7)
arp = ["F4", "A4", "C5", "A4", "E4", "G4", "D4"]
for i, n in enumerate(arp):
    place(piano(n, 2.0, 0.3), F0 + i * 0.42, 0.22, 0.2 if i % 2 else -0.2, 0.55)
# the payoff phrase again, in major, on piano
hope = [(0, "C5"), (1, "F5"), (1.5, "E5"), (2, "C5"), (3, "A4"), (4, "Bb4"), (5, "D5"), (5.5, "C5"), (6, "A4")]
H0 = F0 + 0.15
for b, n in hope:
    place(piano(n, 2.2, 0.45), H0 + b * 0.47, 0.3, 0.1, 0.6)
# question: let it breathe (a held F chord, very soft, one high note)
Q0 = C["question"][0]
place(pad(["F3", "C4", "A4"], C["question"][1] - Q0 + 0.6, 800, 0.8), Q0, 0.08, 0, 0.8)
place(piano("A5", 3.0, 0.22), C["questionIn"] + 0.35, 0.1, 0.2, 0.8)
# end card: final chord with an added 9th, a soft chime on the tagline
E0 = C["end"][0]
for n in ("F2", "C3", "F3", "A3", "G4", "C5"):
    place(piano(n, 4.0, 0.42, 0.9), E0 + 0.05, 0.17, 0, 0.7)
place(pad(["F3", "A3", "C4", "G4"], DUR - E0, 1100, 0.9), E0, 0.14, 0, 0.8)
t = tt(2.5)
chime = sum(np.sin(2 * np.pi * midi(m(n)) * t) * (0.6 if n == "C6" else 0.4) for n in ("F5", "C6")) * env(t, 0.003, 0.9)
place(chime, C["tagline"], 0.08, 0.1, 0.8)


# ------------------------------------------------------------------ mix
def reverb_ir(seconds=2.8, predelay=0.02):
    n = int(seconds * SR)
    t = np.arange(n) / SR
    ir = np.zeros((n, 2))
    for ch in range(2):
        x = rng.standard_normal(n) * np.exp(-t / (seconds / 6.5))
        x = filt(x, "lowpass", 6500)
        ir[:, ch] = x
    pd = int(predelay * SR)
    ir = np.vstack([np.zeros((pd, 2)), ir])
    return ir / np.sqrt((ir**2).sum(axis=0))


ir = reverb_ir()
wet = np.stack([signal.fftconvolve(verb[:, c], ir[:, c])[: len(verb)] for c in range(2)], 1)
mix = dry + wet * 0.5

# True silence before the release: fade out 8.72 – 8.86 s, nothing until
# 9.18 s, then only the held breath rising into the impact.
g = np.ones(len(mix))
a, a2, b, c2 = int(hush0 * SR), int((hush0 + 0.14) * SR), int(9.18 * SR), int(C["impact"] * SR)
g[a:a2] = np.linspace(1, 0.0, a2 - a) ** 2
g[a2:b] = 0.0
g[b:c2] = np.linspace(0.0, 1, c2 - b)
mix *= g[:, None]

mix = mix[:N]
# gentle master: high-pass, soft clip, normalise to about -1 dBFS peak
mix = filt(mix, "highpass", 28)
mix = np.tanh(mix * 1.15) / np.tanh(1.15)
peak = np.max(np.abs(mix))
mix = mix / peak * 0.89
# fade the very end
fade = int(0.6 * SR)
mix[-fade:] *= np.linspace(1, 0, fade)[:, None] ** 1.5

out = FILM / "audio" / "never-background.wav"
with wave.open(str(out), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((mix * 32767).astype("<i2").tobytes())
rms = np.sqrt(np.mean(mix**2))
print(f"wrote {out}  {DUR:.1f}s  peak {20*np.log10(np.max(np.abs(mix))):.1f} dBFS  rms {20*np.log10(rms):.1f} dBFS")
