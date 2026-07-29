/** Browser-decodable music asset contract. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';

const files = ['assets/music/warm_piano.wav', 'docs/assets/music/warm_piano.wav'];

function wavHeader(path) {
  const data = readFileSync(path);
  return {
    riff: data.toString('ascii', 0, 4),
    wave: data.toString('ascii', 8, 12),
    format: data.readUInt16LE(20),
    channels: data.readUInt16LE(22),
    sampleRate: data.readUInt32LE(24),
    bitsPerSample: data.readUInt16LE(34),
    data: data.toString('ascii', 36, 40),
  };
}

test('background music is a small browser-decodable PCM WAV and deploy copy matches source', () => {
  const [source, deployed] = files.map(wavHeader);
  for (const header of [source, deployed]) {
    assert.equal(header.riff, 'RIFF');
    assert.equal(header.wave, 'WAVE');
    assert.equal(header.data, 'data');
    assert.equal(header.format, 1, 'WAV must use PCM, not an unsupported float/invalid format');
    assert.equal(header.channels, 1);
    assert.equal(header.sampleRate, 22050);
    assert.equal(header.bitsPerSample, 16);
  }
  assert.deepEqual(deployed, source, 'deployed audio header must match source master');
  assert.ok(statSync(files[1]).size < 1024 * 1024, 'lazy audio stays under its 1 MiB budget');
});
