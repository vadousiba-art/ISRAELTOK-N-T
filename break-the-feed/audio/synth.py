"""Original score and sound design for YORU — BREAK THE FEED.

Everything is synthesized here (oscillators, filtered noise, distortion,
convolution reverb) and placed on cues.json, the same timeline the picture
uses. Japanese electronic-rock at 150 BPM in E Phrygian: distorted power
chords, industrial drums and taiko, with paper, ink, glass and metal foley.

The film ends and opens on silence, so the loop seam is clean, and the
scripted silences are true digital silence.

Output: audio/break-the-feed.wav, 48 kHz stereo, 16-bit.
"""

import json
import pathlib
import wave

import numpy as np
from scipy import signal

ROOT = pathlib.Path(__file__).resolve().parent.parent
C = json.loads((ROOT / "cues.json").read_text())
SR = 48000
DUR = C["duration"]
N = int(round(DUR * SR))
TAIL = 5 * SR
BEAT = 60.0 / C["bpm"]
FPS = C["fps"]
rng = np.random.default_rng(150)

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
    j = min(len(dry), i + len(sig))
    if i >= j or i < 0:
        return
    seg = sig[: j - i] * gain
    dry[i:j] += seg
    if send:
        verb[i:j] += seg * send


def env(t, a=0.002, d=0.3):
    return np.minimum(1.0, t / max(a, 1e-6)) * np.exp(-t / d)


def sos(kind, f, order=2):
    nyq = SR / 2
    wn = [min(x / nyq, 0.99) for x in f] if isinstance(f, (list, tuple)) else min(f / nyq, 0.99)
    return signal.butter(order, wn, btype=kind, output="sos")


def filt(x, kind, f, order=2):
    return signal.sosfilt(sos(kind, f, order), x, axis=0)


def sweep(x, f0, f1, kind="bandpass", q=0.3, block=256, curve=1.0):
    out = np.zeros_like(x)
    nb = int(np.ceil(len(x) / block))
    zi = None
    for b in range(nb):
        k = (b / max(1, nb - 1)) ** curve
        f = f0 * (f1 / f0) ** k
        s = sos("bandpass", [f * (1 - q), f * (1 + q)]) if kind == "bandpass" else sos(kind, f)
        if zi is None:
            zi = np.zeros((s.shape[0], 2))
        seg = x[b * block : (b + 1) * block]
        out[b * block : b * block + len(seg)], zi = signal.sosfilt(s, seg, zi=zi)
    return out


def noise(dur):
    return rng.standard_normal(int(dur * SR))


def saw(freq, t):
    ph = np.cumsum(np.broadcast_to(freq, t.shape) / SR)
    return 2.0 * (ph % 1.0) - 1.0


def note(name):
    names = {"C": 0, "C#": 1, "D": 2, "D#": 3, "E": 4, "F": 5, "F#": 6, "G": 7, "G#": 8, "A": 9, "A#": 10, "B": 11}
    n, o = name[:-1], int(name[-1])
    return 440.0 * 2 ** ((names[n] + 12 * (o + 1) - 69) / 12)


# ------------------------------------------------------------------ instruments
def kick(dur=0.45, f0=170, f1=45, drive=2.6, punch=1.0):
    t = tt(dur)
    f = f1 + (f0 - f1) * np.exp(-t * 34)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(t, 0.001, dur * 0.4)
    click = filt(noise(dur), "highpass", 3000) * env(t, 0.0002, 0.003) * 0.7 * punch
    return np.tanh((body + click) * drive) / np.tanh(drive)


def snare(dur=0.32, tone=200, decay=0.13, crack=1.0):
    t = tt(dur)
    n = filt(noise(dur), "bandpass", [1500, 10000]) * env(t, 0.0004, decay)
    b = np.sin(2 * np.pi * tone * t) * env(t, 0.0005, 0.045)
    c = filt(noise(dur), "highpass", 5000) * env(t, 0.0002, 0.006) * crack
    return np.tanh((n * 0.9 + b * 0.9 + c * 0.8) * 1.8) * 0.6


