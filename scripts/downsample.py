#!/usr/bin/env python3
"""Downsample a WAV file to a target sample rate and bit depth using linear
interpolation + dither. Stdlib only — no ffmpeg needed."""
import wave, struct, sys, os, random

def downsample(in_path, out_path, target_sr=22050, bits=16, max_seconds=None):
    with wave.open(in_path, 'rb') as w:
        nch = w.getnchannels()
        sw = w.getsampwidth()
        sr = w.getframerate()
        n = w.getnframes()
        raw = w.readframes(n)
    if sw == 1:
        samples = [b - 128 for b in raw]
        scale = 1/128
    elif sw == 2:
        samples = list(struct.unpack('<' + 'h'*(len(raw)//2), raw))
        scale = 1/32768
    else:
        raise SystemExit(f'unsupported sample width {sw}')
    if nch > 1:
        samples = [sum(samples[i:i+nch])/nch for i in range(0, len(samples), nch)]
    total = len(samples)
    if max_seconds:
        total = min(total, int(sr * max_seconds))
        samples = samples[:total]
    ratio = sr / target_sr
    out_n = int(total / ratio)
    out = [0.0]*out_n
    prev = 0.0
    for i in range(out_n):
        src = i * ratio
        i0 = int(src)
        frac = src - i0
        i1 = min(i0+1, total-1)
        s = samples[i0]*(1-frac) + samples[i1]*frac
        out[i] = s*scale
    peak = max(abs(s) for s in out) or 1.0
    g = 0.85/peak
    rng = random.Random(0)
    dither = 1.0/(2**(bits-1))
    frames = bytearray()
    if bits == 16:
        for s in out:
            v = s*g + (rng.random()-0.5)*dither*0.5
            frames += struct.pack('<h', max(-32768, min(32767, int(v*32767))))
    else:
        for s in out:
            v = s*g + (rng.random()-0.5)*dither*0.5
            frames += struct.pack('<b', max(-128, min(127, int(v*128))))
    nframes = len(out)
    bps = int(bits // 8)
    sr_i = int(target_sr)
    byterate = sr_i * bps
    fields = [
        b'RIFF', int(36 + len(frames)), b'WAVE', b'fmt ',
        16, 1, 1, sr_i, byterate, bps, int(bits),
        b'data', int(len(frames)),
    ]
    fmt = '<4sI4s4sIHHIIHH4sI'
    for i, v in enumerate(fields):
        if not isinstance(v, (int, bytes)):
            raise TypeError(f'field {i} ({v!r}) not int/bytes: {type(v).__name__}')
    header = struct.pack(fmt, *fields)
    with open(out_path, 'wb') as f:
        f.write(header + bytes(frames))
    print(f'downsampled {in_path} {sr}Hz -> {out_path} {target_sr}Hz mono, {out_n/target_sr:.1f}s, {os.path.getsize(out_path)/1024:.0f} KB')

if __name__ == '__main__':
    if len(sys.argv) < 3:
        print('usage: downsample.py IN.wav OUT.wav [target_sr] [max_seconds]')
        sys.exit(1)
    downsample(sys.argv[1], sys.argv[2],
               int(sys.argv[3]) if len(sys.argv) > 3 else 22050,
               float(sys.argv[4]) if len(sys.argv) > 4 else None)
