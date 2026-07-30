#!/usr/bin/env python3
"""Synthesize the original warm, slow piano loop used by secondbarnone.

Four bars at 52 BPM: Am9 → Fmaj7 → Cmaj7 → G6. A soft felt-piano
additive voice, sparse broken chords, quiet pedal resonance and circular
delay keep it comfortable rather than dramatic. Tails wrap through the
loop boundary, so there is no fade-to-silence or click when it repeats.

The generator uses only Python's standard library and no samples; the
recording is project-original and reproducible from seed 20260730.
"""

import math
import os
import random
import struct
import sys
import wave

SR = 22_050
BPM = 52
BEAT = 60.0 / BPM
BARS = 4
BAR = BEAT * 4
DURATION = BARS * BAR
FRAME_COUNT = round(SR * DURATION)
SEED = 20_260_730

random.seed(SEED)


def midi_to_hz(note):
    return 440.0 * 2 ** ((note - 69) / 12)


def add_piano_note(buffer, note, start_seconds, velocity=0.2, duration=5.4):
    """Add a rounded felt-piano tone with a quiet, short hammer texture."""
    frequency = midi_to_hz(note)
    start = round(start_seconds * SR)
    samples = min(round(duration * SR), FRAME_COUNT)
    phase_jitter = [random.uniform(-0.08, 0.08) for _ in range(6)]
    hammer_state = 0.0

    for i in range(samples):
        t = i / SR
        # Quick but rounded onset, then two-stage piano decay.
        attack = min(1.0, t / 0.026)
        decay = 0.74 * math.exp(-t / 1.65) + 0.26 * math.exp(-t / 4.8)
        envelope = math.sin(attack * math.pi / 2) * decay

        # Slight inharmonicity and steep harmonic roll-off read as a mellow
        # upright/felt piano rather than an organ or bright concert grand.
        tone = 0.0
        for harmonic in range(1, 7):
            stretched = harmonic * (1.0 + 0.00028 * harmonic * harmonic)
            amplitude = (1.0 / harmonic**1.72) * (0.84 if harmonic > 3 else 1.0)
            tone += amplitude * math.sin(
                2 * math.pi * frequency * stretched * t + phase_jitter[harmonic - 1]
            )

        # Felt/hammer noise: low-passed and gone within a tenth of a second.
        noise = random.uniform(-1.0, 1.0)
        hammer_state += 0.16 * (noise - hammer_state)
        hammer = hammer_state * math.exp(-t / 0.055) * 0.055
        value = (tone * 0.72 + hammer) * envelope * velocity
        buffer[(start + i) % FRAME_COUNT] += value


def circular_resonance(buffer):
    """Quiet pedal/body resonance with loop-safe circular delays."""
    dry = list(buffer)
    count = len(buffer)
    for delay_seconds, amount in ((0.073, 0.12), (0.137, 0.09), (0.283, 0.065)):
        delay = round(delay_seconds * SR)
        for i in range(count):
            buffer[i] += dry[(i - delay) % count] * amount

    # Warm one-pole low pass, then remove DC.
    alpha = 1.0 - math.exp(-2.0 * math.pi * 3_150.0 / SR)
    state = 0.0
    for i, sample in enumerate(buffer):
        state += alpha * (sample - state)
        buffer[i] = state
    mean = sum(buffer) / count
    for i in range(count):
        buffer[i] -= mean

    # Match the final sample to the first over a smooth 80 ms correction. The
    # circular resonance already carries musical tails across the boundary;
    # this removes the remaining waveform discontinuity without a silent dip.
    correction_samples = round(SR * 0.08)
    difference = buffer[0] - buffer[-1]
    for offset in range(correction_samples):
        phase = (offset + 1) / correction_samples
        smooth = 0.5 - 0.5 * math.cos(math.pi * phase)
        buffer[count - correction_samples + offset] += difference * smooth


def render():
    buffer = [0.0] * FRAME_COUNT
    chords = [
        [45, 52, 59, 60, 64],  # Am9
        [41, 48, 55, 57, 64],  # Fmaj7
        [43, 48, 55, 59, 64],  # Cmaj7/G
        [43, 50, 55, 59, 62],  # G6
    ]
    # Sparse, humanized pattern. The low note anchors each bar; upper notes
    # answer slowly enough to leave air around the game UI.
    pattern = [
        (0.00, 0, 0.23),
        (0.08, 1, 0.16),
        (0.92, 3, 0.13),
        (1.72, 2, 0.14),
        (2.58, 4, 0.12),
        (3.36, 3, 0.105),
    ]

    for bar_index, chord in enumerate(chords):
        bar_start = bar_index * BAR
        for beat_offset, chord_index, velocity in pattern:
            human = random.uniform(-0.022, 0.022)
            add_piano_note(
                buffer,
                chord[chord_index],
                bar_start + beat_offset * BEAT + human,
                velocity * random.uniform(0.94, 1.04),
            )
        # A barely audible octave root gives the upright body warmth.
        add_piano_note(buffer, chord[0] - 12, bar_start + 0.015, 0.075, duration=6.2)

    circular_resonance(buffer)
    peak = max(abs(sample) for sample in buffer) or 1.0
    gain = 0.69 / peak
    return [max(-0.95, min(0.95, sample * gain)) for sample in buffer]


def write_wav(path):
    samples = render()
    os.makedirs(os.path.dirname(path) or '.', exist_ok=True)
    with wave.open(path, 'wb') as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(SR)
        frames = bytearray()
        for sample in samples:
            frames.extend(struct.pack('<h', round(sample * 32_767)))
        output.writeframes(frames)
    size = os.path.getsize(path)
    assert size < 1_024 * 1_024, 'music must remain below the 1 MiB lazy-audio budget'
    print(f'wrote {path} ({size / 1024:.1f} KiB, {DURATION:.2f}s, {BPM} BPM)')


if __name__ == '__main__':
    write_wav(sys.argv[1] if len(sys.argv) > 1 else 'docs/assets/music/comfy_piano.wav')