def hat(dur=0.06, decay=0.016, open_=False):
    t = tt(dur if not open_ else 0.3)
    return filt(noise(len(t) / SR), "highpass", 8000) * env(t, 0.0002, decay if not open_ else 0.12) * 0.32


def taiko(dur=1.2, f0=110, f1=62):
    t = tt(dur)
    f = f1 + (f0 - f1) * np.exp(-t * 9)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(t, 0.002, 0.42)
    skin = filt(noise(dur), "bandpass", [200, 1600]) * env(t, 0.0005, 0.03) * 0.6
    return np.tanh((body + skin) * 2.0) * 0.7


def sub(dur=2.5, f0=62, f1=27, decay=0.4):
    t = tt(dur)
    f = f1 + (f0 - f1) * np.exp(-t * 2.4)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR)
    # Harmonics so the drop survives phone speakers.
    s = np.tanh(s * 1.8) * 0.8 + 0.2 * np.sin(2 * np.pi * np.cumsum(f * 2) / SR)
    return s * env(t, 0.004, dur * decay)


def crash(dur=2.5, hp=3200, decay=0.8):
    t = tt(dur)
    n = filt(noise(dur), "highpass", hp)
    shimmer = sum(np.sin(2 * np.pi * f * t + rng.uniform(0, 6)) for f in rng.uniform(4000, 9000, 14)) * 0.04
    return (n * 0.4 + shimmer) * env(t, 0.001, decay)


def metal(base=230, dur=1.2, decay=0.4):
    t = tt(dur)
    out = np.zeros_like(t)
    for k, r in enumerate([1.0, 1.593, 2.135, 2.65, 3.17, 4.08, 5.42, 6.8]):
        out += np.sin(2 * np.pi * base * r * t + rng.uniform(0, 6.28)) * np.exp(-t / (decay / (1 + k * 0.3))) / (1 + k * 0.5)
    return np.tanh(out * 1.5) * 0.45 * np.minimum(1, t / 0.0006)


def shing(dur=2.0):
    """A blade: very bright inharmonic ring with a fast sweep on top."""
    t = tt(dur)
    ring = sum(np.sin(2 * np.pi * f * t) * np.exp(-t / d) for f, d in [(3150, 0.9), (4710, 0.7), (6280, 0.5), (8090, 0.35), (2210, 1.1)])
    swp = sweep(noise(0.18), 2000, 12000, q=0.25) * np.sin(np.pi * tt(0.18) / 0.18)
    ring[: len(swp)] += swp * 1.6
    return ring * 0.18 * np.minimum(1, t / 0.0005)


def guitar(freqs, dur, palm=False, drive=14.0, gain=1.0):
    """Distorted power chord: detuned saws -> drive -> cabinet."""
    t = tt(dur)
    s = sum(saw(f, t) + saw(f * 1.004, t) * 0.8 + saw(f * 0.997, t) * 0.6 for f in freqs)
    s = filt(s, "highpass", 90)
    s = np.tanh(s * drive / len(freqs))
    s = filt(s, "lowpass", 1400 if palm else 4800, 4) + filt(s, "bandpass", [1200, 2400]) * 0.35
    a = np.minimum(1, t / 0.003)
    e = np.exp(-t / (0.09 if palm else 1.4)) if palm else np.maximum(np.exp(-t / 1.6), 0.25)
    rel = np.minimum(1, (dur - t) / 0.02)
    return s * a * e * rel * 0.35 * gain


def power(root, dur, palm=False, gain=1.0):
    r = note(root)
    return guitar([r, r * 1.4983, r * 2], dur, palm, gain=gain)


def bassg(freq, dur):
    t = tt(dur)
    s = saw(freq, t) * 0.6 + np.sin(2 * np.pi * freq * t)
    s = np.tanh(filt(s, "lowpass", 900) * 2.5)
    return s * np.minimum(1, t / 0.003) * np.minimum(1, (dur - t) / 0.01) * 0.45


