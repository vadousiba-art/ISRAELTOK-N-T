"""Original score and sound design for YORU film 03 — YOUR WORLD. YOUR RULES.

All sound is synthesized here (oscillators, filtered noise, distortion,
convolution reverb) and placed on cues.json, the timeline the picture uses.
Dark electronic / industrial / Japanese electronic-rock at 120 BPM in D, with
interface foley (taps, typing, the colour slider) on the real UI events.
The film opens and ends on silence, so the loop seam is clean.

Output: film/audio/your-world.wav, 48 kHz stereo, 16-bit.
"""

import json
import pathlib
import wave

import numpy as np
from scipy import signal

FILM = pathlib.Path(__file__).resolve().parent.parent
ROOT = FILM.parent
C = json.loads((FILM / "cues.json").read_text())
SR = 48000
DUR = C["duration"]
N = int(round(DUR * SR))
TAIL = 5 * SR
BEAT = 60.0 / C["bpm"]
FPS = C["fps"]
rng = np.random.default_rng(303)

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



def tick(gain=1.0, f=5200):
    t = tt(0.03)
    return filt(noise(0.03), "bandpass", [f * 0.7, f * 1.4]) * env(t, 0.0002, 0.004) * 0.6 * gain


def key_click():
    t = tt(0.05)
    return (filt(noise(0.05), "bandpass", [1800, 6000]) * env(t, 0.0002, 0.006) + np.sin(2 * np.pi * 180 * t) * env(t, 0.001, 0.01) * 0.3) * 0.5


def ui_tap():
    t = tt(0.12)
    return np.sin(2 * np.pi * (900 + 600 * np.exp(-t * 60)) * t) * env(t, 0.001, 0.03) * 0.5


def glitch(dur=0.2, grain=0.016, pitch=None):
    """Stuttered, bit-crushed grain."""
    f = pitch or rng.uniform(300, 1600)
    g = filt(noise(grain), "bandpass", [500, 6000]) * 0.7 + np.sin(2 * np.pi * f * tt(grain))
    reps = max(1, int(dur / grain))
    out = np.concatenate([g * (0.55 + 0.45 * (k % 2)) for k in range(reps)])
    q = 2 ** 4
    out = np.round(out * q) / q
    return np.repeat(out[::6], 6)[: len(out)] * 0.5


def shimmer(dur=1.0, base=1174.7):
    t = tt(dur)
    s = sum(np.sin(2 * np.pi * base * r * t + rng.uniform(0, 6)) * np.exp(-t / (0.5 / r)) for r in [1, 1.5, 2, 3])
    return s * np.minimum(1, t / 0.01) * 0.12


D = {n: note(n) for n in ["D1", "D2", "D3", "D4", "D5", "A1", "A2", "F2", "G2", "C2", "A#1", "D#2", "D#5", "A5", "F4", "A4", "C5"]}

# ------------------------------------------------------------------ 01 the question
place(pulse(), 0.12, 0.45, send=0.4)
o0, o1 = C["outline"]
t = tt(o1 - o0)
place(filt(noise(o1 - o0), "bandpass", [3000, 9000]) * np.sin(np.pi * t / (o1 - o0)) * 0.12, o0, 0.8)
for i, q in enumerate(C["q"]):
    place(tick(1.0, 3000 + 500 * i), q, 0.5)
    place(sub(0.5, 70, 45, 0.3), q, 0.35)
    place(bassg(D["D1"], 0.25), q, 0.3)
place(snare(0.4, 220, 0.12, 1.4), 1.8, 0.55, send=0.3)
place(kick(0.5, 200, 42, 2.8), 1.8, 0.6)
place(riser(0.5, 200, 4000, 0.6), 1.5, 0.4)
I1 = C["impact1"]
big_hit(I1, 1.0, "D2")
place(debris(0.6, 70), I1 + 0.02, 0.6)
place(glass(0.9, 40), I1 + 0.03, 0.45, send=0.4)
r0, r1 = C["inkReveal"]
place(ink_splat(0.5), r0 - 0.2, 0.7)
place((crash(0.5, 1500, 0.2)[::-1]) * 0.8, r1 - 0.5, 0.5)

