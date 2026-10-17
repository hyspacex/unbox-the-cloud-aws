"""Original 30 s score for the Keel reel. 128 BPM, 16 bars, D minor (Dm Bb F C).

    python3 -I demo/reel/music.py      -> demo/reel/build/music.wav and demo/reel/cues.js

Every hit the picture reacts to is written to cues.js, so the motion and the music share one clock.
Arrangement (bars are 0-based, one bar = 1.875 s):
    0-1   intro: filtered pad, clock ticks, sub swell
    2-3   build: four-on-the-floor kick, hats, arp, snare roll and riser, one-beat gap
    4-9   drop: full groove, sidechained bass, lead hook
    10-11 lift: octave arp, drums thin, stop on the last beat
    12-13 re-drop: full groove plus lead
    14    final build
    15    final impact and logo sting, tail to 30 s
"""
import json
import pathlib

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, fftconvolve, lfilter, sosfilt

HERE = pathlib.Path(__file__).resolve().parent
SR = 48000
BPM = 128
BEAT = 60 / BPM
BAR = BEAT * 4
DUR = 30.0
N = int(DUR * SR)
rng = np.random.default_rng(7)

L = np.zeros(N)
R = np.zeros(N)
verb_send = np.zeros((2, N))
side_kicks = []  # kick times that duck the pumping buses
cues: dict[str, list[float]] = {k: [] for k in
    ["kick", "clap", "hat", "tick", "impact", "whoosh", "snare", "lead", "stop", "riser", "arp"]}


def T(bar, beat=0.0, six=0.0):
    return (bar * 4 + beat + six / 4) * BEAT


def midi(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def place(sig, t0, gain=1.0, pan=0.0, verb=0.0, bus=None):
    """Mix a mono or stereo signal into the master at t0 seconds."""
    i0 = int(round(t0 * SR))
    if i0 >= N:
        return
    if sig.ndim == 1:
        sig = np.vstack([sig, sig])
    n = min(sig.shape[1], N - i0)
    if i0 < 0:
        sig = sig[:, -i0:]
        n = min(sig.shape[1], N)
        i0 = 0
    lg = np.cos((pan + 1) * np.pi / 4) * np.sqrt(2)
    rg = np.sin((pan + 1) * np.pi / 4) * np.sqrt(2)
    s = sig[:, :n] * gain
    tgt = bus if bus is not None else (L, R)
    tgt[0][i0:i0 + n] += s[0] * lg
    tgt[1][i0:i0 + n] += s[1] * rg
    if verb:
        verb_send[0, i0:i0 + n] += s[0] * lg * verb
        verb_send[1, i0:i0 + n] += s[1] * rg * verb


def env_exp(n, rate, attack=0.002):
    t = np.arange(n) / SR
    a = np.clip(t / attack, 0, 1) if attack > 0 else 1
    return a * np.exp(-t * rate)


def noise(n):
    return rng.standard_normal(n)


def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], "bandpass", fs=SR, output="sos"), x)


def hp(x, f, order=2):
    return sosfilt(butter(order, f, "highpass", fs=SR, output="sos"), x)


def lp(x, f, order=2):
    return sosfilt(butter(order, f, "lowpass", fs=SR, output="sos"), x)


def sweep_lp(x, f_of_t, block=256):
    """Lowpass with a cutoff that moves over time (f_of_t takes seconds from the start of x)."""
    out = np.zeros_like(x)
    zi = np.zeros(2)
    zi2 = np.zeros(2)
    for i in range(0, len(x), block):
        f = float(np.clip(f_of_t(i / SR), 30, SR * 0.45))
        b, a = butter(2, f, "lowpass", fs=SR)
        seg, zi = lfilter(b, a, x[i:i + block], zi=zi * 1.0)
        seg, zi2 = lfilter(b, a, seg, zi=zi2 * 1.0)
        out[i:i + block] = seg
    return out


def saw(f, n, phase=0.0):
    t = np.arange(n) / SR
    return 2 * ((f * t + phase) % 1) - 1


# ---------------------------------------------------------------- drums

def kick(t0, gain=1.0):
    n = int(0.55 * SR)
    t = np.arange(n) / SR
    f = 44 + 120 * np.exp(-t * 32) + 30 * np.exp(-t * 200)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t * 6.5) * np.clip(t / 0.001, 0, 1)
    click = hp(noise(n), 3000) * np.exp(-t * 400) * 0.35
    s = np.tanh(1.8 * (body + click)) * 0.95
    place(s, t0, gain)
    side_kicks.append(t0)
    cues["kick"].append(round(t0, 4))