def paper_tear(dur=0.4):
    t = tt(dur)
    n = noise(dur)
    grains = np.zeros_like(t)
    k = 0
    while k < len(t):
        grains[k] = rng.uniform(0.5, 1.0)
        k += int(rng.uniform(0.0015, 0.008) * SR)
    crackle = signal.lfilter([1], [1, -0.6], grains)
    body = filt(n, "bandpass", [1200, 7000]) * (0.4 + 0.6 * np.abs(signal.lfilter([1], [1, -0.995], rng.standard_normal(len(t))) / 30))
    s = filt(crackle, "bandpass", [900, 6000]) * 1.6 + body * 0.5
    return s * np.minimum(1, t / 0.01) * np.minimum(1, (dur - t) / 0.05) * 0.5


def ink_splat(dur=0.5):
    t = tt(dur)
    n = sweep(noise(dur), 2500, 180, kind="lowpass", curve=0.5)
    bub = np.sin(2 * np.pi * (300 + 900 * np.exp(-t * 18)) * t) * env(t, 0.001, 0.05) * 0.4
    return (n * 0.9 + bub) * env(t, 0.002, 0.14) * 0.9


def swish(dur=0.3, f0=500, f1=6000, curve=1.0):
    t = tt(dur)
    return sweep(noise(dur), f0, f1, q=0.35, curve=curve) * np.sin(np.pi * t / dur) ** 2 * 0.8


def debris(dur=0.6, n=60, lo=1500, hi=9000):
    out = np.zeros(int(dur * SR))
    for _ in range(n):
        at = rng.exponential(dur / 5)
        if at >= dur - 0.03:
            continue
        i = int(at * SR)
        d = rng.uniform(0.004, 0.02)
        g = filt(noise(d * 4), "bandpass", [lo, hi]) * np.exp(-tt(d * 4) / d)
        g = g[: len(out) - i]
        out[i : i + len(g)] += g * rng.uniform(0.2, 1.0) * np.exp(-at * 3)
    return out * 0.6


def glass(dur=1.2, n=50):
    out = np.zeros(int(dur * SR))
    for _ in range(n):
        at = rng.exponential(dur / 6)
        if at >= dur - 0.1:
            continue
        i = int(at * SR)
        f = rng.uniform(3000, 10000)
        d = rng.uniform(0.02, 0.1)
        p = np.sin(2 * np.pi * f * tt(d * 4)) * np.exp(-tt(d * 4) / d)
        p = p[: len(out) - i]
        out[i : i + len(p)] += p * rng.uniform(0.2, 1.0) * np.exp(-at * 2)
    return out * 0.35


def blip(freq=1320, dur=0.12, sq=0.0):
    t = tt(dur)
    s = np.sin(2 * np.pi * freq * t) * (1 - sq) + np.sign(np.sin(2 * np.pi * freq * t)) * sq * 0.5
    return s * np.minimum(1, t / 0.004) * np.exp(-t / (dur * 0.35))


def pulse():
    """The YORU pulse: a soft electronic heartbeat (opening and loop point)."""
    t = tt(0.5)
    s = np.sin(2 * np.pi * 1318.5 * t) * np.exp(-t / 0.08) * 0.35 + np.sin(2 * np.pi * 659.3 * t) * np.exp(-t / 0.15) * 0.4
    thump = np.sin(2 * np.pi * (55 + 40 * np.exp(-t * 30)) * t) * env(t, 0.003, 0.12) * 0.7
    return (s + thump) * np.minimum(1, t / 0.003)


def riser(dur, f0=100, f1=4000, nz=0.6):
    t = tt(dur)
    k = t / dur
    f = f0 * (f1 / f0) ** (k ** 1.5)
    tone = filt(saw(f, t) * 0.2 + np.sin(2 * np.pi * np.cumsum(f * 0.5) / SR) * 0.3, "lowpass", 5000)
    return (tone + sweep(noise(dur), 200, 9000, q=0.3, curve=1.5) * nz) * k ** 2.3


