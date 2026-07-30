#!/usr/bin/env node
/**
 * Portrait tier builder (v2.0 — frame-less square standard).
 *
 * Presentation model (long-term health):
 *   • All previews in the game (HUD, lists, hosts, events) are ROUND via CSS.
 *   • The lightbox popup shows CLEAN SQUARE art at standardized size.
 *   • NO baked circular frames in new or regenerated masters.
 *
 * Content-locked portraits (Brian and Vanna) are protected by SHA-256 tests.
 * A content lock is not a frame exception: both keep their approved clean-square
 * source and must never be regenerated without owner approval.
 *
 * All source masters must be clean square PNGs (≥1024px for new art).
 *
 * The game needs each portrait at two very different sizes:
 *
 *   thumb  docs/assets/portraits/<id>.webp      288px — every inline use
 *   hi     docs/assets/portraits/hi/<id>.webp  896px — the tap-to-enlarge lightbox only
 *
 * Source preference (strict for v2.0):
 *   assets/portraits/<id>.png     ← ONLY accepted master for new art
 *   (legacy deployed WebP is a last-resort read-only fallback during transition)
 *
 * Usage: node scripts/build-portraits.js [--only id,id,...]
 */

import { existsSync, mkdirSync, statSync, readdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createAllProfiles } from '../docs/js/data/characters.js';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const SRC = join(ROOT, 'assets', 'portraits');
const OUT = join(ROOT, 'docs', 'assets', 'portraits');
const OUT_HI = join(OUT, 'hi');

export const THUMB_PX = 288;
export const HI_PX = 896;

/** Portraits that are content-locked by exact SHA-256 tests. */
export const LOCKED_PORTRAITS = new Set(['brian', 'vanna']);
const THUMB_QUALITY = 78;
// 896px/q56 was chosen by comparing 100% crops against q68: no visible
// difference in the painted style, ~18% smaller. 896px still covers the
// lightbox's 560 CSS px at 1.6x density, and the whole hi tier fits the
// deployed payload budget alongside the backgrounds.
const HI_QUALITY = 56;

/**
 * Resolve the best on-disk source for a character id (v2.0 policy).
 *
 * v2.0 rule:
 * - Preferred master: assets/portraits/<id>.png (clean square, no baked frame)
 * - Legacy .webp sources are a transition fallback only; no build may overwrite
 *   a content-locked portrait without its SHA-256 review being updated
 *   (the build will still run but will log loudly and the asset test should catch it).
 *
 * "Best" still prefers largest resolution.
 */
export function sourceFor(id, { src = SRC, out = OUT } = {}) {
  const candidates = [
    { path: join(src, `${id}.png`), rank: 3 },
    { path: join(src, `${id}.webp`), rank: 2 },
    { path: join(out, `${id}.webp`), rank: 1 },
  ].filter((c) => existsSync(c.path));

  if (candidates.length === 0) return null;

  for (const c of candidates) {
    try {
      c.width = widthOf(c.path);
    } catch {
      c.width = 0;
    }
  }

  candidates.sort((a, b) => b.width - a.width || b.rank - a.rank);

  const chosen = candidates[0];

  // Policy enforcement log
  if (!chosen.path.endsWith('.png')) {
    console.warn(
      `  ⚠ ${id}: using legacy source (${chosen.path}). PNG master required for v2.0 (frame-less square).`,
    );
  }

  return chosen.path;
}

function widthOf(file) {
  return Number(execFileSync('identify', ['-format', '%w', file]).toString().trim());
}

function convert(from, to, px, quality) {
  execFileSync('convert', [
    from,
    // "…>" only ever shrinks. A 512px source stays 512px rather than being
    // upscaled into a blurrier, larger file.
    '-resize',
    `${px}x${px}>`,
    '-quality',
    String(quality),
    '-define',
    'webp:method=6',
    to,
  ]);
}

function main() {
  const onlyArg = process.argv.find((a) => a.startsWith('--only='));
  const only = onlyArg ? new Set(onlyArg.split('=')[1].split(',')) : null;

  mkdirSync(OUT, { recursive: true });
  mkdirSync(OUT_HI, { recursive: true });

  const profiles = createAllProfiles();
  let built = 0;
  let missing = 0;

  for (const c of profiles) {
    if (only && !only.has(c.id)) continue;
    const from = sourceFor(c.id);
    if (!from) {
      console.error(`  ! no source for ${c.id}`);
      missing += 1;
      continue;
    }
    const thumb = join(OUT, `${c.id}.webp`);
    const hi = join(OUT_HI, `${c.id}.webp`);
    convert(from, thumb, THUMB_PX, THUMB_QUALITY);
    convert(from, hi, HI_PX, HI_QUALITY);
    built += 1;
    const kb = (n) => `${(statSync(n).size / 1024).toFixed(0)}KB`;
    console.log(
      `  ${c.id.padEnd(16)} ${String(widthOf(from)).padStart(4)}px src  ->  ` +
        `thumb ${kb(thumb).padStart(6)}  hi ${kb(hi).padStart(6)}`,
    );
  }

  // Prune anything the catalogue no longer references. Portrait art is
  // reference-driven now: an id that gains painted art leaves its old
  // procedural SVG behind, and those were quietly accumulating in the
  // deployed payload.
  if (!only) {
    const keep = new Set(profiles.map((c) => `${c.id}.webp`));
    let pruned = 0;
    for (const f of readdirSync(OUT)) {
      if (f === 'hi' || keep.has(f)) continue;
      rmSync(join(OUT, f));
      pruned += 1;
    }
    for (const f of readdirSync(OUT_HI)) {
      if (keep.has(f)) continue;
      rmSync(join(OUT_HI, f));
      pruned += 1;
    }
    if (pruned) console.log(`\n  pruned ${pruned} unreferenced file(s)`);
  }

  console.log(`\nBuilt ${built} portrait(s) in two tiers.`);
  if (missing) {
    console.error(`${missing} character(s) had no source image.`);
    process.exit(1);
  }
}

if (process.argv[1] && process.argv[1].endsWith('build-portraits.js')) main();
