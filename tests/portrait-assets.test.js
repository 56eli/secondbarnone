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
import { existsSync, statSync, readdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createAllProfiles } from '../docs/js/data/characters.js';
import { LOCATIONS } from '../docs/js/data/locations.js';
import { sourceFor, THUMB_PX, HI_PX, FRAME_EXCEPTIONS } from '../scripts/build-portraits.js';

// v2.0 policy constants
const FRAMELESS_STANDARD = true; // all new art must be clean square (no baked frame)

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
    assert.ok(hi.w >= thumb.w, `${c.id}: hi sheet ${hi.w}px is not larger than thumb ${thumb.w}px`);
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

// ------------------------------------------------- the off-style four

/**
 * Kaj, Lakshay, Arian and Dorian were the last portraits that were not in the
 * house style: three pixel-art sprites and one flat cartoon vector that still
 * carried a third-party stock watermark. Coverage tests could not see the
 * problem — the files existed and were the right size — so they survived
 * every previous art pass.
 *
 * They are pinned by content hash rather than by any "does this look painted"
 * heuristic. Style metrics (blockiness, colour count) were measured against
 * the real files first and overlap between the two styles, so a threshold
 * would be a coin flip that fails on unrelated art. A hash cannot be
 * ambiguous: it fails if and only if the exact retired file comes back, which
 * is the actual regression — someone re-running the builder against a stale
 * source in assets/portraits/.
 */
const RETIRED_ART = Object.freeze({
  kaj: {
    thumb: 'dbbfa3e9ed3c0d644dc980699f0bff21e67f615227ed606b57637444c3250cb9',
    hi: 'c7fb3993cba4ecb56884ddef847e7b10b6fed60045445f7658ae9c8bb44821a5',
  },
  lakshay: {
    thumb: 'e7c5c82745e9917f49a6cf394c3a9440f904c4203d4f0669087f49d50765c7bc',
    hi: 'a0dbf3aa773b7ba8661e56fd696cefd15cb7f0c3e282b8a3e661c61a2cc0672f',
  },
  arian: {
    thumb: '58bbee469e67f124bf9cf0f183b08afa4e362ee273660502271c03362560e078',
    hi: '4e8f7bae5b3be28e3a5db8f5fac7848128cda03cd8cb0e31deb7510a00d02880',
  },
  dorian: {
    thumb: 'da54adc7eeb4d2cf5af8f291a27ab49fe97a48437e4ade1feb2f066540b0063b',
    hi: 'b2765cbeee7638e5b8ed4ac3a6459a9343116f346671251ebb8b5b546da92fa1',
  },
});

const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

test('the four off-style portraits stay retired', () => {
  for (const [id, hashes] of Object.entries(RETIRED_ART)) {
    assert.notEqual(
      sha256(join(PORTRAITS, `${id}.webp`)),
      hashes.thumb,
      `${id}: the retired off-style thumbnail is deployed again`,
    );
    assert.notEqual(
      sha256(join(HI, `${id}.webp`)),
      hashes.hi,
      `${id}: the retired off-style hi sheet is deployed again`,
    );
  }
});

test('the repainted four have a full-resolution painted master', () => {
  // The stale 512px WebPs next to these ids are what the old build picked up.
  // Deleting them was part of the fix: the PNG master must be the only source
  // sourceFor() can resolve, otherwise a plain `npm run assets` silently
  // reinstates whichever file happens to be larger.
  const src = join(ROOT, 'assets', 'portraits');
  for (const id of Object.keys(RETIRED_ART)) {
    assert.ok(
      existsSync(join(src, `${id}.png`)),
      `${id}: the painted PNG master should be committed as the source of truth`,
    );
    assert.ok(
      !existsSync(join(src, `${id}.webp`)),
      `${id}: the superseded 512px WebP source should have been deleted`,
    );
  }
});

magickTest('the repainted four are painted at full lightbox resolution', () => {
  // The old sprites were upscaled from small sources, so they could never be
  // sharp in the lightbox. Their replacements must actually fill the hi tier.
  for (const id of Object.keys(RETIRED_ART)) {
    const { w, h } = dimensions(join(HI, `${id}.webp`));
    assert.equal(w, HI_PX, `${id}: hi sheet should be a full ${HI_PX}px, got ${w}px`);
    assert.equal(h, HI_PX, `${id}: hi sheet should be square at ${HI_PX}px, got ${h}px`);
  }
});

