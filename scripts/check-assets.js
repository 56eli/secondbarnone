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

const MAX_FILE_BYTES = 400 * 1024; // no single asset should exceed this

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
/**
 * ## Why the eager budget is the one that binds
 *
 * The two tiers are not the same kind of cost and should not share a ceiling.
 *
 *   eager  what every player downloads to play. A hard budget belongs here,
 *          and it is tight on purpose.
 *   hi     the 896px lightbox sheets, fetched only when a portrait is tapped.
 *          Nobody downloads all 78; the meaningful limit is *per sheet*, not
 *          in aggregate.
 *
 * Capping their sum meant the on-demand tier consumed the headroom for the
 * eager one. With 78 characters the total sat at 7.98 MB against an 8 MB
 * ceiling — **17 KB of room, when one new character costs ~72 KB.** Adding a
 * single person to the cast failed the build, which blocked every content
 * change in the roadmap for a reason unrelated to what a player downloads.
 *
 * So: the eager tier keeps its hard cap, each hi sheet is capped individually,
 * and the aggregate hi figure is reported as a budget advisory rather than a
 * gate. If that number ever becomes a real constraint the answer is
 * re-encoding (AVIF, or lower WebP quality), not refusing content.
 */
const MAX_EAGER_BYTES = 4 * 1024 * 1024;
const MAX_HI_FILE_BYTES = 160 * 1024;
/** Advisory only — printed, never fatal. See the note above. */
const HI_TIER_ADVISORY_BYTES = 6 * 1024 * 1024;
const HI_DIR = join('assets', 'portraits', 'hi');

let failures = 0;
const fail = (msg) => {
  console.error(`  ✗ ${msg}`);
  failures += 1;
};

async function exists(rel) {
  try {
    await access(join(DOCS, rel));
    return true;
  } catch {
    return false;
  }
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
  const isHi = rel.startsWith(HI_DIR);
  if (!isHi) eager += size;

  // Per-file limits differ by tier: an eager asset is paid for by everyone,
  // a hi sheet only by the player who tapped that one portrait.
  const limit = isHi ? MAX_HI_FILE_BYTES : MAX_FILE_BYTES;
  if (size > limit) {
    fail(`${rel} is ${(size / 1024).toFixed(0)} KB (limit ${limit / 1024} KB)`);
  }
}
const mb = (n) => `${(n / 1024 / 1024).toFixed(2)} MB`;
const hi = total - eager;
const headroom = MAX_EAGER_BYTES - eager;
console.log(
  `  eager payload: ${mb(eager)} (limit ${mb(MAX_EAGER_BYTES)}, ${(headroom / 1024).toFixed(0)} KB free)`,
);
console.log(`  lightbox tier: ${mb(hi)} (on demand, advisory limit ${mb(HI_TIER_ADVISORY_BYTES)})`);
console.log(`  total on disk: ${mb(total)}`);

// The eager tier is the gate: it is what a player actually downloads.
if (eager > MAX_EAGER_BYTES) fail(`eager payload exceeds ${mb(MAX_EAGER_BYTES)}`);

// The hi tier is advisory. Say something useful, do not block content.
if (hi > HI_TIER_ADVISORY_BYTES) {
  console.log(
    `  ⚠ lightbox tier is over its advisory budget — consider re-encoding ` +
      `(AVIF or lower WebP quality) rather than dropping art.`,
  );
}

// Content planning aid: adding a location means three characters plus a
// background, and the useful time to learn it will not fit is before writing it.
const perCharacter = 15 * 1024;
const perBackground = 90 * 1024;
const roomForCharacters = Math.floor(headroom / perCharacter);
console.log(
  `  budget: room for ~${roomForCharacters} more characters, ` +
    `or ~${Math.floor(headroom / (3 * perCharacter + perBackground))} more locations`,
);

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log('\nAll asset checks passed.');