def clap(t0, gain=0.5):
    n = int(0.4 * SR)
    t = np.arange(n) / SR
    e = np.zeros(n)
    for k, d in enumerate([0, 0.008, 0.017, 0.026]):
        i = int(d * SR)
        e[i:] += np.exp(-(t[: n - i]) * (110 if k < 3 else 16))
    s = bp(noise(n), 900, 4200) * e
    s += bp(noise(n), 180, 260) * np.exp(-t * 30) * 0.4  # body
    place(np.vstack([s, np.roll(s, 90)]), t0, gain, verb=0.35)
    cues["clap"].append(round(t0, 4))


def hat(t0, gain=0.18, open_=False, pan=0.0):
    n = int((0.32 if open_ else 0.06) * SR)
    s = hp(noise(n), 7500, 4) * env_exp(n, 11 if open_ else 70, 0.0005)
    place(s, t0, gain, pan=pan, verb=0.05)
    if not open_:
        cues["hat"].append(round(t0, 4))


def snare(t0, gain=0.4):
    n = int(0.22 * SR)
    t = np.arange(n) / SR
    tone = np.sin(2 * np.pi * (190 + 60 * np.exp(-t * 40)) * t) * np.exp(-t * 28)
    s = bp(noise(n), 1500, 7000) * np.exp(-t * 22) + tone * 0.5
    place(s, t0, gain, verb=0.25)
    cues["snare"].append(round(t0, 4))


def crash(t0, gain=0.35, reverse=False, length=2.2):
    n = int(length * SR)
    s = hp(noise(n), 4500, 2) * env_exp(n, 2.2, 0.001)
    s2 = hp(noise(n), 4500, 2) * env_exp(n, 2.2, 0.001)
    st = np.vstack([s, s2])
    if reverse:
        st = st[:, ::-1]
        place(st, t0 - length, gain, verb=0.4)
    else:
        place(st, t0, gain, verb=0.3)


def impact(t0, gain=1.0):
    n = int(2.8 * SR)
    t = np.arange(n) / SR
    f = 30 + 50 * np.exp(-t * 5)
    boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 1.4)
    thud = lp(noise(n), 400) * np.exp(-t * 9) * 1.6
    s = np.tanh(1.6 * (boom + thud))
    place(s, t0, gain, verb=0.25)
    crash(t0, 0.42)
    cues["impact"].append(round(t0, 4))


def whoosh(t_peak, length=0.7, gain=0.28, up=True):
    """Filtered noise swell that peaks at t_peak; used under picture transitions."""
    n = int(length * SR)
    x = noise(n)
    prog = np.linspace(0, 1, n)
    shape = np.sin(np.pi * prog ** (0.7 if up else 1.4)) ** 2
    lo, hi = (400, 9000) if up else (9000, 300)
    f0 = lambda s: lo * (hi / lo) ** (s / (length))
    y = sweep_lp(x, f0) * shape
    pan = np.linspace(-0.6, 0.6, n)
    st = np.vstack([y * np.cos((pan + 1) * np.pi / 4), y * np.sin((pan + 1) * np.pi / 4)]) * np.sqrt(2)
    place(st, t_peak - length * 0.6, gain, verb=0.3)
    cues["whoosh"].append(round(t_peak, 4))


def riser(t0, t1, gain=0.3):
    n = int((t1 - t0) * SR)
    prog = np.linspace(0, 1, n)
    x = sweep_lp(noise(n), lambda s: 300 * (12000 / 300) ** (s / (t1 - t0)))
    f = 180 * 2 ** (prog * 3)
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.25
    y = (x + tone) * prog ** 2
    place(y, t0, gain, verb=0.5)
    cues["riser"].append([round(t0, 4), round(t1, 4)])


def snare_roll(t0, t1, gain=0.32):
    """Accelerating roll: 8ths, then 16ths, then 32nds, rising in level."""
    t = t0
    while t < t1 - 1e-6:
        p = (t - t0) / (t1 - t0)
        step = BEAT / (2 if p < 0.5 else 4 if p < 0.8 else 8)
        snare(t, gain * (0.35 + 0.65 * p))
        t += step


def tick(t0, gain=0.16, f=2400, pan=0.0):
    n = int(0.08 * SR)
    t = np.arange(n) / SR
    s = (np.sin(2 * np.pi * f * t) + 0.5 * np.sin(2 * np.pi * f * 1.5 * t)) * np.exp(-t * 90)
    place(s, t0, gain, pan=pan, verb=0.25)
    cues["tick"].append(round(t0, 4))


