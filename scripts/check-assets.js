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
  'assets/audio/warm-piano-loop.wav',
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
 *          on demand; nobody downloads all 78.
 *
 * The eager figure went *down* in the July 2026 art pass (~4.85 MB -> ~3 MB)
 * even though every character gained painted art, because the inline
 * thumbnails were cut from a wildly oversized 512px to 288px — the largest
 * avatar the game ever renders inline is 84 CSS px.
 */
const MAX_EAGER_BYTES = 4 * 1024 * 1024;
const MAX_TOTAL_BYTES = 8 * 1024 * 1024;
const HI_DIR = join('assets', 'portraits', 'hi');

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
for await (const file of walk(DOCS)) {
  const { size } = await stat(file);
  const rel = relative(DOCS, file);
  total += size;
  if (!rel.startsWith(HI_DIR)) eager += size;
  if (size > MAX_FILE_BYTES) fail(`${rel} is ${(size / 1024).toFixed(0)} KB (limit ${MAX_FILE_BYTES / 1024} KB)`);
}
const mb = (n) => `${(n / 1024 / 1024).toFixed(2)} MB`;
console.log(`  eager payload: ${mb(eager)} (limit ${mb(MAX_EAGER_BYTES)})`);
console.log(`  lightbox tier: ${mb(total - eager)} (fetched on demand)`);
console.log(`  total payload: ${mb(total)} (limit ${mb(MAX_TOTAL_BYTES)})`);
if (eager > MAX_EAGER_BYTES) fail(`eager payload exceeds ${mb(MAX_EAGER_BYTES)}`);
if (total > MAX_TOTAL_BYTES) fail(`total payload exceeds ${mb(MAX_TOTAL_BYTES)}`);

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log('\nAll asset checks passed.');