def lead(freqs, dur, slide=0.0):
    """Short distorted synth accent."""
    t = tt(dur)
    f = np.interp(t, np.linspace(0, dur, len(freqs)), freqs) * (1 + slide * (1 - np.exp(-t * 30)))
    s = saw(f, t) + saw(f * 1.01, t) * 0.7
    s = np.tanh(filt(s, "lowpass", 3500) * 3.0)
    return s * env(t, 0.004, dur * 0.5) * 0.25


def pad(freqs, dur, cutoff=1200):
    t = tt(dur)
    s = sum(saw(f, t) + saw(f * 1.003, t) + saw(f * 0.997, t) for f in freqs)
    s = filt(s, "lowpass", cutoff) / (len(freqs) * 3)
    return s * np.clip(t / 0.6, 0, 1) * np.clip((dur - t) / 0.8, 0, 1)


def bell(freq, dur=2.0):
    t = tt(dur)
    parts = [(1.0, 1.0, 1.0), (2.76, 0.45, 0.4), (5.4, 0.22, 0.2), (8.93, 0.1, 0.1)]
    return sum(a * np.sin(2 * np.pi * freq * r * t) * np.exp(-t / d) for r, a, d in parts) * np.minimum(1, t / 0.001) * 0.45


def big_hit(at, gain=1.0, chord="E2", tail=1.0):
    place(kick(0.9, 230, 32, 3.5, 1.5), at, 1.0 * gain)
    place(sub(2.8 * tail, 66, 26), at, 0.9 * gain)
    place(taiko(1.4), at, 0.6 * gain, send=0.3)
    place(snare(0.4, 180, 0.2, 1.5), at, 0.5 * gain, send=0.3)
    place(crash(2.5 * tail, 2600, 0.9 * tail), at, 0.6 * gain, send=0.5)
    place(power(chord, 1.8 * tail), at, 0.75 * gain, send=0.25)


# ------------------------------------------------------------------ 01 the calm
place(pulse(), C["logoIn"], 0.5, send=0.4)
b0, b1 = C["border"]
t = tt(b1 - b0)
scratch = filt(noise(b1 - b0), "bandpass", [3000, 9000]) * (0.5 + 0.5 * np.abs(np.sin(2 * np.pi * 37 * t)))
place(scratch * np.sin(np.pi * t / (b1 - b0)) * 0.12, b0, 0.8, pan=-0.3)
place(blip(2637, 0.08), b1, 0.12, send=0.5)
t = tt(C["silence1"][0])
place(np.sin(2 * np.pi * note("E1") * t) * np.clip(t / 1.2, 0, 1) * 0.25 + filt(noise(len(t) / SR), "bandpass", [80, 300]) * 0.03 * np.clip(t / 1.4, 0, 1), 0.0, 0.6)

# ------------------------------------------------------------------ 02 first impact
I1 = C["impact1"]
big_hit(I1, 1.0, "E2")
place(debris(0.7, 80), I1 + 0.02, 0.7, send=0.2)
place(glass(1.0, 40), I1 + 0.03, 0.5, pan=0.2, send=0.4)
place(metal(170, 1.6, 0.6), I1, 0.35, pan=-0.3, send=0.4)
for k, at in enumerate([I1 + 2 * BEAT, I1 + 3 * BEAT]):
    place(taiko(1.0, 120, 66), at, 0.6, pan=(-1) ** k * 0.2, send=0.25)
    place(kick(0.4), at, 0.5)
    place(power("E2", BEAT * 0.9, palm=True), at, 0.55)
place(snare(0.3), I1 + 3 * BEAT, 0.45, send=0.3)
place(metal(410, 0.4, 0.12), I1 + 2.5 * BEAT, 0.3, pan=0.5)
w0, w1 = C["inkWipe"]
place(sweep(noise(w1 - w0), 200, 2400, kind="lowpass", curve=0.8) * np.linspace(0.2, 1, int((w1 - w0) * SR)) ** 2 * 0.6, w0, 0.7)
place(ink_splat(0.5), w0 + 0.05, 0.6)
place(riser(w1 - w0, 120, 3000, 0.4), w0, 0.35)

