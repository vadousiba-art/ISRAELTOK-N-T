"""Procedural soundtrack for the YORU trailer.

Every sound is synthesized here from oscillators and noise and placed on the
same cue sheet the picture uses (cues.json), so hits land on the frame.
Output: audio/yoru-trailer.wav, 48 kHz stereo, 16-bit.
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
N = int(DUR * SR)
BEAT = 60.0 / C["bpm"]
rng = np.random.default_rng(2026)

dry = np.zeros((N, 2))
verb = np.zeros((N, 2))  # reverb send


# ------------------------------------------------------------------ helpers
def tt(dur):
    return np.arange(int(dur * SR)) / SR


def place(sig, at, gain=1.0, pan=0.0, send=0.0):
    """Mix a mono or stereo signal into the bus at time `at` (seconds)."""
    if sig.ndim == 1:
        l = np.cos((pan + 1) * np.pi / 4)
        r = np.sin((pan + 1) * np.pi / 4)
        sig = np.stack([sig * l, sig * r], axis=1) * np.sqrt(2)
    i = int(round(at * SR))
    if i >= N:
        return
    j = min(N, i + len(sig))
    seg = sig[: j - i] * gain
    dry[i:j] += seg
    if send:
        verb[i:j] += seg * send


def env(t, a=0.002, d=0.3):
    return np.minimum(1.0, t / max(a, 1e-6)) * np.exp(-t / d)


def sos(kind, f, order=2):
    nyq = SR / 2
    if isinstance(f, (list, tuple)):
        wn = [min(x / nyq, 0.99) for x in f]
    else:
        wn = min(f / nyq, 0.99)
    return signal.butter(order, wn, btype=kind, output="sos")


def filt(x, kind, f, order=2):
    return signal.sosfilt(sos(kind, f, order), x)


def sweep_filter(x, f_start, f_end, kind="bandpass", q=0.25, block=256, curve=2.0):
    """Time-varying filter, block by block, with carried state."""
    out = np.zeros_like(x)
    nb = int(np.ceil(len(x) / block))
    zi = None
    for b in range(nb):
        k = (b / max(1, nb - 1)) ** curve
        f = f_start * (f_end / f_start) ** k
        if kind == "bandpass":
            s = sos("bandpass", [f * (1 - q), f * (1 + q)])
        else:
            s = sos(kind, f)
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


def sine_glide(f0, f1, dur, curve=4.0):
    t = tt(dur)
    f = f1 + (f0 - f1) * np.exp(-t * curve / dur * 4)
    return np.sin(2 * np.pi * np.cumsum(f) / SR)


# ------------------------------------------------------------------ instruments
def kick(dur=0.5, f0=170, f1=42, punch=1.0, drive=2.2):
    t = tt(dur)
    f = f1 + (f0 - f1) * np.exp(-t * 32)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(t, 0.001, dur * 0.42)
    click = filt(noise(dur), "highpass", 2500) * env(t, 0.0003, 0.004) * 0.5 * punch
    return np.tanh((body + click) * drive) / np.tanh(drive)


def sub_boom(dur=3.0, f0=58, f1=27):
    t = tt(dur)
    f = f1 + (f0 - f1) * np.exp(-t * 2.2)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(t, 0.004, dur * 0.38)


def crash(dur=2.5, hp=3000, decay=0.7):
    t = tt(dur)
    n = filt(noise(dur), "highpass", hp)
    return n * env(t, 0.001, decay) * 0.35


def metal(base=210, dur=2.0, decay=0.6, bright=1.0):
    t = tt(dur)
    ratios = [1.0, 1.593, 2.135, 2.65, 3.17, 4.08, 5.42, 6.8, 8.93]
    out = np.zeros_like(t)
    for k, r in enumerate(ratios):
        a = 1.0 / (1 + k * 0.6) * (bright if k > 3 else 1)
        out += a * np.sin(2 * np.pi * base * r * t + rng.uniform(0, 6.28)) * np.exp(-t / (decay / (1 + k * 0.25)))
    out *= np.minimum(1, t / 0.0008)
    return np.tanh(out * 1.4) * 0.5


def snare(dur=0.3, tone=190, decay=0.12):
    t = tt(dur)
    n = filt(noise(dur), "bandpass", [1200, 9000]) * env(t, 0.0005, decay)
    b = np.sin(2 * np.pi * tone * t) * env(t, 0.0005, 0.05)
    return np.tanh((n * 0.9 + b * 0.8) * 1.6) * 0.6


def hat(dur=0.06, decay=0.018):
    t = tt(dur)
    return filt(noise(dur), "highpass", 7500) * env(t, 0.0003, decay) * 0.35


def beep(freq=1760, dur=0.18):
    t = tt(dur)
    tone = np.sign(np.sin(2 * np.pi * freq * t)) * 0.25 + np.sin(2 * np.pi * freq / 2 * t) * 0.6
    return filt(tone, "lowpass", 6000) * np.minimum(1, t / 0.002) * np.exp(-t / 0.07)


def bass_stab(freq=36.71, dur=0.4, cutoff=900, drive=4.0, decay=0.18):
    t = tt(dur)
    s = saw(freq, t) + saw(freq * 1.006, t) * 0.8 + saw(freq * 2, t) * 0.4
    s = sweep_filter(s, cutoff * 3, cutoff * 0.25, kind="lowpass", curve=0.6)
    s = np.tanh(s * drive) * env(t, 0.002, decay)
    sub = np.sin(2 * np.pi * freq * t) * env(t, 0.002, decay * 1.4)
    return s * 0.55 + sub * 0.7


def glitch(dur=0.22, grain=0.018, base=None):
    """Stuttered, bit-crushed grain."""
    g = base if base is not None else filt(noise(grain), "bandpass", [600, 5000]) * 0.8 + np.sin(2 * np.pi * rng.uniform(300, 1400) * tt(grain))
    reps = int(dur / grain)
    out = np.concatenate([g * (0.6 + 0.4 * (k % 2)) * (1 - k / reps) for k in range(reps)])
    q = 2 ** 4
    out = np.round(out * q) / q
    hold = 6
    out = np.repeat(out[::hold], hold)[: len(out)]
    return out * 0.5


def whoosh(dur=0.6, f0=300, f1=6000, curve=1.0):
    t = tt(dur)
    w = sweep_filter(noise(dur), f0, f1, q=0.35, curve=curve)
    shape = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 2
    return w * shape * 0.8


def metal_sweep(dur=1.2, d0=0.004, d1=0.0004):
    """Flanged noise: a comb filter whose delay sweeps — the metallic swoosh."""
    n = filt(noise(dur), "highpass", 400)
    t = tt(dur)
    d = d0 * (d1 / d0) ** (t / dur)
    idx = np.arange(len(n)) - d * SR
    delayed = np.interp(idx, np.arange(len(n)), n, left=0)
    out = (n + delayed * 0.95) * np.sin(np.pi * t / dur) ** 1.5
    return filt(out, "highpass", 900) * 0.45


def riser(dur, f0=80, f1=2400, noise_amt=0.6):
    t = tt(dur)
    k = t / dur
    f = f0 * (f1 / f0) ** (k ** 1.6)
    tone = saw(f, t) * 0.25 + np.sin(2 * np.pi * np.cumsum(f * 0.5) / SR) * 0.3
    tone = filt(tone, "lowpass", 5000)
    nz = sweep_filter(noise(dur), 200, 9000, q=0.3, curve=1.6) * noise_amt
    return (tone + nz) * k ** 2.2


def shards(at, count=40, spread=1.4, gain=0.25):
    """Glass fragments: many tiny high pings scattered after an impact."""
    for _ in range(count):
        dt = rng.exponential(spread / 4)
        if dt > spread:
            continue
        f = rng.uniform(2500, 9000)
        d = rng.uniform(0.02, 0.12)
        t = tt(d * 4)
        s = np.sin(2 * np.pi * f * t) * np.exp(-t / d)
        place(s, at + dt, gain * rng.uniform(0.3, 1.0) * np.exp(-dt), pan=rng.uniform(-0.9, 0.9), send=0.4)


def chord(freqs, dur=3.0, drive=3.0, decay=1.2):
    t = tt(dur)
    s = sum(saw(f, t) + saw(f * 1.004, t) * 0.7 for f in freqs)
    s = sweep_filter(s, 5000, 200, kind="lowpass", curve=0.5)
    return np.tanh(s * drive / len(freqs)) * env(t, 0.003, decay) * 0.6


def gong(base=55, dur=5.0):
    t = tt(dur)
    parts = [(1.0, 1.0), (2.01, 0.7), (2.76, 0.6), (3.98, 0.4), (5.4, 0.3), (6.79, 0.25), (8.21, 0.2)]
    out = sum(a * np.sin(2 * np.pi * base * r * t * (1 + 0.003 * np.sin(2 * np.pi * 3.1 * t))) * np.exp(-t / (2.4 / (1 + r * 0.3))) for r, a in parts)
    return np.tanh(out * 0.8) * np.minimum(1, t / 0.004) * 0.5


# Notes (Hz). D minor.
D1, F1, G1, A1, C2, D2 = 36.71, 43.65, 49.0, 55.0, 65.41, 73.42
A2, D3, F3, A3 = 110.0, 146.83, 174.61, 220.0

# ------------------------------------------------------------------ 0–3 s: signal and rush
t = tt(15.2)
drone = (np.sin(2 * np.pi * D1 * t) * 0.6 + filt(saw(D2, t) + saw(D2 * 1.01, t), "lowpass", 220) * 0.18)
drone *= np.clip(t / 2.5, 0, 1) * (0.55 + 0.45 * np.clip((t - 6.85) / 6, 0, 1))
drone *= 0.8 + 0.2 * np.sin(2 * np.pi * 0.5 * t)
place(drone, 0.0, 0.32)
place(filt(noise(3.0), "bandpass", [80, 400]) * np.linspace(0, 1, int(3.0 * SR)) ** 2 * 0.25, 0.0, 0.5)

for i, s in enumerate(C["signal"]):
    place(beep(1760 if i < 2 else 2349), s, 0.32, pan=0.0, send=0.5)
    place(sub_boom(0.6, 70, 45), s, 0.25)

r0, r1 = C["rush"]
place(riser(r1 - r0, 60, 3000, 0.7), r0, 0.55, send=0.2)
place(metal_sweep(r1 - r0, 0.006, 0.0003), r0, 0.7, pan=-0.2)
# Accelerating ticks during the rush.
tk = r0
gap = 0.22
while tk < r1 - 0.03:
    place(hat(0.04, 0.01) * 1.4, tk, 0.6, pan=rng.uniform(-0.5, 0.5))
    tk += gap
    gap = max(0.028, gap * 0.86)
# Reverse swell into the first impact.
rev = (crash(1.0, 1500, 0.4) + filt(noise(1.0), "lowpass", 3000) * env(tt(1.0), 0.001, 0.3) * 0.2)[::-1]
place(rev, r1 - 1.0, 0.6)

# ------------------------------------------------------------------ 3 s: impact one
I1 = C["impact1"]
place(kick(0.9, 220, 38, 1.5, 3.0), I1, 1.0)
place(sub_boom(2.8, 64, 26), I1, 0.95)
place(crash(3.0, 2500, 1.0), I1, 0.9, send=0.6)
place(metal(180, 2.5, 0.9), I1, 0.55, pan=-0.25, send=0.5)
place(metal(271, 2.0, 0.6), I1, 0.4, pan=0.3, send=0.5)
place(chord([D2, A2, D3], 1.6, 4.0, 0.5), I1, 0.45, send=0.3)
shards(I1 + 0.02, 70, 1.8, 0.3)

# ------------------------------------------------------------------ 3–6.9 s: cuts and words
for i, c in enumerate(C["cuts2"]):
    if i > 0:
        place(kick(0.5, 180, 42, 1.2, 2.5), c, 0.85)
        place(bass_stab([D1, D1, F1, D1, A1 / 2 * 2, D1, C2 / 2, D1][i % 8], 0.38, 900, 5.0, 0.16), c, 0.55)
    place(hat(), c + BEAT / 2, 0.5, pan=0.35)
    if i % 2 == 1:
        place(snare(0.35), c, 0.45, send=0.25)
    place(metal_sweep(0.35, 0.002, 0.0006), c, 0.3, pan=(-1) ** i * 0.6)
for w in C["words2"]:
    if w["style"] == "kanji":
        place(gong(73.4, 3.0), w["t"], 0.55, send=0.5)
        place(kick(0.8, 200, 34, 1.5, 3.0), w["t"], 0.9)
        place(sub_boom(1.6, 60, 30), w["t"], 0.7)
        place(crash(2.0, 3500, 0.6), w["t"], 0.5, send=0.4)
    else:
        place(metal(320 if w["style"] == "slam" else 160, 1.0, 0.25), w["t"], 0.45, send=0.3)
        place(glitch(0.16), w["t"] + 0.05, 0.45, pan=rng.uniform(-0.6, 0.6))
    if w["style"] == "giant":
        place(chord([D2, F3 / 2, A2], 0.9, 5.0, 0.35), w["t"], 0.5)
        shards(w["t"], 25, 0.8, 0.2)
# Stutter into the city.
place(glitch(0.4, 0.025), C["cuts2"][-1] + 0.05, 0.4)
place(riser(0.43, 300, 5000, 0.9), C["section3"] - 0.43, 0.5)

# ------------------------------------------------------------------ 6.9–12 s: the city
S3 = C["section3"]
place(kick(1.0, 220, 36, 1.5, 3.2), S3, 1.0)
place(crash(2.5, 2500, 0.9), S3, 0.7, send=0.5)
place(sub_boom(1.8, 60, 28), S3, 0.7)
place(metal(140, 2.0, 0.8), S3, 0.35, send=0.5)
BASS = [D1, D1, D2, D1, F1, D1, A1, D1, C2, D1, D2, D1, A1, G1, F1, D1]
n_beats = int(round((C["collapse"] - S3) / BEAT))
for b in range(n_beats):
    bt = S3 + b * BEAT
    if b > 0:
        place(kick(0.45, 170, 44, 1.0, 2.4), bt, 0.82)
    if b % 2 == 1:
        place(snare(0.35, 200, 0.14), bt, 0.55, send=0.3)
    for k in range(4):
        st = bt + k * BEAT / 4
        place(hat(0.05, 0.012 if k % 2 == 0 else 0.03), st, 0.32 if k % 2 else 0.18, pan=0.3 if k % 2 else -0.3)
    for k in range(4):
        st = bt + k * BEAT / 4
        if k == 0 and b > 0:
            continue  # the kick owns the downbeat
        place(bass_stab(BASS[(b * 4 + k) % 16], BEAT / 4 * 0.95, 700 + 300 * (k == 2), 3.5, 0.06), st, 0.38)
# Category words: hits with pitched metal.
for i, w in enumerate(C["words3"]):
    place(metal(260 + i * 40, 0.8, 0.2), w["t"], 0.35, pan=(-1) ** i * 0.4, send=0.35)
    place(glitch(0.1, 0.012), w["t"], 0.3)
# App screens: short whooshes as they fly past.
for i in range(7):
    place(whoosh(0.45, 400, 7000, 1.2), 7.05 + i * 0.62 - 0.12, 0.28, pan=(-1) ** i * 0.7)
# Riser into the YORU stamp.
Y0 = C["yoruWord"][0]
place(riser(Y0 - 9.0, 120, 4000, 0.8), 9.0, 0.5)
place(metal_sweep(0.85, 0.005, 0.0004), Y0 - 0.85, 0.55)
place(kick(0.9, 230, 34, 1.6, 3.2), Y0, 1.0)
place(sub_boom(2.0, 62, 27), Y0, 0.85)
place(crash(2.0, 3000, 0.7), Y0, 0.6, send=0.5)
for i in range(4):
    place(metal(196 * (1 + i * 0.25), 0.9, 0.3), Y0 + i * BEAT / 2, 0.45, pan=(i - 1.5) * 0.4, send=0.4)
    place(bass_stab(D2 if i < 3 else A1, 0.25, 1500, 6.0, 0.1), Y0 + i * BEAT / 2, 0.4)
place(glitch(0.3, 0.02), Y0 + BEAT * 2.5, 0.5)
F0 = C["findPeople"][0]
place(kick(0.7, 200, 38, 1.3, 2.8), F0, 0.9)
place(chord([D2, F3 / 2, A2, D3], 1.0, 4.0, 0.4), F0, 0.45, send=0.4)
place(crash(1.5, 4000, 0.5), F0, 0.45, send=0.3)

# ------------------------------------------------------------------ 12–15.2 s: collapse
for i, r in enumerate(C["roll"]):
    k = i / len(C["roll"])
    place(snare(0.25, 190 + i * 12, 0.08 + 0.05 * (1 - k)), r, 0.45 + 0.4 * k, pan=rng.uniform(-0.3, 0.3), send=0.25)
    place(kick(0.3, 160 + i * 6, 46, 1.0, 2.0), r, 0.5 + 0.3 * k)
    if i % 3 == 0:
        place(glitch(0.08, 0.008), r + 0.02, 0.35)
SIL0, SIL1 = C["silence"]
CL = C["collapse"]
place(riser(SIL0 - CL, 50, 6000, 1.0), CL, 0.7, send=0.2)
place(sine_glide(40, 400, SIL0 - CL, 0.2) * np.linspace(0, 1, int((SIL0 - CL) * SR)) ** 2, CL, 0.25)
place(metal_sweep(SIL0 - CL, 0.008, 0.0002), CL, 0.6)
place(chord([D2, A2], SIL0 - CL, 2.0, 99) * np.linspace(0, 1, int((SIL0 - CL) * SR)) ** 3, CL, 0.4)

# ------------------------------------------------------------------ 16 s: the biggest impact
IF = C["impactFinal"]
place(kick(1.4, 260, 32, 2.0, 4.0), IF, 1.15)
place(sub_boom(4.0, 70, 24), IF, 1.1)
place(crash(4.0, 1800, 1.6), IF, 1.0, send=0.8)
place(gong(D2 / 2 * 2, 5.0), IF, 0.75, send=0.7)
place(metal(147, 4.0, 1.6), IF, 0.5, pan=-0.3, send=0.7)
place(metal(220, 3.0, 1.1), IF, 0.4, pan=0.3, send=0.7)
place(chord([D1 * 2, A2 / 2, D2 * 2, F3, A3], 3.5, 4.0, 1.4), IF, 0.6, send=0.5)
shards(IF + 0.02, 120, 2.2, 0.32)
# A single heartbeat in the silence.
place(sub_boom(0.6, 55, 38), 15.62, 0.4)
# Inhale: a reversed swell into the final hit.
place((crash(0.38, 1200, 0.18) + metal(300, 0.38, 0.12) * 0.5)[::-1], IF - 0.38, 0.55)

# Assembly: pings for the tiles flying in.
for k in range(26):
    at = C["assemble"][0] + 0.1 + rng.uniform(0, C["assemble"][1] - C["assemble"][0] - 0.2)
    f = rng.choice([1174.7, 1396.9, 1760.0, 2349.3, 2793.8])
    p = tt(0.6)
    place(np.sin(2 * np.pi * f * p) * np.exp(-p / 0.12) * 0.3, at, 0.25, pan=rng.uniform(-0.8, 0.8), send=0.6)
place(riser(C["lock"] - C["assemble"][0], 200, 3000, 0.4), C["assemble"][0], 0.3, send=0.3)
LK = C["lock"]
place(kick(0.6, 180, 50, 1.6, 3.0), LK, 0.7)
place(metal(392, 1.5, 0.5), LK, 0.4, send=0.6)
place(chord([D2, A2, D3, F3], 2.0, 2.0, 0.9), LK, 0.35, send=0.6)
place(whoosh(0.5, 800, 9000, 0.8), C["tagline"] - 0.15, 0.3)
# Typing ticks for the address.
u0, u1 = C["url"]
url_len = len("yoru-social.vercel.app")
for i in range(url_len):
    at = u0 + (i + 0.5) * (u1 - u0) / url_len
    place(hat(0.03, 0.006) * 1.6 + beep(3000, 0.03) * 0.2, at, 0.32, pan=-0.4 + 0.8 * i / url_len)
# Tail: low D pad that fades with the picture.
tail = tt(DUR - LK)
pad = filt(saw(D2, tail) + saw(D2 * 1.005, tail) + saw(A2, tail) * 0.6, "lowpass", 500) * 0.12
pad *= np.clip((tail) / 0.6, 0, 1)
place(pad, LK, 0.6, send=0.3)

# ------------------------------------------------------------------ master
# Stereo reverb: decaying noise impulse responses, decorrelated per side.
ir_t = tt(3.2)
irs = []
for ch in range(2):
    ir = rng.standard_normal(len(ir_t)) * np.exp(-ir_t / 0.75)
    ir = filt(ir, "lowpass", 6500)
    ir[: int(0.012 * SR)] = 0
    irs.append(ir / np.sqrt(np.sum(ir ** 2)))
wet = np.stack([signal.fftconvolve(verb[:, c], irs[c])[:N] for c in range(2)], axis=1)
mix = dry + wet * 0.55

t_all = np.arange(N) / SR
# True silence before the final impact (only the heartbeat survives).
gate = np.ones(N)
s0 = int(SIL0 * SR)
fade = int(0.025 * SR)
gate[s0 : s0 + fade] = np.linspace(1, 0, fade)
gate[s0 + fade : int(15.55 * SR)] = 0
mix *= gate[:, None]
# Re-add the heartbeat and inhale cleanly after gating.
hb = np.zeros((N, 2))
i = int(15.62 * SR)
b = sub_boom(0.6, 55, 38) * 0.4
hb[i : i + len(b)] += np.stack([b, b], axis=1)
mix[int(15.55 * SR) : int(IF * SR)] = 0
mix[int(15.55 * SR) : int(IF * SR)] += hb[int(15.55 * SR) : int(IF * SR)]
inh = (crash(0.38, 1200, 0.18) + metal(300, 0.38, 0.12) * 0.5)[::-1] * 0.55
j = int((IF - 0.38) * SR)
mix[j : j + len(inh)] += np.stack([inh, inh], axis=1)[: N - j]
# Fade out with the picture.
fo0, fo1 = C["fadeOut"]
mix *= np.clip(1 - (t_all - fo0) / (fo1 - fo0), 0, 1)[:, None] ** 1.5
# Gentle bus glue: soft clip, then normalize to -1 dBFS.
mix = filt(mix.T, "highpass", 22).T
# Section levels: the beat sits under the two big impacts so they hit harder.
lvl = np.interp(t_all, [0, 3.0, 3.6, 6.85, 7.2, 15.2, 16.0], [1, 1, 0.62, 0.62, 0.66, 0.72, 1.0])
mix *= lvl[:, None]
# Set the loudest transient near full scale, then a gentle soft clip.
mix *= 1.0 / np.max(np.abs(mix))
mix = np.tanh(mix * 1.6) / np.tanh(1.6)
mix *= 10 ** (-1 / 20) / np.max(np.abs(mix))

out = ROOT / "audio" / "yoru-trailer.wav"
pcm = (np.clip(mix, -1, 1) * 32767).astype("<i2")
with wave.open(str(out), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print("wrote", out, f"{N / SR:.2f}s")
