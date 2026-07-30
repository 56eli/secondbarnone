#!/usr/bin/env python3
"""Generate the copyright-free warm pad loop shipped as hearth_pad.wav.

Design brief: calmer and warmer than the old piano, equally slow. No
percussive attacks at all — a breathing analog-style pad built from
detuned sines with long overlapping attacks and releases, a soft sub
root, one faint bell glimmer per bar, and a gentle one-pole low-pass
for warmth. Five bars of Am9 / Fmaj7 / Cmaj7 / G6 at 56 BPM.

The loop is rendered tail-first (releases fold back into bar one) and the
reverb reads through a circular buffer, so the start and end meet
seamlessly — no fade-in swell every loop like the piano had.

Stdlib only; no external samples or dependencies.
"""
import math, os, random, struct, wave

SR = 22050
BPM = 56
BEAT = 60.0 / BPM
BAR = BEAT * 4
BARS = 5
DUR = BARS * BAR  # ~21.4 s, keeps the 1 MiB lazy-audio budget
N = int(SR * DUR)

random.seed(20260730)


def midi_to_hz(m):
    return 440.0 * (2 ** ((m - 69) / 12.0))


def _env(t, dur, attack, release):
    """Raised-cosine attack/release for a soft, click-free pad voice."""
    if t < 0 or t > dur:
        return 0.0
    a = min(1.0, t / attack) if attack > 0 else 1.0
    r = min(1.0, (dur - t) / release) if release > 0 else 1.0
    shape = min(a, r)
    return 0.5 - 0.5 * math.cos(math.pi * shape)


def pad_voice(buf, freq, when, dur, vel):
    """A warm pad note: sine + gentle octave + a detuned twin for width."""
    for part_freq, part_amp in ((freq, 1.0), (freq * 2.0, 0.28), (freq * 1.0009, 0.55)):
        start = int(when * SR)
        n = int(dur * SR)
        for i in range(n):
            t = i / SR
            sig = math.sin(2 * math.pi * part_freq * t + random.uniform(0, 0.02))
            sig *= _env(t, dur, 1.4, 2.6) * vel * part_amp
            buf[(start + i) % N] += sig


def bell(buf, freq, when, vel=0.06):
    """One faint glimmer — sine with a near-instant attack and a long decay."""
    start = int(when * SR)
    n = int(3.2 * SR)
    for i in range(n):
        t = i / SR
        sig = math.sin(2 * math.pi * freq * t) * math.exp(-t / 0.9) * vel
        buf[(start + i) % N] += sig


# Voices keep clear of each other: root + a low-mid cluster + one high tone.
CHORDS = [
    ('Am9', [45, 52, 59, 60, 67]),  # A2  E3  B3  C4  G4
    ('Am9', [45, 52, 59, 60, 67]),
    ('Fmaj7', [41, 48, 57, 59, 64]),  # F2  C3  A3  B3  E4
    ('Cmaj7', [43, 48, 55, 59, 64]),  # G2  C3  G3  B3  E4
    ('G6', [43, 50, 59, 62, 67]),  # G2  D3  B3  D4  G4
]


def reverb_wrap(buf, delays=(0.19, 0.31, 0.47), decay=0.30):
    """Feedback comb over a circular buffer, so the reverb tail of the last
    bar lands inside the first — a seamless loop, not a fade-out."""
    out = list(buf)
    n = len(buf)
    for d in delays:
        ds = int(SR * d)
        for i in range(n):
            out[i] += decay * buf[(i - ds) % n]
            half = (i - ds // 2) % n
            out[i] += decay * 0.55 * buf[half]
    return out


def main(out_path):
    buf = [0.0] * N

    time_pos = 0.0
    for b in range(BARS):
        chord = CHORDS[b][1]
        # Sub root: pure sine an octave down, slowest attack of all.
        pad_voice(buf, midi_to_hz(chord[0] - 12), time_pos, BAR * 1.12, vel=0.20)
        # Pad body: overlapping releases blur the barlines.
        for nt in chord[1:]:
            pad_voice(buf, midi_to_hz(nt), time_pos, BAR * 1.10, vel=0.118)
        # One faint bell per bar, on a chord tone, somewhere around beat three.
        bell(buf, midi_to_hz(random.choice(chord[2:]) + 12), time_pos + BAR * random.uniform(0.5, 0.75))
        time_pos += BAR

    # Slow breathing so the pad never sits perfectly still.
    for i in range(N):
        t = i / SR
        buf[i] *= 1.0 + 0.05 * math.sin(2 * math.pi * 0.055 * t)

    # One-pole low-pass — this is most of the "warm".
    alpha = 1.0 - math.exp(-2.0 * math.pi * 2100.0 / SR)
    y = 0.0
    for i in range(N):
        y += alpha * (buf[i] - y)
        buf[i] = y

    buf = reverb_wrap(buf)

    peak = max(abs(s) for s in buf) or 1.0
    gain = 0.66 / peak
    for i in range(N):
        buf[i] = max(-0.95, min(0.95, buf[i] * gain))

    os.makedirs(os.path.dirname(out_path) or '.', exist_ok=True)
    with wave.open(out_path, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        frames = bytearray()
        for s in buf:
            frames += struct.pack('<h', int(s * 32767))
        w.writeframes(bytes(frames))
    sz = os.path.getsize(out_path)
    print(f'wrote {out_path} ({sz / 1024:.1f} KB, {DUR:.1f}s)')
    assert sz < 1024 * 1024, 'must stay under the 1 MiB lazy-audio budget'


if __name__ == '__main__':
    import sys

    main(sys.argv[1] if len(sys.argv) > 1 else 'docs/assets/music/hearth_pad.wav')
