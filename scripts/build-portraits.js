#!/usr/bin/env node
/**
 * Portrait tier builder.
 *
 * The game needs each portrait at two very different sizes:
 *
 *   thumb  docs/assets/portraits/<id>.webp      288px — every inline use
 *                                                       (HUD 82px, People row
 *                                                       42px, detail 84px)
 *   hi     docs/assets/portraits/hi/<id>.webp  1024px — the tap-to-enlarge
 *                                                       lightbox only
 *
 * Why two tiers: the largest portrait the game ever *inlines* is 84 CSS px, so
 * the 512px sheets we used to ship were ~6x oversized on every screen. The
 * lightbox, by contrast, renders up to 560 CSS px, which is ~1120 physical px
 * on a 2x display — 512px was visibly soft there. Splitting the tiers makes
 * normal play download much less while making the one place that wants detail
 * genuinely sharp. The hi tier is fetched lazily, only when a portrait is
 * actually opened.
 *
 * Source preference per id, best first:
 *   assets/portraits/<id>.png    painted source (1024px for current art)
 *   assets/portraits/<id>.webp   older painted art kept only as 512px WebP
 *   docs/assets/portraits/<id>.webp  last resort (already-deployed sheet)
 *
 * The hi tier never upscales: a 512px-only character gets a 512px hi file,
 * which is still strictly larger than its 288px thumb.
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
const THUMB_QUALITY = 78;
// 896px/q56 was chosen by comparing 100% crops against q68: no visible
// difference in the painted style, ~18% smaller. 896px still covers the
// lightbox's 560 CSS px at 1.6x density, and the whole hi tier fits the
// deployed payload budget alongside the backgrounds.
const HI_QUALITY = 56;

/**
 * Resolve the best on-disk source for a character id.
 *
 * "Best" is the *largest* candidate, not the first format that happens to
 * exist. Three early characters (joar, susan, yume) keep a 160px PNG next to
 * a 512px WebP; a naive png-first probe picked the 160px file and produced a
 * "hi" sheet smaller and blurrier than the thumbnail it was meant to enlarge.
 * Ties break toward PNG, which is the lossless master where both are equal.
 */
export function sourceFor(id, { src = SRC, out = OUT } = {}) {
  const candidates = [
    { path: join(src, `${id}.png`), rank: 2 },
    { path: join(src, `${id}.webp`), rank: 1 },
    { path: join(out, `${id}.webp`), rank: 0 },
  ].filter((c) => existsSync(c.path));
  if (candidates.length === 0) return null;

  for (const c of candidates) c.width = widthOf(c.path);
  candidates.sort((a, b) => (b.width - a.width) || (b.rank - a.rank));
  return candidates[0].path;
}

function widthOf(file) {
  return Number(execFileSync('identify', ['-format', '%w', file]).toString().trim());
}

function convert(from, to, px, quality) {
  execFileSync('convert', [
    from,
    // "…>" only ever shrinks. A 512px source stays 512px rather than being
    // upscaled into a blurrier, larger file.
    '-resize', `${px}x${px}>`,
    '-quality', String(quality),
    '-define', 'webp:method=6',
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
      `  ${c.id.padEnd(16)} ${String(widthOf(from)).padStart(4)}px src  ->  `
      + `thumb ${kb(thumb).padStart(6)}  hi ${kb(hi).padStart(6)}`,
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
