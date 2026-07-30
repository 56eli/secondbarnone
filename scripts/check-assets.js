#!/usr/bin/env node
/**
 * Verifies every asset the game references actually exists on disk, and that
 * nothing in docs/ is unexpectedly large. Catches broken portrait paths before
 * they ship as missing images.
 *
 *   node scripts/check-assets.js
 */

import { access, stat, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createAllProfiles } from '../docs/js/data/characters.js';
import { LOCATIONS } from '../docs/js/data/locations.js';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const DOCS = join(ROOT, 'docs');

/** Assets referenced from CSS/JS that aren't character portraits. */
const STATIC_REFS = [
  'assets/backgrounds/hub_background.webp',
  'index.html',
  'css/style.css',
  'js/main.js',
  // Every background named by a location, derived rather than hand-listed so
  // adding a location to the catalogue cannot silently ship a broken path.
  ...LOCATIONS.map((l) => l.bg).filter(Boolean),
];

const MAX_FILE_BYTES = 400 * 1024;   // no single asset should exceed this

/**
 * Portraits ship in two tiers, and they are budgeted separately because a
 * player only pays for one of them up front:
 *
 *   eager  everything except assets/portraits/hi/ — HTML, CSS, JS, the 288px
 *          portrait thumbnails and the location backgrounds. This is what a
 *          run actually costs to load, so it gets the tight budget.
 *   total  eager + the 896px lightbox sheets, which are fetched only when a
 *          player taps a portrait to enlarge it. One extra sheet is ~80 KB
 *          on demand; nobody downloads all 77.
 *
 * The eager figure went *down* in the July 2026 art pass (~4.85 MB -> ~3 MB)
 * even though every character gained painted art, because the inline
 * thumbnails were cut from a wildly oversized 512px to 288px — the largest
 * avatar the game ever renders inline is 84 CSS px.
 */
const MAX_EAGER_BYTES = 4 * 1024 * 1024;
// Hi-res portraits are lazy; keep a tight eager budget and a realistic total gallery budget.
// Total budget covers everything in docs/ including the lazy lightbox portraits
// and the lazy music file. Real on-load cost stays at the eager budget.
const MAX_TOTAL_BYTES = 11 * 1024 * 1024;
const HI_DIR = join('assets', 'portraits', 'hi');
// Background music is lazy-loaded only when the player turns it on; it must
// never be counted in the eager budget.
const LAZY_DIRS = [HI_DIR, join('assets', 'music')];
const MAX_LAZY_AUDIO_BYTES = 1024 * 1024; // 1 MB cap on lazy music

let failures = 0;
const fail = (msg) => { console.error(`  ✗ ${msg}`); failures += 1; };

async function exists(rel) {
  try { await access(join(DOCS, rel)); return true; } catch { return false; }
}

console.log('Checking referenced assets…');

for (const rel of STATIC_REFS) {
  if (await exists(rel)) console.log(`  ✓ ${rel}`);
  else fail(`missing: ${rel}`);
}

console.log('\nChecking character portraits…');
for (const c of createAllProfiles()) {
  // Both tiers must exist: the thumbnail for inline avatars and the hi sheet
  // the lightbox enlarges. A missing hi file would fall back to a blurry
  // upscaled thumbnail, which is exactly the bug the tier split fixes.
  const okThumb = await exists(c.portrait);
  const okHi = await exists(c.portraitHi);
  if (okThumb && okHi) console.log(`  ✓ ${c.name.padEnd(9)} ${c.portrait} + hi`);
  if (!okThumb) fail(`${c.name}: missing portrait ${c.portrait}`);
  if (!okHi) fail(`${c.name}: missing hi-res portrait ${c.portraitHi}`);
}

console.log('\nChecking file sizes…');
async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

let total = 0;
let eager = 0;
let lazyAudio = 0;
for await (const file of walk(DOCS)) {
  const { size } = await stat(file);
  const rel = relative(DOCS, file);
  total += size;
  const inLazyDir = LAZY_DIRS.some((d) => rel.startsWith(d));
  if (!inLazyDir) eager += size;
  if (rel.startsWith(join('assets', 'music'))) {
    lazyAudio += size;
    if (size > MAX_LAZY_AUDIO_BYTES)
      fail(`${rel} is ${(size / 1024).toFixed(0)} KB (limit ${MAX_LAZY_AUDIO_BYTES / 1024} KB)`);
  }
  if (!inLazyDir && size > MAX_FILE_BYTES)
    fail(`${rel} is ${(size / 1024).toFixed(0)} KB (limit ${MAX_FILE_BYTES / 1024} KB)`);
}
const mb = (n) => `${(n / 1024 / 1024).toFixed(2)} MB`;
console.log(`  eager payload: ${mb(eager)} (limit ${mb(MAX_EAGER_BYTES)})`);
console.log(`  lightbox tier: ${mb(total - eager - lazyAudio)} (fetched on demand)`);
console.log(`  lazy music:    ${mb(lazyAudio)} (off until toggled)`);
console.log(`  total payload: ${mb(total)} (limit ${mb(MAX_TOTAL_BYTES)})`);
if (eager > MAX_EAGER_BYTES) fail(`eager payload exceeds ${mb(MAX_EAGER_BYTES)}`);
if (total > MAX_TOTAL_BYTES) fail(`total payload exceeds ${mb(MAX_TOTAL_BYTES)}`);

// Headroom policy: the 4 MB eager budget is deliberate and should stay — but
// a content PR should never *discover* the wall by tripping CI. Warn loudly
// once headroom drops below 10% so the optimisation conversation happens in
// review, not in a failed build. (Budget decisions live in PROJECT_OVERVIEW.)
const HEADROOM_FRACTION = 0.1;
if (eager > MAX_EAGER_BYTES * (1 - HEADROOM_FRACTION) && eager <= MAX_EAGER_BYTES) {
  console.log(
    `  ⚠ eager headroom is ${mb(MAX_EAGER_BYTES - eager)} ` +
      `(${Math.round((eager / MAX_EAGER_BYTES) * 100)}% of budget used) — ` +
      `optimise images on sight or raise the budget deliberately`,
  );
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log('\nAll asset checks passed.');