# ------------------------------------------------------------------ 03 panel break
P1, P2, P3, P4, P5 = C["p1"], C["p2"], C["p3"], C["p4"], C["p5"]
SPLIT = C["split"]
F0 = C["fold"][0]
# Drums build: quarters, then backbeat, then double-time hats.
bt = P1
i = 0
while bt < F0 - 1e-6:
    place(kick(0.4), bt, 0.75)
    if bt >= P2 and i % 2 == 1:
        place(snare(0.3), bt, 0.55, send=0.2)
    hats = 2 if bt < P4 else 4
    for h in range(hats):
        place(hat(), bt + h * BEAT / hats, 0.35 if h % 2 else 0.22, pan=0.3)
    if bt >= P2:
        place(bassg(note("E1"), BEAT * 0.45), bt, 0.6)
        place(bassg(note("E1"), BEAT * 0.45), bt + BEAT / 2, 0.45)
    bt += BEAT
    i += 1
place(swish(0.45, 300, 3000, 0.8), P1, 0.45, pan=-0.4)
place(ink_splat(0.4), P1 + 0.4, 0.5, pan=0.3)
# Panel collision.
place(kick(0.6, 200, 40, 3.0), P2 + 3 / FPS, 0.8)
place(paper_tear(0.12), P2, 0.5)
place(power("F2", 0.75), P2 + 3 / FPS, 0.6, send=0.2)
place(swish(0.35, 3000, 300), P2, 0.4)
z0, z1 = C["p2zoom"]
place(riser(z1 - z0, 300, 6000, 0.7), z0, 0.5)
# Halftone field: digital blips, then the collapse sweeps down into a point.
for k in range(8):
    place(blip(1760 + k * 220, 0.04, 0.6), P3 + 0.02 + k * 0.035, 0.12, pan=rng.uniform(-0.6, 0.6))
t = tt(P4 - P3 - 0.1)
place(np.sin(2 * np.pi * np.cumsum(2400 * np.exp(-t * 6) + 80) / SR) * np.linspace(0.2, 1, len(t)) * 0.15, P3 + 0.1, 0.6)
# White burst.
place(kick(0.7, 220, 36, 3.2), P4, 0.9)
place(sub(1.2, 60, 32), P4, 0.6)
place(power("G2", 0.38), P4, 0.6, send=0.2)
place(crash(1.2, 4000, 0.4), P4, 0.4, send=0.3)
# The crimson slash.
place(shing(2.0), P5, 0.6, pan=0.3, send=0.5)
place(swish(0.12, 1500, 9000, 0.6), P5 - 0.02, 0.6, pan=-0.4)
place(power("E3", 0.38), P5, 0.55)
place(kick(0.5), P5, 0.7)
# Split and fold: tearing paper, then two flips, with a fill into the reveal.
place(paper_tear(F0 - SPLIT + 0.05), SPLIT, 0.8, pan=0.1)
place(swish(0.35, 600, 2500), F0, 0.45, pan=-0.5)
place(swish(0.35, 500, 2200), F0 + 0.12, 0.45, pan=0.5)
R = C["reveal"]
k = 0
at = F0
gap = BEAT / 2
while at < R - 0.02:
    place(snare(0.2, 220, 0.07), at, 0.3 + 0.4 * (at - F0) / (R - F0), pan=rng.uniform(-0.3, 0.3))
    at += gap
    gap = max(BEAT / 6, gap * 0.82)
place(riser(R - F0, 150, 5000, 0.5), F0, 0.45)

# ------------------------------------------------------------------ 04 the digital world: the drop
riff = ["E2", "E2", "E2", "G2", "E2", "E2", "A2", "G2", "E2", "E2", "E2", "F2", "E2", "E2", "D2", "E2"]
p0 = C["push"][0]
n8 = int(round((p0 - R) / (BEAT / 2)))
for k8 in range(n8):
    at = R + k8 * BEAT / 2
    ch = riff[k8 % 16]
    accent = k8 % 4 == 0 or ch != "E2"
    place(power(ch, BEAT / 2 * (0.95 if accent else 0.6), palm=not accent), at, 0.55 if accent else 0.45)
    place(bassg(note(ch[:-1] + "1"), BEAT / 2 * 0.9), at, 0.55)
    place(hat(), at, 0.3, pan=0.3)
    if k8 % 2 == 0:
        beat_i = k8 // 2
        place(kick(0.45), at, 0.85)
        if beat_i % 2 == 1:
            place(snare(0.32), at, 0.6, send=0.25)
    if k8 in (5, 13):
        place(kick(0.45), at, 0.6)
