#!/usr/bin/env python3
"""Generate a short, copyright-free warm piano loop (WAV).

Slow, gentle, sparse — meant as quiet background ambience. Additive synthesis
of piano-like partials with ADSR envelopes and a simple feedback reverb.
Stdlib only; no external samples or dependencies.
"""
import math, struct, wave, os, random

SR = 22050
BPM = 60
BEAT = 60.0 / BPM
BARS = 4
BAR = BEAT * 4
DUR = BARS * BAR

random.seed(1337)


def midi_to_hz(m):
    return 440.0 * (2 ** ((m - 69) / 12.0))


def adsr(t, dur, a=0.01, d=0.25, s=0.30, r=1.2):
    r = min(r, dur * 0.6)
    if t < 0:
        return 0.0
    if t < a:
        return t / a
    if t < a + d:
        return 1.0 + (s - 1.0) * ((t - a) / d)
    if t < dur - r:
        return s
    rel = (dur - t) / r
    return max(0.0, s * rel)


def piano_note(buf, freq, when, dur, vel=0.30):
    start = int(when * SR)
    n = int(dur * SR) + int(SR * 0.2)
    for i in range(n):
        t = i / SR
        env = adsr(t, dur, a=0.008, d=0.25, s=0.26, r=min(dur * 0.55, 1.5))
        sig = (
            1.00 * math.sin(2 * math.pi * freq * t)
            + 0.50 * math.sin(2 * math.pi * freq * 2 * t)
            + 0.22 * math.sin(2 * math.pi * freq * 3.001 * t)
            + 0.12 * math.sin(2 * math.pi * freq * 4 * t)
            + 0.06 * math.sin(2 * math.pi * freq * 5.02 * t)
        )
        sig *= env * vel * 0.28
        idx = start + i
        if 0 <= idx < len(buf):
            buf[idx] += sig


def reverb(buf, delays=(0.23, 0.37, 0.53), decay=0.28):
    out = list(buf)
    for d in delays:
        ds = int(SR * d)
        d2 = ds // 2
        for i in range(ds, len(out)):
            out[i] += decay * buf[i - ds]
            if i - d2 >= 0:
                out[i] += decay * 0.55 * buf[i - d2]
    return out


def main(out_path):
    total = int(SR * (DUR + 3.0))
    buf = [0.0] * total

    chords = [
        ('Cm', [36, 48, 55, 60, 63, 67]),
        ('Ab', [44, 48, 51, 56, 60, 63]),
        ('Eb', [39, 51, 55, 58, 63, 67]),
        ('Bb', [46, 50, 53, 58, 62, 65]),
    ]
    melody_scale = [63, 65, 67, 70, 72, 75, 79, 82, 84, 87]

    time_pos = 0.0
    for b in range(BARS):
        chord = chords[(b // 2) % len(chords)][1]
        piano_note(buf, midi_to_hz(chord[0]), time_pos, BAR * 0.95, vel=0.42)
        for nt in chord[2:]:
            piano_note(buf, midi_to_hz(nt), time_pos + 0.02, BAR * 0.9, vel=0.13)
        beat_t = time_pos
        for _k in range(4):
            if random.random() < 0.65:
                n = random.choice([x for x in melody_scale if x >= 67])
                nd = BEAT * random.choice([0.5, 1.0, 1.5])
                piano_note(buf, midi_to_hz(n), beat_t, nd, vel=random.uniform(0.18, 0.32))
            if random.random() < 0.18:
                gn = random.choice(melody_scale)
                piano_note(buf, midi_to_hz(gn), beat_t + BEAT * 0.5, BEAT * 0.45, vel=0.16)
            beat_t += BEAT
        time_pos += BAR

    buf = reverb(buf)
    peak = max(abs(s) for s in buf) or 1.0
    gain = 0.72 / peak
    fade_in = int(SR * 2.5)
    fade_out = int(SR * 3.0)
    for i in range(len(buf)):
        fi = min(1.0, i / fade_in)
        fo = min(1.0, (len(buf) - 1 - i) / fade_out)
        buf[i] = max(-0.95, min(0.95, buf[i] * gain * fi * fo))

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
    print(f'wrote {out_path} ({sz/1024:.1f} KB, {DUR:.1f}s)')


if __name__ == '__main__':
    import sys
    main(sys.argv[1] if len(sys.argv) > 1 else '/tmp/warm_piano.wav')
