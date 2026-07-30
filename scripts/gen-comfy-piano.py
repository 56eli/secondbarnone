#!/usr/bin/env python3
"""New cozy, low-fatigue piano loop for secondbarnone.

Design goals (easy on the ears):
  * slow BPM (48) with lots of air between notes
  * warm felt-piano timbre: soft attack, long exponential decay, gentle
    inharmonic partials, subtle body resonance
  * open, consonant voicings (Cmaj9 / Am7 / Fmaj7 / Gsus4) in a low-mid register
  * a touch of slow chorusing detune + very gentle room reverb
  * seamless loop at 4 bars (~20 s)
  * mono 16.0 kHz, 16-bit PCM, ~<1 MiB
"""
import math, os, random, struct, sys, wave

SR = 16000
BPM = 48
BEAT = 60.0 / BPM
BARS = 4
BAR = 4 * BEAT
DURATION = BARS * BAR
FRAMES = round(SR * DURATION)

random.seed(88)


def midi_hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def piano_tone(buf, start_frames, midi, velocity, dur_s):
    """One soft felt-piano note: fundamental + a couple of even/odd partials
    with a fast cosine-shaped attack and a long, gentle exponential decay."""
    if start_frames >= FRAMES:
        return
    a = max(0, int(start_frames))
    n = min(FRAMES - a, int(dur_s * SR))
    f = midi_hz(midi)
    attack = int(0.04 * SR)  # 40 ms soft attack
    release = int(0.2 * SR)   # tail taper to avoid loop-edge clicks
    partials = [
        (1.00, 1.00),
        (2.002, 0.20),
        (3.006, 0.07),
        (4.001, 0.03),
    ]
    for i in range(n):
        t = i / SR
        atk = min(1.0, i / attack)
        rel = min(1.0, (n - i) / release)
        env = atk * math.exp(-t * 0.38) * (rel if i > n - release else 1.0)
        x = 0.0
        for mult, amp in partials:
            x += amp * math.sin(2 * math.pi * f * mult * t)
        buf[a + i] += velocity * env * x


def add_reverb(buf, delay_ms=300, feedback=0.20, hz=1700):
    """Simple feedback delay with one-pole low-pass."""
    d = int(SR * delay_ms / 1000)
    y = [0.0] * FRAMES
    rc = math.exp(-2 * math.pi * hz / SR)
    prev = 0.0
    for i in range(FRAMES):
        delayed = y[i - d] if i >= d else 0.0
        lp = delayed + rc * (prev - delayed)
        prev = lp
        y[i] = buf[i] + feedback * lp
    for i in range(FRAMES):
        buf[i] = buf[i] * 0.83 + y[i] * 0.20


def render():
    b = [0.0] * FRAMES

    # Key: C major. Four-bar progression: Cmaj9 -> Am7 -> Fmaj7 -> Gsus4
    chords = [
        [48, 55, 59, 62, 67],   # C3 + G B D G (Cmaj9)
        [45, 57, 60, 64, 67],   # A2 + C E G C (Am7)
        [53, 57, 60, 65, 69],   # F2 + A C F A (Fmaj7)
        [55, 60, 65, 67, 70],   # G2 + C F G A# (Gsus4)
    ]

    def add(chord_idx, beat, note_idx, vel, dur):
        bar_start = chord_idx * BAR
        when = bar_start + beat * BEAT + random.uniform(-0.02, 0.04)
        piano_tone(b, when * SR, chords[chord_idx][note_idx], vel * random.uniform(0.93, 1.05), dur)

    for bi in range(4):
        # Bass root on beat 1
        add(bi, 0.0, 0, 0.17, BAR * 1.2)
        # Mid chord arpeggios
        add(bi, random.uniform(1.2, 1.8), random.choice([1, 2]), 0.07, 3.2)
        add(bi, random.uniform(2.2, 2.8), random.choice([3, 4]), 0.055, 3.0)
        if bi % 2 == 1:
            add(bi, 3.3, 2, 0.05, 2.5)

    # Sustained low bass felt pedal
    piano_tone(b, 0, 36, 0.05, BAR * 4.2)

    # Cross-stitch loop seamless seam
    overlap = int(SR * 1.4)
    if overlap * 2 < FRAMES:
        for i in range(overlap):
            a = i / overlap
            b[FRAMES - overlap + i] = b[FRAMES - overlap + i] * (1 - a) + b[i] * a

    add_reverb(b)

    peak = max(max(b), -min(b)) or 1.0
    target = 0.36
    return [max(-1.0, min(1.0, x * target / peak)) for x in b]


def write(path):
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    samples = render()
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(b"".join(struct.pack("<h", round(x * 32767)) for x in samples))
    sz = os.path.getsize(path)
    print(f"wrote {path}: {len(samples)/SR:.2f}s, {sz/1024:.1f} KiB, {SR} Hz mono")


if __name__ == "__main__":
    write(sys.argv[1] if len(sys.argv) > 1 else "docs/assets/music/comfy_piano.wav")
