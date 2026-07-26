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
  'assets/backgrounds/hub_background.svg',
  'index.html',
  'css/style.css',
  'js/main.js',
  // Every background named by a location, derived rather than hand-listed so
  // adding a location to the catalogue cannot silently ship a broken path.
  ...LOCATIONS.map((l) => l.bg).filter(Boolean),
];

const MAX_FILE_BYTES = 400 * 1024;   // no single asset should exceed this
const MAX_TOTAL_BYTES = 3 * 1024 * 1024;

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
  if (await exists(c.portrait)) console.log(`  ✓ ${c.name.padEnd(9)} ${c.portrait}`);
  else fail(`${c.name}: missing portrait ${c.portrait}`);
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
for await (const file of walk(DOCS)) {
  const { size } = await stat(file);
  total += size;
  if (size > MAX_FILE_BYTES) fail(`${relative(DOCS, file)} is ${(size / 1024).toFixed(0)} KB (limit ${MAX_FILE_BYTES / 1024} KB)`);
}
console.log(`  total payload: ${(total / 1024).toFixed(0)} KB`);
if (total > MAX_TOTAL_BYTES) fail(`total payload exceeds ${MAX_TOTAL_BYTES / 1024 / 1024} MB`);

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log('\nAll asset checks passed.');
