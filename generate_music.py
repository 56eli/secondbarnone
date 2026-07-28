#!/usr/bin/env python3
"""Generate a short, warm, ambient piano-like tone for secondbarnone."""
import wave, struct, math, random

SR = 44100
DUR = 75  # 75 seconds
samples = int(SR * DUR)

w = wave.open('docs/assets/music/warm_piano.wav', 'w')
w.setnchannels(1)
w.setsampwidth(2)
w.setframerate(SR)

# Warm piano-like synthesis: fundamental 220 Hz (A3) with gentle overtones,
# amplitude envelope with slow attack (2s), long sustain (65s), gentle decay (8s)
# plus occasional harmonic flourishes.

for i in range(samples):
    t = i / SR
    # Slow amplitude envelope
    attack = min(1.0, t / 2.0)
    decay_start = DUR - 8.0
    decay = max(0.0, 1.0 - max(0, t - decay_start) / 8.0)
    env = attack * decay * 0.35

    # Fundamental + gentle overtones for warmth
    base = math.sin(2 * math.pi * 220 * t)
    overtone = 0.35 * math.sin(2 * math.pi * 440 * t)
    warmth = 0.2 * math.sin(2 * math.pi * 660 * t)

    # Slow LFO modulation for movement
    lfo = 0.05 * math.sin(2 * math.pi * 0.15 * t)

    # Random gentle harmonic strikes (rare, like distant piano notes)
    strike = 0
    if random.random() < 0.003:
        strike_t = (i % 22050) / SR  # 0.5s micro-envelope
        strike_env = math.sin(math.pi * strike_t / 0.5) if strike_t < 0.5 else 0
        strike = 0.15 * strike_env * (0.7 + 0.3 * random.random())

    sample = env * (base + overtone + warmth + lfo + strike)
    # Soft clipping / compression
    sample = max(-0.95, min(0.95, sample))
    w.writeframes(struct.pack('<h', int(sample * 32767)))

w.close()
print("Created docs/assets/music/warm_piano.wav")
