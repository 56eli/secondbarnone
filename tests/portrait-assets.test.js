/**
 * Portrait asset invariants.
 *
 * These assert over the whole catalogue rather than sampling it, in the same
 * spirit as the other data tests: the failure mode they guard against is a
 * character quietly shipping a broken, blurry or missing portrait, which no
 * jsdom test can see because jsdom never decodes an image.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, statSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createAllProfiles } from '../docs/js/data/characters.js';
import { LOCATIONS } from '../docs/js/data/locations.js';
import { sourceFor, THUMB_PX, HI_PX } from '../scripts/build-portraits.js';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const DOCS = join(ROOT, 'docs');
const PORTRAITS = join(DOCS, 'assets', 'portraits');
const HI = join(PORTRAITS, 'hi');

/** ImageMagick is only needed for the dimension assertions. */
let hasMagick = true;
try {
  execFileSync('identify', ['-version'], { stdio: 'ignore' });
} catch {
  hasMagick = false;
  console.log('# ImageMagick not installed — skipping portrait dimension tests');
}
const magickTest = hasMagick ? test : test.skip;

const dimensions = (file) => {
  const out = execFileSync('identify', ['-format', '%wx%h', file]).toString().trim();
  const [w, h] = out.split('x').map(Number);
  return { w, h };
};

const profiles = createAllProfiles();

test('every character ships both portrait tiers on disk', () => {
  for (const c of profiles) {
    assert.ok(existsSync(join(DOCS, c.portrait)), `missing thumbnail for ${c.id}`);
    assert.ok(existsSync(join(DOCS, c.portraitHi)), `missing hi-res sheet for ${c.id}`);
  }
});

magickTest('thumbnails are small enough not to waste bandwidth', () => {
  // The largest inline avatar in the game is 84 CSS px (.detail-avatar), so a
  // 288px sheet already covers 3x displays. Anything bigger is dead weight on
  // every single page load.
  for (const c of profiles) {
    const { w, h } = dimensions(join(DOCS, c.portrait));
    assert.ok(w <= THUMB_PX, `${c.id} thumbnail is ${w}px, expected <= ${THUMB_PX}`);
    assert.ok(h <= THUMB_PX, `${c.id} thumbnail is ${h}px tall, expected <= ${THUMB_PX}`);
  }
});

magickTest('the hi-res sheet is never smaller than the thumbnail', () => {
  // Regression guard. An earlier build picked sources by format instead of
  // resolution, so three characters with a 160px PNG next to a 512px WebP got
  // a "hi" file that was smaller and blurrier than the thumbnail it was
  // supposed to enlarge.
  for (const c of profiles) {
    const thumb = dimensions(join(DOCS, c.portrait));
    const hi = dimensions(join(DOCS, c.portraitHi));
    assert.ok(
      hi.w >= thumb.w,
      `${c.id}: hi sheet ${hi.w}px is not larger than thumb ${thumb.w}px`,
    );
  }
});

magickTest('hi-res sheets never exceed the build size', () => {
  for (const c of profiles) {
    const { w, h } = dimensions(join(DOCS, c.portraitHi));
    assert.ok(w <= HI_PX, `${c.id} hi sheet is ${w}px, expected <= ${HI_PX}`);
    assert.ok(h <= HI_PX, `${c.id} hi sheet is ${h}px tall, expected <= ${HI_PX}`);
  }
});

test('no orphaned portrait files ship in the payload', () => {
  const expected = new Set(profiles.map((c) => `${c.id}.webp`));
  for (const f of readdirSync(PORTRAITS)) {
    if (f === 'hi') continue;
    assert.ok(expected.has(f), `unreferenced portrait file shipped: ${f}`);
  }
  for (const f of readdirSync(HI)) {
    assert.ok(expected.has(f), `unreferenced hi-res file shipped: hi/${f}`);
  }
});

test('no procedural SVG placeholders remain in the deployed payload', () => {
  const svgs = readdirSync(PORTRAITS).filter((f) => f.endsWith('.svg'));
  assert.deepEqual(svgs, [], `SVG placeholders still deployed: ${svgs.join(', ')}`);
});

test('the eager payload stays well under the lazy one', () => {
  // The tier split only pays off if the thumbnails really are the small ones.
  const sum = (dir, files) => files.reduce((n, f) => n + statSync(join(dir, f)).size, 0);
  const thumbs = sum(PORTRAITS, profiles.map((c) => `${c.id}.webp`));
  const his = sum(HI, profiles.map((c) => `${c.id}.webp`));
  assert.ok(thumbs < his, `thumbnails (${thumbs}) should weigh less than hi sheets (${his})`);
});