place(kick(1.0, 240, 34, 3.4, 1.4), R, 1.0)
place(sub(2.0, 64, 30), R, 0.8)
place(crash(2.2, 3000, 0.9), R, 0.55, send=0.4)
place(lead([note("E5"), note("B4")], 0.5), R + 0.4, 0.5, pan=-0.2, send=0.3)
place(lead([note("G5"), note("F5")], 0.45, 0.0), R + 1.2, 0.45, pan=0.2, send=0.3)
for s in C["swipes"]:
    place(swish(0.3, 2500, 700), s, 0.25, pan=0.5)
    place(blip(2093, 0.03), s + 0.3, 0.08)

# ------------------------------------------------------------------ 05 second impact
p1 = C["push"][1]
place(riser(p1 - p0, 80, 5000, 0.7), p0, 0.55, send=0.2)
at = p0
gap = BEAT / 2
while at < p1 - 0.01:
    place(snare(0.2, 210, 0.07), at, 0.35 + 0.35 * (at - p0) / (p1 - p0))
    place(kick(0.3), at, 0.4)
    at += gap
    gap = max(BEAT / 8, gap * 0.8)
m0, m1 = C["manga"]
place(paper_tear(m1 - m0) * 0.6 + filt(noise(m1 - m0), "lowpass", 800) * 0.15, m0, 0.6)
B0, B1 = C["burst"]
big_hit(B0, 0.85, "E2", 0.7)
place(glass(1.0, 60), B0, 0.6, send=0.3)
place(debris(0.6, 70), B0 + 0.01, 0.6)
for at, ch in [(B0 + 0.2, "F2"), (B0 + 0.4, "G2")]:
    place(kick(0.4, 190, 40, 3.0), at, 0.8)
    place(power(ch, 0.18), at, 0.55)
    place(swish(0.18, 800, 6000), at - 0.05, 0.4, pan=rng.uniform(-0.5, 0.5))
place(swish(0.2, 900, 5000), B0 + 0.05, 0.5, pan=-0.5)
place(ink_splat(0.4), B0 + 0.21, 0.4, pan=0.4)

# The climax: one huge hit, then time stops.
CL = C["climax"]
big_hit(CL, 1.2, "E2", 1.2)
place(power("E3", 1.2), CL, 0.5)
place(shing(1.5), CL, 0.4, send=0.4)
place(glass(0.8, 50), CL, 0.5)
FZ0, FZ1 = C["freeze"]

# ------------------------------------------------------------------ collapse, brand, sting
c0, c1 = C["collapse"]
rev = (crash(c1 - c0 + 0.3, 1500, 0.4)[: int((c1 - c0) * SR)])[::-1]
place(rev * 1.2, c0, 0.7)
place(riser(c1 - c0, 400, 80, 0.3)[::-1] * 0.5, c0, 0.5)
place(sweep(noise(c1 - c0), 300, 5000, q=0.4, curve=2.0) * np.linspace(0, 1, int((c1 - c0) * SR)) ** 3, c0, 0.6)