# ------------------------------------------------------------------ groove (3.0–20.0)
def groove(t0, t1, level=1.0, snare_on=True, guitar=False, hats=2):
    bt = t0
    i = 0
    while bt < t1 - 1e-6:
        place(kick(0.45), bt, 0.8 * level)
        if snare_on and i % 2 == 1:
            place(snare(0.3), bt, 0.55 * level, send=0.2)
        for h in range(hats):
            place(hat(), bt + h * BEAT / hats, (0.3 if h % 2 else 0.18) * level, pan=0.3)
        root = ["D", "D", "A#", "C"][(i // 4) % 4]
        place(bassg(note(root + "1"), BEAT * 0.45), bt, 0.5 * level)
        place(bassg(note(root + "1"), BEAT * 0.45), bt + BEAT / 2, 0.38 * level)
        if guitar:
            place(power(root + "2", BEAT / 2 * 0.9, palm=True), bt, 0.32 * level)
            place(power(root + "2", BEAT / 2 * 0.9, palm=True), bt + BEAT / 2, 0.26 * level)
        bt += BEAT
        i += 1


groove(C["s2"], C["looks"][0] - 0.15, 0.7, snare_on=False, hats=2)
groove(C["looks"][0], C["makeIt"][0], 1.0, guitar=True, hats=4)
groove(C["s4"], C["crimsonImpact"], 0.75, hats=2)
groove(C["s5"], C["s6"] - 0.5, 1.0, guitar=True, hats=4)

# ------------------------------------------------------------------ 02 your profile: real interface foley
tB, tD, tA, tS, tBi, tF, tJ, tAf = C["edit"]
for at in [tD - 0.05, tA - 0.06, tF - 0.04, tAf - 0.06]:
    place(ui_tap(), at, 0.5, pan=0.1)
place(swish(0.18, 600, 2400), tD, 0.25)
for i in range(11):
    place(key_click(), tS + i * 0.085, 0.4, pan=rng.uniform(-0.15, 0.15))
for i in range(9):
    place(key_click(), tBi + i * 0.085, 0.4, pan=rng.uniform(-0.15, 0.15))
for at in [tJ, tJ + 0.15]:
    place(blip(1568, 0.06), at, 0.15)
place(shimmer(1.2, D["D5"]), tAf, 0.5, send=0.5)
place(kick(0.5, 180, 44, 2.6), C["titleProfile"][0], 0.5)
place(metal(300, 0.6, 0.15), C["titleProfile"][0], 0.25, send=0.3)
pc = C["panelCut"]
place(paper_tear(0.12), pc - 0.02, 0.6)
place(power("D3", 0.35), pc, 0.45)
place(kick(0.5, 200, 40, 3.0), pc, 0.7)

# ------------------------------------------------------------------ 03 the four looks, each with its own signature
L0, L1, L2, L3 = C["looks"]
place(ink_splat(0.5), L0 - 0.15, 0.7)
big_hit(L0, 0.7, "D2", 0.5)
place(taiko(1.0), L0, 0.6, send=0.3)
place(shing(1.6), L1 - 0.03, 0.5, pan=-0.3, send=0.4)
place(swish(0.12, 1500, 9000, 0.6), L1 - 0.06, 0.5)
place(power("D3", 0.9), L1, 0.55, send=0.2)
place(kick(0.6, 200, 40, 3.0), L1, 0.8)
place(swish(0.14, 3000, 800), L2 - 0.1, 0.35, pan=0.5)
for k, n_ in enumerate(["D5", "A4", "F4"]):
    place(bell(note(n_), 1.4), L2 + k * 0.05, 0.16, pan=(k - 1) * 0.4, send=0.6)
place(kick(0.4, 160, 48, 2.0), L2, 0.5)
place(glitch(0.18, 0.012), L3 - 0.05, 0.45)
place(crash(1.2, 3500, 0.4), L3, 0.45, send=0.3)
place(lead([D["D5"], D["A5"], D["D5"]], 0.4, 0.0), L3 + 0.05, 0.4, pan=0.3)
place(kick(0.6, 210, 38, 3.2), L3, 0.85)
M0, M1 = C["makeIt"]
for k in range(4):
    place(kick(0.35, 190, 44, 2.8), M0 + k * BEAT / 4, 0.7)
    place(paper_tear(0.06), M0 + k * BEAT / 4, 0.4, pan=(-1) ** k * 0.5)
big_hit(M0 + 0.5, 0.85, "D2", 0.6)
place(lead([D["D4"], D["D5"]], 0.4), M0 + 0.5, 0.35, send=0.3)

# ------------------------------------------------------------------ 04 watch it come to life
s0, s1 = C["slider"]
t = tt(s1 - s0)
f = 900 * (2.2 ** (t / (s1 - s0)))
sweep_tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.08 + filt(noise(s1 - s0), "bandpass", [2000, 7000]) * 0.03
place(sweep_tone * np.minimum(1, t / 0.05), s0, 0.6, pan=0.2)
for i in range(20):
    place(tick(0.35, 6000), s0 + i * (s1 - s0) / 20, 0.25)
RA = C["recolorAfter"]
place(swish(0.3, 500, 7000), RA - 0.05, 0.4)
place(shimmer(1.4, note("A5")), RA, 0.45, send=0.6)
place(kick(0.5), RA, 0.5)
place(ui_tap(), C["themeBefore"] + 0.32, 0.4)
place(swish(0.3, 7000, 900), C["themeAfter"] - 0.04, 0.35)
place(shimmer(1.2, D["D5"]), C["themeAfter"], 0.35, send=0.6)
place(kick(0.5, 190, 42, 2.6), C["titleSpace"][0], 0.45)
place(kick(0.5, 190, 42, 2.6), C["titleRules"][0], 0.55)
place(power("D3", 0.4), C["titleRules"][0], 0.35)
CI = C["crimsonImpact"]
big_hit(CI, 0.95, "D2", 0.6)
place(riser(C["s5"] - CI, 300, 6000, 0.8), CI, 0.4)

# ------------------------------------------------------------------ 05 one community
S5 = C["s5"]
for i, d in enumerate([0.0, 0.12, 0.24, 0.36]):
    place(swish(0.5, 400, 3000), S5 + d, 0.3, pan=(i - 1.5) * 0.5)
    place(kick(0.3, 150, 50, 2.0), S5 + d + 0.55, 0.45, pan=(i - 1.5) * 0.4)
place(kick(0.6, 200, 40, 3.0), C["vibes"], 0.6)
place(power("A#2", 0.9), C["vibes"], 0.45, send=0.2)
place(kick(0.6, 200, 40, 3.0), C["oneYoru"], 0.7)
place(power("D3", 1.2), C["oneYoru"], 0.5, send=0.2)
place(lead([D["D5"], D["F4"] * 2, D["A5"]], 0.6), C["oneYoru"] + 0.05, 0.3, send=0.4)
S6 = C["s6"]
at = S6 - 1.0
gap = BEAT / 2
while at < S6 - 0.02:
    place(snare(0.2, 220, 0.07), at, 0.3 + 0.4 * (at - (S6 - 1.0)))
    at += gap
    gap = max(BEAT / 8, gap * 0.8)
place(riser(1.0, 150, 5000, 0.6), S6 - 1.0, 0.45)

# ------------------------------------------------------------------ 06 final reveal
c0, c1 = C["converge"]
place(swish(c1 - c0, 300, 4000, 0.6), c0, 0.5)
place(kick(0.8, 220, 36, 3.2), S6, 0.9)
place(sub(1.4, 60, 30), S6, 0.6)
m0, m1 = C["mangaPanels"]
place(paper_tear(m1 - m0), m0, 0.5)
k0, k1 = C["collapse"]
place((crash(k1 - k0 + 0.2, 1500, 0.3)[: int((k1 - k0) * SR)])[::-1] * 1.2, k0, 0.7)
place(sweep(noise(k1 - k0), 300, 5000, q=0.4, curve=2.0) * np.linspace(0, 1, int((k1 - k0) * SR)) ** 3, k0, 0.5)
LG0, LG1 = C["logo"]
t = tt(3.2)
thoom = np.tanh(np.sin(2 * np.pi * (44 + 20 * np.exp(-t * 6)) * t) * env(t, 0.012, 1.1) * 1.5) * 0.8 + np.sin(2 * np.pi * 88 * t) * env(t, 0.01, 0.6) * 0.2
place(thoom, LG0, 0.8)
# The line opens from the centre: a shimmer that spreads outward in stereo.
t = tt(LG1 - LG0)
sh = filt(noise(LG1 - LG0), "bandpass", [5000, 11000]) * 0.22
spread = np.linspace(0, 0.9, len(t))
place(np.stack([sh * (1 + spread) / 2, sh * (1 + spread) / 2], axis=1) * np.sin(np.pi * t / (LG1 - LG0))[:, None], LG0, 0.7, send=0.4)
# Sonic logo: D – E♭ – A, the in-sen half-step that runs through the YORU films.
for k, n_ in enumerate(["D5", "D#5", "A5"]):
    place(bell(note(n_), 2.6), LG0 + 0.1 + k * 0.12, 0.32, pan=(k - 1) * 0.45, send=0.7)
place(power("D2", 2.0, gain=0.8), LG0, 0.35, send=0.3)
place(pad([note("D3"), note("A3"), note("C4"), note("F4")], C["fadeOut"][1] - C["tagline"][0], 1400), C["tagline"][0], 0.2, send=0.4)
place(blip(2349, 0.06), C["tagline"][0], 0.1, send=0.5)

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
out = (dry + wet * 0.45)[:N].copy()
out = filt(out, "highpass", 25)
out *= 1.0 / np.max(np.abs(out))
out = np.tanh(out * 1.8) / np.tanh(1.8)
out *= 10 ** (-3.0 / 20) / np.max(np.abs(out))


def gate(x, a, b, fade=0.004):
    i = int(a * SR)
    j = int(b * SR)
    fl = int(fade * SR)
    x[i : i + fl] *= np.linspace(1, 0, fl)[:, None]
    x[i + fl : j] = 0


gate(out, *C["silence"])
# Fade with the picture and end on silence for a clean loop.
f0, f1 = C["fadeOut"]
tl = np.arange(N) / SR
out *= np.clip(1 - (tl - f0) / (f1 - f0), 0, 1)[:, None] ** 1.5
out[: int(0.1 * SR)] *= np.linspace(0, 1, int(0.1 * SR))[:, None]

path = ROOT / "film" / "audio" / "your-world.wav"
pcm = (np.clip(out, -1, 1) * 32767).astype("<i2")
with wave.open(str(path), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print("wrote", path, f"{N / SR:.2f}s")