test('sourceFor prefers the largest available source, not the first format', () => {
  // joar/susan/yume are the historical case: a small legacy raster alongside
  // a larger sheet. Whatever the picker returns must be the biggest one.
  if (!hasMagick) return;
  for (const c of profiles) {
    const chosen = sourceFor(c.id);
    assert.ok(chosen, `no source resolved for ${c.id}`);
    const chosenW = dimensions(chosen).w;
    for (const cand of [
      join(ROOT, 'assets', 'portraits', `${c.id}.png`),
      join(ROOT, 'assets', 'portraits', `${c.id}.webp`),
    ]) {
      if (!existsSync(cand)) continue;
      assert.ok(
        chosenW >= dimensions(cand).w,
        `${c.id}: picked a ${chosenW}px source over a larger candidate`,
      );
    }
  }
});

// ------------------------------------------------------------- backgrounds

test('every location background exists and is referenced', () => {
  const referenced = new Set();
  for (const l of LOCATIONS) {
    if (!l.bg) continue;
    referenced.add(l.bg.replace('assets/backgrounds/', ''));
    assert.ok(existsSync(join(DOCS, l.bg)), `${l.id}: missing background ${l.bg}`);
  }
  // The hub paints its own backdrop, which no location declares.
  referenced.add('hub_background.webp');

  for (const f of readdirSync(join(DOCS, 'assets', 'backgrounds'))) {
    assert.ok(referenced.has(f), `unreferenced background shipped: ${f}`);
  }
});

test('retired pre-Paris backgrounds stay retired', () => {
  // These four were superseded by paris_* replacements. They kept coming back
  // because optimize-assets.sh rebuilt every PNG in assets/backgrounds/
  // rather than only the ones the catalogue references.
  const retired = ['bar', 'spiritual_community', 'public_library', 'river_walk'];
  const bgDir = join(DOCS, 'assets', 'backgrounds');
  for (const name of retired) {
    assert.ok(
      !existsSync(join(bgDir, `${name}.webp`)),
      `${name}.webp is a retired pre-Paris background and should not ship`,
    );
  }
});

/** Mean luminance 0..1 of an image, via ImageMagick. */
const luminance = (file) => Number(
  execFileSync('convert', [file, '-colorspace', 'gray', '-format', '%[fx:mean]', 'info:'])
    .toString().trim(),
);

magickTest('the House of Middleway background is sunny, not the old night scene', () => {
  // The first version of this art was a dusk-lit chapel under a storm-grey
  // sky, which fought the holy, welcoming tone the location is meant to have.
  // Rather than eyeball it, assert on the pixels: the sunlit repaint measures
  // ~0.44 mean luminance against ~0.18 for the night scene it replaced.
  const bg = join(DOCS, 'assets', 'backgrounds', 'house_of_middleway.webp');
  assert.ok(existsSync(bg), 'the chapel background should ship');

  const mean = luminance(bg);
  assert.ok(mean > 0.35, `the chapel should read as daylight, got mean luminance ${mean.toFixed(3)}`);

  // And it should be the brightest background in the game — it is the only
  // one whose whole point is the light.
  const bgDir = join(DOCS, 'assets', 'backgrounds');
  for (const f of readdirSync(bgDir)) {
    if (f === 'house_of_middleway.webp' || !f.endsWith('.webp')) continue;
    assert.ok(
      mean > luminance(join(bgDir, f)),
      `${f} is brighter than the sunny chapel`,
    );
  }
});

magickTest('the sunny chapel still stays legible under the location scrim', () => {
  // .location::before lays a rgba(8,8,16,.62)→.88 gradient over the art, so a
  // brighter painting must not push the panel light enough to wash out text.
  const bg = join(DOCS, 'assets', 'backgrounds', 'house_of_middleway.webp');
  const SCRIM_MIN_ALPHA = 0.62;
  const scrimmed = luminance(bg) * (1 - SCRIM_MIN_ALPHA) + (8 / 255) * SCRIM_MIN_ALPHA;
  assert.ok(scrimmed < 0.4, `scrimmed background too light for white text: ${scrimmed.toFixed(3)}`);
});

magickTest('the chapel background is a landscape at the deployed background width', () => {
  const bg = join(DOCS, 'assets', 'backgrounds', 'house_of_middleway.webp');
  const { w, h } = dimensions(bg);
  assert.equal(w, 1000, 'backgrounds deploy at 1000px wide');
  assert.ok(w > h, 'backgrounds are landscape');
});

test('the hub background is real art, not the old SVG placeholder', () => {
  assert.ok(
    existsSync(join(DOCS, 'assets', 'backgrounds', 'hub_background.webp')),
    'hub background should be a painted WebP',
  );
  assert.ok(
    !existsSync(join(DOCS, 'assets', 'backgrounds', 'hub_background.svg')),
    'the placeholder SVG hub background should be gone',
  );
});