L0, L1 = C["logo"]
t = tt(3.0)
thoom = np.sin(2 * np.pi * (44 + 20 * np.exp(-t * 6)) * t) * env(t, 0.012, 1.0)
thoom = np.tanh(thoom * 1.5) * 0.8 + np.sin(2 * np.pi * 88 * t) * env(t, 0.01, 0.6) * 0.2
place(thoom, L0, 0.75)
# The crimson line: a bright shimmer that travels left to right.
t = tt(L1 - L0)
sh = filt(noise(L1 - L0), "bandpass", [5000, 11000]) * 0.25 + np.sin(2 * np.pi * 3520 * t) * 0.05
pan_curve = np.linspace(-0.8, 0.8, len(t))
st = np.stack([sh * np.cos((pan_curve + 1) * np.pi / 4), sh * np.sin((pan_curve + 1) * np.pi / 4)], axis=1) * np.sin(np.pi * t / (L1 - L0))[:, None]
place(st, L0, 0.7, send=0.4)
tr0, tr1 = C["trace"]
place(swish(tr1 - tr0, 6000, 1500), tr0, 0.18, pan=0.0, send=0.5)
place(pad([note("E3"), note("B3"), note("D4"), note("F#4"), note("G4")], C["sting"] - L0, 1600), L0, 0.18, send=0.4)
for k, n_ in enumerate(["E4", "B4", "G4"]):
    place(bell(note(n_), 2.0), C["tagline"][0] + k * 0.06, 0.12, pan=(k - 1) * 0.4, send=0.6)

S = C["sting"]
big_hit(S, 1.05, "E2", 0.9)
place(shing(2.2), S, 0.55, pan=-0.2, send=0.6)
# Signature: E–F–B, the Phrygian half-step that has run through the whole score.
for k, n_ in enumerate(["E5", "F5", "B5"]):
    place(bell(note(n_), 2.4), S + 0.08 + k * 0.1, 0.3, pan=(k - 1) * 0.5, send=0.7)
place(lead([note("E4"), note("E5")], 0.6), S, 0.35, send=0.4)
sh0, sh1 = C["shrink"]
place((crash(0.7, 2000, 0.25)[::-1]) * 0.8, sh1 - 0.7, 0.45)
place(pulse(), C["calmHold"][0], 0.5, send=0.4)

# ------------------------------------------------------------------ mix
ir_t = tt(3.0)
irs = []
for ch in range(2):
    ir = rng.standard_normal(len(ir_t)) * np.exp(-ir_t / 0.7)
    ir = filt(ir, "lowpass", 7000)
    ir[: int(0.012 * SR)] = 0
    irs.append(ir / np.sqrt(np.sum(ir ** 2)))
Lb = len(dry)
wet = np.stack([signal.fftconvolve(verb[:, c], irs[c])[:Lb] for c in range(2)], axis=1)
mix = dry + wet * 0.45

# The film ends in silence and opens in silence, so tails are cut, not wrapped.
out = mix[:N].copy()


def gate(x, a, b, fade=0.004):
    i = int(a * SR)
    j = int(b * SR)
    fl = int(fade * SR)
    x[i : i + fl] *= np.linspace(1, 0, fl)[:, None]
    x[i + fl : j] = 0


out = filt(out, "highpass", 25)
out *= 1.0 / np.max(np.abs(out))
out = np.tanh(out * 1.8) / np.tanh(1.8)
out *= 10 ** (-2.2 / 20) / np.max(np.abs(out))

# Scripted silences (applied last, so they stay exact digital zero).
gate(out, *C["silence1"])
gate(out, *C["silence2"])
gate(out, C["collapse"][1], C["logo"][0])
# Time-stop: two frames of the climax, then only a ring holds the freeze.
gate(out, CL + 0.07, FZ1, fade=0.01)
t = tt(FZ1 - (CL + 0.07))
ring = np.sin(2 * np.pi * 3135.96 * t) * 0.03 + np.sin(2 * np.pi * 82.4 * t) * 0.09 * np.exp(-t / 0.5)
ring *= np.minimum(1, t / 0.01) * np.exp(-t / 0.9)
fz = int((CL + 0.07) * SR)
out[fz : fz + len(ring)] += np.stack([ring, ring], axis=1)
# The final black: the loop seam.
gate(out, C["endBlack"], DUR + 0.01, fade=0.03)

path = ROOT / "audio" / "break-the-feed.wav"
pcm = (np.clip(out, -1, 1) * 32767).astype("<i2")
with wave.open(str(path), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print("wrote", path, f"{N / SR:.2f}s")
