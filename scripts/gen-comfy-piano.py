#!/usr/bin/env python3
"""Create secondbarnone's gentle, low-fatigue piano loop.

A compact 16 kHz mono PCM master keeps the optional browser asset light while
preserving the important range of a soft upright piano. The composition is
original: warm felt-piano harmonics, very slow broken chords, no sharp attacks,
and a carefully matched loop boundary.
"""
import math, os, random, struct, sys, wave
SR=16000; BPM=50; BEAT=60/BPM; BARS=4; BAR=4*BEAT; DURATION=BARS*BAR; FRAMES=round(SR*DURATION)
random.seed(150)
def note(buf,midi,start,velocity,duration=5.0):
    f=440*2**((midi-69)/12); a=max(0,round(start*SR)); n=min(FRAMES-a,round(duration*SR))
    attack=0.024*SR
    for i in range(max(0,n)):
        t=i/SR; env=(min(1,i/attack)*math.exp(-t/2.7) + 0.025*math.exp(-t/6.4))
        # soft fundamental + low inharmonic body; cosine onset prevents clicks
        x=(math.sin(2*math.pi*f*t)+.26*math.sin(2*math.pi*f*2.002*t)+.08*math.sin(2*math.pi*f*3.01*t))
        buf[a+i]+=velocity*env*x

def render():
    b=[0.0]*FRAMES
    # Am9, Fmaj7, Cmaj9/G, G6/9: intentionally open, unhurried voicings.
    chords=[[45,52,57,60,64],[41,48,53,57,60],[43,50,55,59,62],[43,50,57,59,64]]
    pattern=[(0.0,0,.14),(0.16,1,.09),(1.08,3,.075),(2.05,2,.08),(2.92,4,.07),(3.66,3,.06)]
    for bar,chord in enumerate(chords):
        base=bar*BAR
        for beat,idx,v in pattern:
            note(b,chord[idx],base+beat*BEAT+random.uniform(-.018,.018),v*random.uniform(.92,1.04))
        note(b,chord[0]-12,base+.012,.040,6.0)
    # taper the final tail to the first sample: audible loop remains seamless.
    edge=int(SR*.45)
    for i in range(edge):
        b[-edge+i]*=(edge-i)/edge
    peak=max(max(b),-min(b)) or 1
    return [max(-.72,min(.72,x*.58/peak)) for x in b]
def write(path):
    os.makedirs(os.path.dirname(path) or '.',exist_ok=True)
    with wave.open(path,'wb') as w:
        w.setnchannels(1);w.setsampwidth(2);w.setframerate(SR)
        w.writeframes(b''.join(struct.pack('<h',round(x*32767)) for x in render()))
    assert os.path.getsize(path)<900*1024
if __name__=='__main__': write(sys.argv[1] if len(sys.argv)>1 else 'docs/assets/music/comfy_piano.wav')