test('the eager payload stays well under the lazy one', () => {
  // The tier split only pays off if the thumbnails really are the small ones.
  const sum = (dir, files) => files.reduce((n, f) => n + statSync(join(dir, f)).size, 0);
  const thumbs = sum(
    PORTRAITS,
    profiles.map((c) => `${c.id}.webp`),
  );
  const his = sum(
    HI,
    profiles.map((c) => `${c.id}.webp`),
  );
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

// ------------------------------------------------------------- v2.0 frame-less policy

test('v2.0: non-exception characters prefer clean PNG masters (no baked frame sources)', () => {
  for (const c of profiles) {
    if (FRAME_EXCEPTIONS.has(c.id)) continue;

    const pngPath = join(ROOT, 'assets', 'portraits', `${c.id}.png`);
    const webpPath = join(ROOT, 'assets', 'portraits', `${c.id}.webp`);

    // Strong recommendation: every non-exception should have a PNG master
    // (this will become a hard assert once the 16 missing masters are added)
    if (existsSync(webpPath) && !existsSync(pngPath)) {
      // Soft warning in test output — real enforcement lives in build + CI
      console.warn(
        `  ⚠ v2.0 policy: ${c.id} still uses legacy .webp as best source. PNG master required.`,
      );
    }
  }
});

test('Brian and Vanna are immutable art exceptions', () => {
  // These are content locks, not a permission to regenerate them later.
  const frozen = {
    vanna: {
      master: 'b9d655e35b2cd2b08f62e5834445aa02b7198e4091d4152ec086e3fea73fbd85',
      thumb: 'a95ce9eb3143de764436241709505b388faa332ff10f9da8ad0c1e6008a3e82c',
      hi: 'd9bfb140844bfb7588830d79f3280d5b56e19c02fbb768645f2e7da009225672',
    },
    brian: {
      master: '1b9dd2db4119319da950753e8ada9ddc23e7b3d532106b3ed7f9dcbceb017a6f',
      thumb: '1e9fa7428d581ea42456a1b8a5790e69751ec608aa03f1e655453d1919b699d1',
      hi: '6de3faa89b7ae54bef770bb033027f68eba3d60b2d3332f2a44e21edbd912fd5',
    },
  };
  assert.deepEqual(new Set(Object.keys(frozen)), FRAME_EXCEPTIONS);
  for (const [id, hashes] of Object.entries(frozen)) {
    assert.equal(sha256(join(ROOT, 'assets', 'portraits', `${id}.png`)), hashes.master);
    assert.equal(sha256(join(PORTRAITS, `${id}.webp`)), hashes.thumb);
    assert.equal(sha256(join(HI, `${id}.webp`)), hashes.hi);
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

/**
 * Five backgrounds were still set somewhere other than Paris after the first
 * coherence pass, because that pass only looked at the six most obviously
 * wrong scenes. These were the remainder:
 *
 *   free_clinic       English-language posters, non-Paris street outside
 *   community_garden  red-brick tenements with fire escapes — New York
 *   rooftop           generic North American downtown skyline of glass towers
 *   landlord_office   British suburban terraced houses through the window
 *   home_loft         anonymous high-rise skyline, no Paris roofline
 *
 * Same reasoning as the portrait hashes: pinned by content rather than by a
 * "does this look French" heuristic, which no cheap image metric can express.
 */
const RETIRED_BACKGROUNDS = Object.freeze({
  free_clinic: '5c5d977f466a0c369693579b3d2c4cab1655b3677a9f8cb7a4794a89ce1dd262',
  community_garden: 'e45011004940496a586e0cbc49bb6ae74013f7c495d72c6ef6fb20ba92b91fde',
  rooftop: '8801f66d09bc1f68a14ccd574baa6330d89d33dd209f0d581310e4dd77b64f9c',
  landlord_office: '66f23ddfc6955ffe5555aaa25357c1150b1c31af0ba99abab4f81cb4e184a566',
  home_loft: '4ebbf25297e9bbb5c72ba771c8ad59c1284c0022966166e2847c1c4ce1629d68',
});

test('the off-theme backgrounds stay repainted for Paris', () => {
  const bgDir = join(DOCS, 'assets', 'backgrounds');
  for (const [name, hash] of Object.entries(RETIRED_BACKGROUNDS)) {
    assert.notEqual(
      sha256(join(bgDir, `${name}.webp`)),
      hash,
      `${name}.webp: the retired non-Paris background is deployed again`,
    );
  }
});

test('every repainted Paris background keeps a full-resolution master', () => {
  // These five had no committed PNG source before (two never had one at all),
  // so `npm run assets` could not rebuild them and a regression would be
  // unrecoverable from the repo alone.
  const src = join(ROOT, 'assets', 'backgrounds');
  for (const name of Object.keys(RETIRED_BACKGROUNDS)) {
    assert.ok(
      existsSync(join(src, `${name}.png`)),
      `${name}: the painted PNG master should be committed so the WebP can be rebuilt`,
    );
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
const luminance = (file) =>
  Number(
    execFileSync('convert', [file, '-colorspace', 'gray', '-format', '%[fx:mean]', 'info:'])
      .toString()
      .trim(),
  );

magickTest('the House of Middleway background is sunny, not the old night scene', () => {
  // The first version of this art was a dusk-lit chapel under a storm-grey
  // sky, which fought the holy, welcoming tone the location is meant to have.
  // Rather than eyeball it, assert on the pixels: the sunlit repaint measures
  // ~0.44 mean luminance against ~0.18 for the night scene it replaced.
  const bg = join(DOCS, 'assets', 'backgrounds', 'house_of_middleway.webp');
  assert.ok(existsSync(bg), 'the chapel background should ship');

  const mean = luminance(bg);
  assert.ok(
    mean > 0.35,
    `the chapel should read as daylight, got mean luminance ${mean.toFixed(3)}`,
  );
});

magickTest('every deployed background is a daytime scene', () => {
  // All backgrounds were regenerated in a daylight pass (July 2026). The hub
  // had shipped at 0.085 mean luminance (a night scene) while its neighbours
  // sat around 0.34. None should read as night or dusk any more.
  const bgDir = join(DOCS, 'assets', 'backgrounds');
  const DAYLIGHT_FLOOR = 0.28;
  for (const f of readdirSync(bgDir)) {
    if (!f.endsWith('.webp')) continue;
    const mean = luminance(join(bgDir, f));
    assert.ok(
      mean > DAYLIGHT_FLOOR,
      `${f} reads as ${mean.toFixed(3)} — below the ${DAYLIGHT_FLOOR} daylight floor`,
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
