"""Procedural sound design for YORU Video 002 ("transmission").

All sound is synthesized (oscillators + filtered noise) and placed on the cue
sheet the picture uses. The mix is circular: anything that rings past the end
wraps around into the start, and the room tone is crossfaded across the seam,
so the video loops without an audible cut.

Hidden in the mix: "001" in Morse code, under the recovered-footage section.

Output: audio/yoru-002.wav, 48 kHz stereo, 16-bit.
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
TAIL = 4 * SR
FPS = C["fps"]
rng = np.random.default_rng(2)

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
    if i >= j:
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


def sweep_filter(x, f0, f1, kind="bandpass", q=0.25, block=256, curve=1.0):
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


def crush(x, bits=5, hold=8):
    q = 2 ** bits
    y = np.round(x * q) / q
    return np.repeat(y[::hold], hold)[: len(x)]


# ------------------------------------------------------------------ instruments
def kick(dur=0.6, f0=180, f1=40, drive=2.5, decay=0.4):
    t = tt(dur)
    f = f1 + (f0 - f1) * np.exp(-t * 30)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(t, 0.001, dur * decay)
    click = filt(noise(dur), "highpass", 2500) * env(t, 0.0003, 0.004) * 0.6
    return np.tanh((body + click) * drive) / np.tanh(drive)


def sub(dur=2.0, f0=60, f1=28, decay=0.4):
    t = tt(dur)
    f = f1 + (f0 - f1) * np.exp(-t * 2.5)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(t, 0.004, dur * decay)


def burst(dur=1.2, hp=1500, decay=0.35):
    t = tt(dur)
    return filt(noise(dur), "highpass", hp) * env(t, 0.0008, decay) * 0.4


def metal(base=200, dur=1.5, decay=0.5):
    t = tt(dur)
    out = np.zeros_like(t)
    for k, r in enumerate([1.0, 1.593, 2.135, 2.65, 3.17, 4.08, 5.42, 6.8]):
        out += np.sin(2 * np.pi * base * r * t + rng.uniform(0, 6.28)) * np.exp(-t / (decay / (1 + k * 0.25))) / (1 + k * 0.6)
    return np.tanh(out * 1.3) * 0.5 * np.minimum(1, t / 0.0008)


def bell(freq, dur=1.2):
    t = tt(dur)
    parts = [(1.0, 1.0, 0.9), (2.76, 0.5, 0.35), (5.4, 0.25, 0.18), (8.93, 0.12, 0.1)]
    out = sum(a * np.sin(2 * np.pi * freq * r * t) * np.exp(-t / d) for r, a, d in parts)
    return out * np.minimum(1, t / 0.001) * 0.5


def glitch(dur=0.2, grain=0.016, pitch=None):
    f = pitch or rng.uniform(300, 1600)
    g = filt(noise(grain), "bandpass", [500, 6000]) * 0.7 + np.sin(2 * np.pi * f * tt(grain))
    reps = max(1, int(dur / grain))
    out = np.concatenate([g * (0.55 + 0.45 * (k % 2)) for k in range(reps)])
    return crush(out, 4, 6) * 0.5


def chirp(dur=0.08, f0=1200, f1=4000):
    t = tt(dur)
    f = f0 * (f1 / f0) ** (t / dur)
    return np.sign(np.sin(2 * np.pi * np.cumsum(f) / SR)) * env(t, 0.001, dur * 0.5) * 0.25


def tick(gain=1.0):
    t = tt(0.025)
    return filt(noise(0.025), "highpass", 4000) * env(t, 0.0002, 0.004) * 0.5 * gain


def relay_click():
    t = tt(0.06)
    c = filt(noise(0.06), "bandpass", [1500, 7000]) * env(t, 0.0002, 0.006)
    thump = np.sin(2 * np.pi * 120 * t) * env(t, 0.001, 0.02) * 0.6
    whine = np.sin(2 * np.pi * 11800 * t) * env(t, 0.003, 0.04) * 0.08
    return (c + thump + whine) * 0.6


def swish(dur=0.25, f0=500, f1=5000):
    t = tt(dur)
    return sweep_filter(noise(dur), f0, f1, q=0.4) * np.sin(np.pi * t / dur) ** 2 * 0.7


def riser(dur, f0=80, f1=3000, nz=0.6):
    t = tt(dur)
    k = t / dur
    f = f0 * (f1 / f0) ** (k ** 1.5)
    tone = filt(saw(f, t) * 0.25 + np.sin(2 * np.pi * np.cumsum(f * 0.5) / SR) * 0.35, "lowpass", 5000)
    return (tone + sweep_filter(noise(dur), 200, 9000, q=0.3, curve=1.5) * nz) * k ** 2.4


def chord(freqs, dur=3.0, drive=3.0, decay=1.2, cutoff=(4000, 250)):
    t = tt(dur)
    s = sum(saw(f, t) + saw(f * 1.004, t) * 0.7 for f in freqs)
    s = sweep_filter(s, cutoff[0], cutoff[1], kind="lowpass", curve=0.5)
    return np.tanh(s * drive / len(freqs)) * env(t, 0.003, decay) * 0.6


def pad(freqs, dur, cutoff=600):
    t = tt(dur)
    s = sum(saw(f, t) + saw(f * 1.003, t) + saw(f * 0.997, t) for f in freqs)
    return filt(s, "lowpass", cutoff) / (len(freqs) * 3) * np.clip(t / 0.4, 0, 1)


D1, D2, Eb2, F2, A2, Ab2, D3 = 36.71, 73.42, 77.78, 87.31, 110.0, 103.83, 146.83

# ------------------------------------------------------------------ 0–1.5 s: cold open
place(relay_click(), 0.0, 0.5)
fl0, fl1 = C["flicker"]
for k in range(5):
    place(filt(noise(0.012), "bandpass", [2000, 9000]) * 0.7, fl0 + k * 0.014 + rng.uniform(0, 0.006), 0.35, pan=rng.uniform(-0.5, 0.5))
place(chirp(0.06, 2400, 900), fl0, 0.25)
B = C["breach"]
place(sub(0.5, 30, 45, 1.0) * np.linspace(0, 1, int(0.5 * SR)) ** 3, B - 0.5, 0.6)
place(burst(0.35, 1200, 0.15)[::-1], B - 0.35, 0.5)

# ------------------------------------------------------------------ 1.5 s: breach
place(kick(0.9, 220, 34, 3.2, 0.45), B, 1.0)
place(sub(2.2, 66, 26), B, 0.9)
place(burst(1.4, 1800, 0.45), B, 0.7, send=0.5)
place(metal(170, 1.6, 0.6), B, 0.35, pan=-0.3, send=0.4)
place(glitch(0.2, 0.012, 900), B + 0.033, 0.55)
place(crush(filt(noise(0.2), "bandpass", [800, 5000]), 3, 12) * 0.5, B + 0.03, 0.4, pan=0.4)

# ------------------------------------------------------------------ 1.7–3.8 s: recovered footage
cuts = C["cuts1"]
place(pad([D2, Eb2], C["stutter"][1] - cuts[0], 380), cuts[0], 0.22)
for i, c in enumerate(cuts):
    place(glitch(0.07, 0.009), c, 0.45, pan=(-1) ** i * 0.4)
    place(sub(0.5, 58, 40, 0.3), c, 0.45)
    place(chirp(0.05, 1800 + i * 200, 3600), c + 0.04, 0.18, pan=0.5)
# Redaction bars on the profile screen.
for d in (0.06, 0.14, 0.2):
    place(swish(0.16, 900, 3500), cuts[3] + d, 0.35, pan=-0.2)
# Hidden: "001" in Morse code.
m0, unit = C["morse"]
code = ["-----", "-----", ".----"]
tm = m0
mt = []
for letter in code:
    for sym in letter:
        n_units = 1 if sym == "." else 3
        mt.append((tm, n_units * unit))
        tm += (n_units + 1) * unit
    tm += 2 * unit
for at, d in mt:
    t = tt(d)
    tone = np.sin(2 * np.pi * 880 * t) * np.minimum(1, np.minimum(t, d - t) / 0.004)
    place(tone, at, 0.075, pan=0.35, send=0.2)

# ------------------------------------------------------------------ 3.8–4.4 s: stutter; 4.4 s: 夜
s0, s1 = C["stutter"]
k = 0
at = s0
while at < s1 - 0.01:
    place(glitch(0.06, 0.008, 400 + k * 90), at, 0.4 + 0.3 * (at - s0) / (s1 - s0), pan=rng.uniform(-0.6, 0.6))
    at += 2 / FPS
    k += 1
place(riser(s1 - s0, 200, 4000, 0.5), s0, 0.35)
e0 = C["egg"][0]
# In-sen scale bell motif, bit-crushed: the sound of the hidden character.
for i, f in enumerate([1174.7, 880.0, 1244.5]):
    place(crush(bell(f, 1.6), 6, 2), e0 + i / FPS, 0.32, pan=(i - 1) * 0.5, send=0.7)
place(sub(0.8, 50, 36), e0, 0.4)

# ------------------------------------------------------------------ 4.5–6.6 s: the archive
a0, a1 = C["archive"]
place(pad([D1 * 2, A2 / 2, Eb2], a1 - a0, 300), a0, 0.3)
place(kick(0.6, 160, 40, 2.0, 0.4), a0, 0.6)
# Power-on clicks, outward from the centre (mirrors the picture's order).
for i in range(35):
    at = a0 + 0.02 + i * 0.022 + rng.uniform(0, 0.03)
    place(relay_click(), at, 0.35 * (1 - i / 50), pan=rng.uniform(-0.8, 0.8))
place(sub(1.5, 45, 30, 0.6), a0 + 0.3, 0.3)
st = C["staticAll"]
place(filt(noise(C["redAll"] - st), "bandpass", [300, 9000]) * 0.5 * np.linspace(1, 0.7, int((C["redAll"] - st) * SR)), st, 0.5)
place(glitch(0.12, 0.01), st, 0.5)
ra = C["redAll"]
t = tt(a1 - ra)
alarm = np.tanh((saw(D2, t) + saw(Ab2, t)) * 1.6) * np.clip(t / 0.05, 0, 1)
place(filt(alarm, "lowpass", 900) * 0.4, ra, 0.6)
place(kick(0.5, 150, 40, 2.2), ra, 0.6)
t = tt(0.3)
place(np.sin(2 * np.pi * np.cumsum(9000 * np.exp(-t * 14) + 120) / SR) * env(t, 0.002, 0.15) * 0.15, a1 - 0.15, 0.5)
place(sub(0.4, 80, 35), a1 - 0.15, 0.5)

# ------------------------------------------------------------------ 6.6–7.6 s: build
bl = C["build"]
I2 = C["impact2"]
place(riser(I2 - bl[0], 60, 6000, 0.9), bl[0], 0.7, send=0.2)
for i, c in enumerate(bl):
    place(kick(0.35, 170 + i * 10, 46, 2.4, 0.3), c, 0.55 + 0.05 * i)
    place(glitch(0.05, 0.007, 600 + i * 150), c, 0.4, pan=(-1) ** i * 0.5)
place(chirp(0.03, 3000, 3000) + 0, bl[4], 0.4)
place(chirp(0.03, 3000, 3000), bl[4] + 0.04, 0.4)
place(burst(0.2, 3000, 0.05), bl[6], 0.5)
# Impact two: huge, then the transmission drops (gated below).
place(kick(0.9, 240, 32, 3.5), I2, 1.1)
place(sub(1.5, 70, 30), I2, 1.0)
place(burst(1.0, 1000, 0.3), I2, 0.9)
place(chord([D2, A2, D3], 0.8, 5.0, 0.3), I2, 0.6)

# ------------------------------------------------------------------ 8.2 s: the logo
R = C["reveal"]
L = C["lock"]
t = tt(0.25)
place(np.sin(2 * np.pi * np.cumsum(60 + 15000 * (t / 0.25) ** 3) / SR) * env(t, 0.001, 0.2) * 0.08, R, 0.6)  # CRT turn-on whine
place(kick(1.2, 260, 30, 3.5, 0.45), R, 1.1)
place(sub(3.5, 70, 25), R, 1.0)
place(burst(2.5, 1500, 0.9), R, 0.7, send=0.7)
place(chord([D1 * 2, A2 / 2, D2 * 2, F2 * 2], 3.0, 3.5, 1.2), R, 0.55, send=0.4)
for i in range(9):
    place(swish(0.35 + rng.uniform(0, 0.25), 400, 7000), R + 0.05 + i * 0.075, 0.28, pan=rng.uniform(-0.9, 0.9), send=0.3)
place(riser(L - R, 300, 5000, 0.4), R, 0.25)
place(metal(294, 2.5, 0.9), L, 0.5, send=0.8)
place(kick(0.6, 160, 45, 2.5), L, 0.7)
place(sub(1.5, 55, 34), L, 0.6)
for i, f in enumerate([587.3, 880.0, 1174.7, 1396.9]):
    place(bell(f, 2.5), L + i * 0.03, 0.12, pan=(i - 1.5) * 0.4, send=0.9)
place(pad([D2, F2, A2], C["powerOff"][0] - L, 520), L, 0.32, send=0.2)
for m in C["micro"]:
    place(glitch(0.06, 0.008), m, 0.35, pan=rng.uniform(-0.5, 0.5))
h0, h1 = C["headline"]
for i in range(int((h1 - h0) * 32)):
    place(tick(0.8), h0 + i / 32 + rng.uniform(0, 0.01), 0.3, pan=rng.uniform(-0.4, 0.4))
place(sub(0.6, 50, 40), h0, 0.3)
o0, o1 = C["eot"]
for i in range(int((o1 - o0) * 30)):
    place(tick(0.6), o0 + i / 30, 0.25, pan=0.2)
t = tt(1.0)
place(np.sin(2 * np.pi * D2 * t) * env(t, 0.01, 0.4) * 0.5, o1, 0.4)

# ------------------------------------------------------------------ 11.7 s: power off
P0 = C["powerOff"][0]
place(relay_click(), P0, 0.8)
t = tt(0.6)
place(np.sin(2 * np.pi * np.cumsum(8000 * np.exp(-t * 9) + 60) / SR) * env(t, 0.001, 0.35) * 0.2, P0, 0.7)
place(sub(0.7, 90, 30), P0, 0.7)
place(filt(noise(0.8), "bandpass", [1000, 8000]) * env(tt(0.8), 0.001, 0.2) * 0.25, P0, 0.6, send=0.4)

# ------------------------------------------------------------------ mix
ir_t = tt(2.4)
irs = []
for ch in range(2):
    ir = rng.standard_normal(len(ir_t)) * np.exp(-ir_t / 0.55)
    ir = filt(ir, "lowpass", 6000)
    ir[: int(0.01 * SR)] = 0
    irs.append(ir / np.sqrt(np.sum(ir ** 2)))
L_ = len(dry)
wet = np.stack([signal.fftconvolve(verb[:, c], irs[c])[:L_] for c in range(2)], axis=1)
mix = dry + wet * 0.5

# The transmission drops: hard cut two frames after impact two, true silence until the logo.
S0, S1 = C["silence"]
gate = np.ones(L_)
g0 = int(S0 * SR)
gate[g0 : g0 + int(0.004 * SR)] = np.linspace(1, 0, int(0.004 * SR))
gate[g0 + int(0.004 * SR) : int(S1 * SR)] = 0
mix *= gate[:, None]

# Wrap the tails past the end back into the start.
out = mix[:N].copy()
out[:TAIL] += mix[N:]

# Room tone: mains hum + air, crossfaded across the loop seam.
X = int(1.0 * SR)
t = np.arange(N + X) / SR
hum = sum(a * np.sin(2 * np.pi * 50 * h * t) for h, a in [(1, 1.0), (2, 0.5), (3, 0.35), (5, 0.12)])
air = filt(rng.standard_normal(N + X), "lowpass", 1800) * 0.6 + filt(rng.standard_normal(N + X), "highpass", 6000) * 0.08
room = hum * 0.05 + air * 0.05
fade = np.linspace(0, 1, X)
room_loop = room[:N].copy()
room_loop[:X] = room[:X] * np.sqrt(fade) + room[N : N + X] * np.sqrt(1 - fade)
room_loop *= gate[:N]
out += np.stack([room_loop, np.roll(room_loop, 37)], axis=1) * 0.5

out = filt(out, "highpass", 22)
out *= 1.0 / np.max(np.abs(out))
out = np.tanh(out * 1.7) / np.tanh(1.7)
out *= 10 ** (-1.5 / 20) / np.max(np.abs(out))

path = ROOT / "audio" / "yoru-002.wav"
pcm = (np.clip(out, -1, 1) * 32767).astype("<i2")
with wave.open(str(path), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print("wrote", path, f"{N / SR:.2f}s")
