#!/usr/bin/env node
/**
 * Portrait manifest builder.
 *
 * Writes `assets/portraits/manifest.json`: the SHA-256 of every character's
 * approved PNG master and both deployed WebP tiers, keyed by character id.
 *
 * ## Why this exists
 *
 * On 30 July 2026 the repo carried a *text record* of an art replacement
 * pass whose binaries never landed in the tree (the squashed history shipped
 * the upload-day images instead). Nothing failed: doc said replaced, bytes
 * were old. The manifest closes that hole for good — the bytes ARE the
 * record now, and `tests/portrait-assets.test.js` asserts they match. Any
 * silent substitution — a stale branch merge, an "Add files via upload" of
 * old art, a re-encoded tier — fails the suite, no matter what any
 * accompanying text claims.
 *
 * ## When to run it
 *
 * After any approved portrait change, in the SAME commit:
 *
 *   node scripts/build-portraits.js --only=<ids>   # rebuild tiers
 *   node scripts/build-portrait-manifest.js        # re-pin the manifest
 *
 * Hash churn is deliberate: touching an approved portrait without updating
 * the manifest is exactly the anomaly the tests are built to catch.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createAllProfiles } from '../docs/js/data/characters.js';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const SRC = join(ROOT, 'assets', 'portraits');
const OUT = join(ROOT, 'docs', 'assets', 'portraits');
export const MANIFEST_PATH = join(SRC, 'manifest.json');

const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

export function buildManifest() {
  const manifest = {};
  for (const c of createAllProfiles()) {
    const master = join(SRC, `${c.id}.png`);
    const thumb = join(OUT, `${c.id}.webp`);
    const hi = join(OUT, 'hi', `${c.id}.webp`);
    for (const f of [master, thumb, hi]) {
      if (!existsSync(f)) throw new Error(`${c.id}: cannot pin missing file ${f}`);
    }
    manifest[c.id] = { master: sha256(master), thumb: sha256(thumb), hi: sha256(hi) };
  }
  return Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)));
}

function main() {
  const manifest = buildManifest();
  writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`pinned ${Object.keys(manifest).length} portraits -> ${MANIFEST_PATH}`);
}

if (process.argv[1] && process.argv[1].endsWith('build-portrait-manifest.js')) main();