# ---------------------------------------------------------------- harmony

PROG = [  # (bass root, pad voicing) for Dm Bb F C
    (38, [62, 65, 69, 74]),
    (34, [58, 62, 65, 70]),
    (41, [60, 65, 69, 72]),
    (36, [60, 64, 67, 72]),
]


def supersaw(m, n, voices=7, detune=0.14):
    f = midi(m)
    out = np.zeros((2, n))
    for v in range(voices):
        d = (v - (voices - 1) / 2) / ((voices - 1) / 2)
        fv = f * 2 ** (d * detune / 12)
        s = saw(fv, n, rng.random())
        ch = v % 2
        out[ch] += s * (1.0 if v != voices // 2 else 0.7)
        out[1 - ch] += s * 0.35
    return out / voices


pad_bus = (np.zeros(N), np.zeros(N))
bass_bus = (np.zeros(N), np.zeros(N))
arp_bus = (np.zeros(N), np.zeros(N))


def pad_chord(bar, chord, length_bars=1.0, gain=0.22):
    n = int(length_bars * BAR * SR) + int(0.4 * SR)
    st = np.zeros((2, n))
    for m in chord[:3]:
        st += supersaw(m, n)
    st += supersaw(chord[0] - 12, n) * 0.6
    a = np.clip(np.arange(n) / (0.04 * SR), 0, 1)
    rel_start = int(length_bars * BAR * SR)
    r = np.ones(n)
    r[rel_start:] = np.exp(-np.arange(n - rel_start) / SR * 10)
    st *= a * r
    place(st, T(bar), gain, bus=pad_bus, verb=0.25)


def bass_note(t0, m, length, gain=0.5):
    n = int(length * SR)
    t = np.arange(n) / SR
    f = midi(m)
    s = saw(f, n) * 0.6 + np.sin(2 * np.pi * f * t) * 0.9 + np.sin(2 * np.pi * f / 2 * t) * 0.6
    s = lp(s, 520)
    e = np.clip(t / 0.004, 0, 1) * np.clip((length - t) / 0.02, 0, 1)
    place(np.tanh(1.4 * s * e), t0, gain, bus=bass_bus)


def pluck(t0, m, gain=0.16, decay=9.0, cutoff=3800, pan=0.0, verb=0.25, bus=None):
    n = int(0.45 * SR)
    t = np.arange(n) / SR
    f = midi(m)
    s = saw(f, n) * 0.7 + np.sign(np.sin(2 * np.pi * f * 1.002 * t)) * 0.25
    s = lp(s, cutoff) * env_exp(n, decay, 0.001)
    place(s, t0, gain, pan=pan, verb=verb, bus=bus)


def bell(t0, m, gain=0.22, length=1.6, pan=0.0):
    """Two-operator FM bell: the lead hook and the logo sting."""
    n = int(length * SR)
    t = np.arange(n) / SR
    f = midi(m)
    idx = 2.6 * np.exp(-t * 6)
    s = np.sin(2 * np.pi * f * t + idx * np.sin(2 * np.pi * f * 2 * t))
    s += 0.3 * np.sin(2 * np.pi * f * 2 * t) * np.exp(-t * 5)
    s *= env_exp(n, 3.2, 0.002)
    place(np.vstack([s, np.roll(s, 240)]), t0, gain, pan=pan, verb=0.45)


# ---------------------------------------------------------------- arrangement

GROOVE = set(range(4, 10)) | {12, 13}

# Intro: clock ticks on every 8th, getting a little brighter, plus two soft tom-like "version" taps.
for bar in range(0, 2):
    for e in range(8):
        tick(T(bar, e / 2), 0.11 + 0.03 * (e % 2 == 0), f=2400 if e % 2 == 0 else 3200, pan=(-0.3 if e % 2 else 0.3))
for b in range(16):
    pad_chord(b, PROG[b % 4][1], gain=0.2 if b < 2 else 0.22)

# Pad filter: closed in the intro, opening through the build, wide open in the drops, dark again at the gaps.
def pad_cut(s):
    t = s
    if t < T(2):
        return 350 + 500 * (t / T(2))
    if t < T(4):
        return 850 + 2600 * ((t - T(2)) / (T(4) - T(2))) ** 2
    if t < T(10):
        return 5200
    if t < T(12):
        return 2600 + 2400 * ((t - T(10)) / (T(12) - T(10)))
    if t < T(14):
        return 6000
    if t < T(15):
        return 2000 + 6000 * ((t - T(14)) / BAR) ** 2
    return 7000 * np.exp(-(t - T(15)) * 1.2) + 600


# Sub swell under the intro.
n = int(T(2) * SR)
tt = np.arange(n) / SR
place(np.sin(2 * np.pi * midi(26) * tt) * (tt / T(2)) ** 2 * 0.35, 0)
crash(T(2), 0.18, reverse=True, length=1.6)

# Drums.
for bar in range(2, 15):
    for b in range(4):
        if bar == 3 and b == 3:
            continue  # gap before the drop
        if bar == 11 and b == 3:
            continue  # stop before the re-drop
        if bar == 14 and b >= 2:
            continue  # final build
        if bar in (10, 11) and b in (1, 3):
            kick(T(bar, b), 0.85)
        else:
            kick(T(bar, b), 1.0 if bar in GROOVE else 0.8)
    if bar in GROOVE or bar in (10, 11):
        for b in (1, 3):
            if not (bar == 11 and b == 3):
                clap(T(bar, b), 0.55)
    if bar >= 2:
        for s16 in range(16):
            if bar == 3 and s16 >= 12:
                continue
            if bar == 11 and s16 >= 12:
                continue
            if bar == 14 and s16 >= 8:
                continue
            if s16 % 4 == 2:
                hat(T(bar, 0, s16), 0.2, open_=True, pan=0.1)
            elif bar in GROOVE or s16 % 2 == 0:
                hat(T(bar, 0, s16), 0.11 if s16 % 2 else 0.15, pan=-0.25 if s16 % 2 else 0.25)

# Builds, gaps and impacts.
riser(T(2), T(3, 3), 0.32)
snare_roll(T(3), T(3, 3), 0.34)
crash(T(4), 0.25, reverse=True, length=1.2)
impact(T(4), 1.0)
cues["stop"].append(round(T(3, 3), 4))

for b in (9,):
    for s16 in range(12, 16):
        snare(T(b, 0, s16), 0.22 + 0.06 * (s16 - 12))
riser(T(10), T(11, 3), 0.22)
crash(T(12), 0.3, reverse=True, length=1.0)
impact(T(12), 0.85)
cues["stop"].append(round(T(11, 3), 4))

riser(T(14), T(14, 3.5), 0.36)
snare_roll(T(14), T(14, 3.5), 0.36)
crash(T(15), 0.3, reverse=True, length=1.3)
impact(T(15), 1.15)
cues["stop"].append(round(T(14, 3.5), 4))
crash(T(6), 0.2); crash(T(8), 0.22); crash(T(10), 0.2)

# Transitions under picture cuts.
for t_cut in [T(2), T(6), T(8), T(10), T(14)]:
    whoosh(t_cut, 0.8, 0.22)

# Bass: offbeat pumping 8ths plus a ducked sub on the root.
for bar in range(2, 15):
    root = PROG[bar % 4][0]
    if bar in (2, 3):
        if bar == 3:
            for b in range(3):
                bass_note(T(bar, b + 0.5), root + 12, BEAT * 0.45, 0.35)
        continue
    for b in range(4):
        if bar == 11 and b == 3:
            continue
        if bar == 14 and b >= 2:
            continue
        bass_note(T(bar, b + 0.5), root + 12, BEAT * 0.48, 0.5)
        if bar in GROOVE:
            bass_note(T(bar, b + 0.75), root + 12, BEAT * 0.22, 0.3)
    n = int(BAR * SR)
    tt = np.arange(n) / SR
    place(np.sin(2 * np.pi * midi(root) * tt) * 0.28, T(bar), 1.0, bus=bass_bus)

# Arp: 16ths up the chord over two octaves, ping-pong panned.
ARP_SHAPE = [0, 1, 2, 3, 2, 1, 0, 2, 1, 3, 2, 0, 3, 1, 2, 3]
for bar in range(2, 15):
    chord = PROG[bar % 4][1]
    octave = 12 if bar in (10, 11, 13) else 0
    for s16 in range(16):
        if bar == 3 and s16 >= 12:
            continue
        if bar == 11 and s16 >= 12:
            continue
        if bar == 14 and s16 >= 8:
            continue
        m = chord[ARP_SHAPE[s16]] + octave + (12 if s16 >= 8 and bar in GROOVE else 0)
        g = 0.07 if bar in (2, 3) else 0.1
        cut = 1400 if bar == 2 else 2600 if bar == 3 else 4200
        pluck(T(bar, 0, s16), m, g, decay=12, cutoff=cut, pan=0.45 if s16 % 2 else -0.45, verb=0.2, bus=arp_bus)
        cues["arp"].append(round(T(bar, 0, s16), 4))

# Lead hook (FM bell), on the drop and the re-drop.
HOOK = [
    [(0, 69), (3, 74), (6, 72), (8, 69), (11, 67), (13, 69)],
    [(0, 65), (3, 67), (6, 69), (10, 74), (12, 72)],
    [(0, 72), (3, 69), (6, 65), (8, 69), (11, 72), (13, 74)],
    [(0, 76), (3, 74), (6, 72), (10, 67)],
]
for bar in list(range(4, 8)) + [12, 13]:
    for s16, m in HOOK[bar % 4]:
        bell(T(bar, 0, s16), m + 12, 0.15, 1.0, pan=0.15)
        cues["lead"].append(round(T(bar, 0, s16), 4))

# Final chord and logo sting.
for m in [50, 62, 65, 69, 74, 77]:
    pluck(T(15), m, 0.12, decay=1.6, cutoff=5000, verb=0.6)
bell(T(15), 86, 0.24, 2.6)
bell(T(15, 1.5), 81, 0.12, 2.2, pan=-0.3)
n = int(1.875 * SR)
tt = np.arange(n) / SR
place(np.sin(2 * np.pi * midi(26) * tt) * np.exp(-tt * 1.2) * 0.45, T(15))

# ---------------------------------------------------------------- buses and mix

ts = np.arange(N) / SR
duck = np.ones(N)
for tk in side_kicks:
    i0 = int(tk * SR)
    k = np.arange(N - i0) / SR
    k = k[: int(0.45 * SR)]
    shape = 1 - 0.85 * np.exp(-k / 0.11)
    duck[i0:i0 + len(k)] = np.minimum(duck[i0:i0 + len(k)], shape)

pad_l = sweep_lp(pad_bus[0], pad_cut, block=512)
pad_r = sweep_lp(pad_bus[1], pad_cut, block=512)
L += pad_l * duck
R += pad_r * duck
L += bass_bus[0] * duck
R += bass_bus[1] * duck
duck_arp = 0.55 + 0.45 * duck

# Ping-pong delay on the arp, 3/16.
d = int(BEAT * 0.75 * SR)
al, ar = arp_bus[0].copy(), arp_bus[1].copy()
dl, dr = np.zeros(N), np.zeros(N)
for k in range(1, 5):
    g = 0.38 ** k
    src = ar if k % 2 else al
    tgt = dl if k % 2 else dr
    tgt[d * k:] += src[: N - d * k] * g
L += (al + lp(dl, 3000)) * duck_arp
R += (ar + lp(dr, 3000)) * duck_arp
verb_send[0] += (al * 0.2)
verb_send[1] += (ar * 0.2)

# Plate-ish reverb: decaying filtered noise, decorrelated per side.
ir_n = int(2.4 * SR)
irt = np.arange(ir_n) / SR
ir_l = lp(noise(ir_n), 6000) * np.exp(-irt / 0.55)
ir_r = lp(noise(ir_n), 6000) * np.exp(-irt / 0.55)
ir_l /= np.sqrt(np.sum(ir_l ** 2))
ir_r /= np.sqrt(np.sum(ir_r ** 2))
wet_l = fftconvolve(hp(verb_send[0], 250), ir_l)[:N]
wet_r = fftconvolve(hp(verb_send[1], 250), ir_r)[:N]
L += wet_l * 0.55
R += wet_r * 0.55

# Master: clean low end, glue, soft clip, fade the last half second.
L = hp(L, 28)
R = hp(R, 28)
mix = np.vstack([L, R])
mix /= np.max(np.abs(mix)) + 1e-9
mix = np.tanh(mix * 1.5) / np.tanh(1.5)
fade = np.ones(N)
fn = int(0.6 * SR)
fade[-fn:] = np.linspace(1, 0, fn) ** 2
mix *= fade
mix *= 10 ** (-1 / 20) / np.max(np.abs(mix))

out = HERE / "build"
out.mkdir(exist_ok=True)
wavfile.write(out / "music.wav", SR, mix.T.astype(np.float32))

# The picture reads these. Bars and beats are exported too, so the HTML never re-derives the tempo.
cues["bpm"] = BPM
cues["beat"] = BEAT
cues["bar"] = BAR
for k in ("kick", "clap", "hat", "tick", "snare", "lead", "arp"):
    cues[k] = sorted(set(cues[k]))
(HERE / "cues.js").write_text("window.CUES = " + json.dumps(cues) + ";\n")
print(out / "music.wav", {k: len(v) if isinstance(v, list) else v for k, v in cues.items()})
