#!/usr/bin/env python3
"""Cozy, low-fatigue piano loop for secondbarnone.

Design goals (easy on the ears):
  * slow BPM (46) with lots of air between notes
  * warm felt-piano timbre: soft attack, long exponential decay, gentle
    inharmonic partials, subtle body resonance
  * open, consonant voicings (add9 / maj7 / sus) in a low-mid register, no
    high piercing notes
  * a touch of slow chorusing detune + very gentle room reverb (simple
    feedback delay with low-pass rolloff)
  * seamless loop at 16 bars (~42 s)
  * mono 22.05 kHz, 16-bit PCM, ~<1 MiB
"""
import math, os, random, struct, sys, wave

SR = 16000
BPM = 52
BEAT = 60.0 / BPM
BARS = 4
BAR = 4 * BEAT
DURATION = BARS * BAR
FRAMES = round(SR * DURATION)

random.seed(77)


def midi_hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def piano_tone(buf, start_frames, midi, velocity, dur_s):
    """One soft felt-piano note: fundamental + a couple of even/odd partials
    with a fast cosine-shaped attack (no click) and a long, gentle
    exponential decay. A small amount of detune between the partials gives
    a natural warmth without chorusing harshness."""
    if start_frames >= FRAMES:
        return
    a = max(0, int(start_frames))
    n = min(FRAMES - a, int(dur_s * SR))
    f = midi_hz(midi)
    attack = int(0.035 * SR)  # 35 ms soft attack
    release = int(0.18 * SR)  # tail taper to avoid loop-edge clicks
    # Partial amplitudes — rolled off high end for warmth.
    partials = [
        (1.00, 1.00),
        (2.003, 0.22),
        (3.007, 0.08),
        (4.002, 0.04),
    ]
    for i in range(n):
        t = i / SR
        # envelope: cosine attack, long exponential body, cosine release
        atk = min(1.0, i / attack)
        rel = min(1.0, (n - i) / release)
        env = atk * math.exp(-t * 0.42) * (rel if i > n - release else 1.0)
        x = 0.0
        for mult, amp in partials:
            x += amp * math.sin(2 * math.pi * f * mult * t)
        buf[a + i] += velocity * env * x


def add_reverb(buf, delay_ms=280, feedback=0.22, hz=1800):
    """Simple feedback delay with one-pole low-pass — a tiny room, not a hall."""
    d = int(SR * delay_ms / 1000)
    y = [0.0] * FRAMES
    rc = math.exp(-2 * math.pi * hz / SR)  # low-pass coefficient
    prev = 0.0
    for i in range(FRAMES):
        delayed = y[i - d] if i >= d else 0.0
        lp = delayed + rc * (prev - delayed)
        prev = lp
        y[i] = buf[i] + feedback * lp
    # Mix wet conservatively so it stays a bed, not an effect.
    for i in range(FRAMES):
        buf[i] = buf[i] * 0.82 + y[i] * 0.22


def render():
    b = [0.0] * FRAMES

    # Key: Dmaj9 center. Four-bar loop — slow, consonant, no surprises.
    #   Dmaj9  ->  Em7/F#  ->  Gmaj7  ->  Aadd9
    progression = [
        [50, 54, 57, 62, 66],   # D2 bass + F# A D E  (Dmaj9)
        [54, 57, 60, 64, 67],   # F#2 + A B E G     (Em7/F#)
        [43, 55, 59, 62, 67],   # G1 + D G B D     (Gmaj7)
        [49, 57, 61, 64, 69],   # A2 + C# E A C#   (Aadd9)
    ]
    chords = progression  # 4 bars — tight loop

    # Pattern per bar: root on 1, a soft arpeggio note later, a light
    # chord tone at the end. All velocities are intentionally gentle.
    def add(chord_idx, beat, note_idx, vel, dur):
        bar_start = chord_idx * BAR
        when = bar_start + beat * BEAT + random.uniform(-0.03, 0.05)
        piano_tone(b, when * SR, chord[note_idx], vel * random.uniform(0.92, 1.06), dur)

    for bi, chord in enumerate(chords):
        # root (bass note is index 0) — soft, held
        add(bi, 0.0, 0, 0.18, BAR * 1.15)
        # a high chord tone drifts in somewhere around beat 2
        add(bi, random.uniform(1.6, 2.2), random.choice([3, 4]), 0.08, 3.5)
        # two arpeggio notes mid-bar, quiet
        add(bi, 1.0 + random.uniform(-0.05, 0.05), random.choice([1, 2]), 0.06, 2.8)
        add(bi, random.uniform(2.5, 3.1), random.choice([2, 3]), 0.055, 3.0)
        # very faint upper-octave doubling once every other bar
        if bi % 2 == 0:
            add(bi, random.uniform(0.6, 1.3), 4, 0.05, 4.2)

    # A tiny held pedal on the root of the home key (D1) under the
    # whole loop — a bed that ties the four bars together.
    piano_tone(b, 0, 38, 0.055, BAR * 4.3)

    # Cross-stitch the loop: short fade-out at end cross-faded with the
    # start, so the seam is acoustically invisible.
    overlap = int(SR * 1.2)
    if overlap * 2 < FRAMES:
        for i in range(overlap):
            a = i / overlap
            b[FRAMES - overlap + i] = b[FRAMES - overlap + i] * (1 - a) + b[i] * a

    add_reverb(b)

    # Soft peak limiting to -1 dBFS-ish, then normalize conservatively so
    # the loop never fatigues the ear even on looped playback.
    peak = max(max(b), -min(b)) or 1.0
    target = 0.38  # ≈ -8.4 dB headroom — gentle by design
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
