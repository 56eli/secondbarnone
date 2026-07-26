#!/usr/bin/env node
/**
 * Deterministic SVG avatar generator.
 *
 * The cast grew to 77 characters. Hand-drawing or AI-generating a portrait for
 * each would add ~120 MB of source art, so everyone without a bespoke painted
 * portrait gets a generated one instead. Output is:
 *
 *   - deterministic — the same id always yields the same face, so avatars are
 *     stable across runs and diffs stay clean
 *   - distinctive — palette, face, hair, eyes, mouth and accessory are each
 *     drawn from the id hash, giving a large space of combinations
 *   - tiny — roughly 0.6-1.2 KB per file, no optimisation step needed
 *
 * Characters listed in BESPOKE keep their painted portrait and are skipped.
 *
 * Usage: node scripts/generate-avatars.js
 */

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createAllProfiles } from '../docs/js/data/characters.js';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const OUT = join(ROOT, 'assets', 'portraits');

/** Characters with hand-made painted portraits — never overwrite these. */
const BESPOKE = new Set([
  'leon', 'geo', 'lakshay', 'arian', 'simon', 'kaj', 'dorian', 'barret',
  'kaden', 'sato', 'alex',
]);

/** Characters rendered as machines rather than people. */
const BOTS = new Set(['carl_bot', 'docbot']);

/** Rendered as a cat, because she is one. */
const ANIMALS = new Set(['cat']);

// ----------------------------------------------------------------- hashing

/** FNV-1a — stable across platforms, unlike anything using Math.random(). */
function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Deterministic per-id value stream. */
function picker(id) {
  let state = hash(id);
  return {
    next() {
      state ^= state << 13; state >>>= 0;
      state ^= state >>> 17;
      state ^= state << 5; state >>>= 0;
      return state;
    },
    pick(arr) { return arr[this.next() % arr.length]; },
    range(lo, hi) { return lo + (this.next() % (hi - lo + 1)); },
  };
}

// ---------------------------------------------------------------- palettes

const BACKDROPS = [
  ['#2d5a3d', '#1d3b28'], ['#3a3a5c', '#25253d'], ['#5c3a3a', '#3d2525'],
  ['#3a5a5c', '#25393d'], ['#5c503a', '#3d3425'], ['#4a3a5c', '#30253d'],
  ['#2f4858', '#1e2f39'], ['#58402f', '#39291e'], ['#3f5230', '#28351f'],
  ['#523045', '#351f2c'], ['#30454f', '#1f2d34'], ['#4f4630', '#342d1f'],
];

const SKINS = [
  '#f0c9a4', '#e0ac82', '#c68a5f', '#a9673f', '#82502f', '#5c3a22',
  '#f7d9b8', '#d19a6e', '#8d5a38', '#6b452a',
];

const HAIRS = [
  '#1e1410', '#2d1810', '#4a2c17', '#6b3a2a', '#8b5a2b', '#b5813f',
  '#d4a857', '#5a5a5a', '#8a8a8a', '#c9c9c9', '#3d1f4a', '#1f3d4a',
  '#7a2b2b', '#2b4a7a',
];

const GARMENTS = [
  '#4a7c59', '#3d5a7c', '#7c5a3d', '#6b4a7c', '#7c3d4a', '#4a6b7c',
  '#5c6b3d', '#7c6b3d', '#3d7c6b', '#57457c', '#7c4557', '#45577c',
];

const ACCENTS = ['#e6c66b', '#7fd4a8', '#e69a6b', '#9ab8e6', '#e67f9a', '#c9a8e6'];

// ------------------------------------------------------------ face pieces

function hairPath(style, hairColor) {
  switch (style) {
    case 0: // short crop
      return `<ellipse cx="64" cy="34" rx="18" ry="12" fill="${hairColor}"/>`;
    case 1: // long, framing the face
      return `<path d="M42 46 Q40 18 64 18 Q88 18 86 46 L86 68 Q84 44 64 44 Q44 44 42 68 Z" fill="${hairColor}"/>`;
    case 2: // bun
      return `<ellipse cx="64" cy="32" rx="19" ry="12" fill="${hairColor}"/><circle cx="64" cy="17" r="8" fill="${hairColor}"/>`;
    case 3: // curly / afro
      return `<circle cx="50" cy="32" r="12" fill="${hairColor}"/><circle cx="64" cy="26" r="13" fill="${hairColor}"/><circle cx="78" cy="32" r="12" fill="${hairColor}"/>`;
    case 4: // side-part
      return `<path d="M44 40 Q46 20 64 20 Q84 20 84 40 Q74 30 58 32 Q48 33 44 40 Z" fill="${hairColor}"/>`;
    case 5: // bald / shaved — just a shadow
      return `<path d="M46 40 Q50 28 64 28 Q78 28 82 40 Q70 34 64 34 Q58 34 46 40 Z" fill="${hairColor}" opacity="0.35"/>`;
    case 6: // twin buns
      return `<ellipse cx="64" cy="33" rx="18" ry="11" fill="${hairColor}"/><circle cx="45" cy="26" r="7" fill="${hairColor}"/><circle cx="83" cy="26" r="7" fill="${hairColor}"/>`;
    case 7: // topknot / undercut
      return `<path d="M46 38 Q48 24 64 24 Q80 24 82 38 Q64 32 46 38 Z" fill="${hairColor}"/><path d="M60 24 Q64 12 70 20 Q66 18 60 24 Z" fill="${hairColor}"/>`;
    default:
      return `<ellipse cx="64" cy="34" rx="18" ry="12" fill="${hairColor}"/>`;
  }
}

function eyes(style) {
  switch (style) {
    case 0: return `<circle cx="54" cy="46" r="3.6" fill="#241812"/><circle cx="74" cy="46" r="3.6" fill="#241812"/>`;
    case 1: // closed / serene
      return `<path d="M50 46 Q54 50 58 46" stroke="#241812" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="M70 46 Q74 50 78 46" stroke="#241812" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
    case 2: // bright, with catchlights
      return `<circle cx="54" cy="46" r="4.2" fill="#241812"/><circle cx="74" cy="46" r="4.2" fill="#241812"/><circle cx="55.4" cy="44.6" r="1.3" fill="#fff"/><circle cx="75.4" cy="44.6" r="1.3" fill="#fff"/>`;
    default: // narrow / focused
      return `<rect x="50" y="44" width="8" height="3.4" rx="1.7" fill="#241812"/><rect x="70" y="44" width="8" height="3.4" rx="1.7" fill="#241812"/>`;
  }
}

function mouth(style) {
  switch (style) {
    case 0: return `<path d="M56 58 Q64 66 72 58" stroke="#3d211a" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
    case 1: return `<path d="M57 60 L71 60" stroke="#3d211a" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
    case 2: return `<ellipse cx="64" cy="60" rx="4.5" ry="3.2" fill="#3d211a"/>`;
    default: return `<path d="M56 62 Q64 56 72 62" stroke="#3d211a" stroke-width="2.2" fill="none" stroke-linecap="round"/>`;
  }
}

function accessory(style, accent) {
  switch (style) {
    case 0: return ''; // none — keeps the set from feeling gimmicky
    case 1: return ''; //  "
    case 2: // glasses
      return `<g fill="none" stroke="${accent}" stroke-width="2"><circle cx="54" cy="46" r="8"/><circle cx="74" cy="46" r="8"/><path d="M62 46 L66 46"/></g>`;
    case 3: // headphones
      return `<path d="M42 44 Q42 24 64 24 Q86 24 86 44" stroke="${accent}" stroke-width="3" fill="none"/><rect x="38" y="42" width="8" height="14" rx="4" fill="${accent}"/><rect x="82" y="42" width="8" height="14" rx="4" fill="${accent}"/>`;
    case 4: // earring
      return `<circle cx="43" cy="54" r="2.8" fill="${accent}"/>`;
    case 5: // beanie
      return `<path d="M42 38 Q42 20 64 20 Q86 20 86 38 Z" fill="${accent}"/><rect x="40" y="36" width="48" height="6" rx="3" fill="${accent}" opacity="0.75"/>`;
    default: return '';
  }
}

// ------------------------------------------------------------- renderers

function renderPerson(id) {
  const p = picker(id);
  const [bg1, bg2] = p.pick(BACKDROPS);
  const skin = p.pick(SKINS);
  const hair = p.pick(HAIRS);
  const garment = p.pick(GARMENTS);
  const accent = p.pick(ACCENTS);

  const hairStyle = p.range(0, 7);
  const eyeStyle = p.range(0, 3);
  const mouthStyle = p.range(0, 3);
  const accStyle = p.range(0, 5);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img">
<defs><linearGradient id="b" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="${bg1}"/><stop offset="1" stop-color="${bg2}"/>
</linearGradient></defs>
<rect width="128" height="128" rx="16" fill="url(#b)"/>
<ellipse cx="64" cy="96" rx="34" ry="28" fill="${garment}"/>
<circle cx="64" cy="50" r="26" fill="${skin}"/>
${hairPath(hairStyle, hair)}
${eyes(eyeStyle)}
${mouth(mouthStyle)}
${accessory(accStyle, accent)}
</svg>`;
}

function renderBot(id) {
  const p = picker(id);
  const [bg1, bg2] = p.pick(BACKDROPS);
  const accent = p.pick(ACCENTS);
  const shell = p.pick(['#8a8f9a', '#6f7681', '#9aa1ad', '#5f6670']);
  const eyeShape = p.range(0, 2);

  const led = eyeShape === 0
    ? `<circle cx="54" cy="50" r="5" fill="${accent}"/><circle cx="74" cy="50" r="5" fill="${accent}"/>`
    : eyeShape === 1
      ? `<rect x="48" y="46" width="14" height="7" rx="3.5" fill="${accent}"/><rect x="66" y="46" width="14" height="7" rx="3.5" fill="${accent}"/>`
      : `<rect x="46" y="46" width="36" height="8" rx="4" fill="${accent}"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img">
<defs><linearGradient id="b" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="${bg1}"/><stop offset="1" stop-color="${bg2}"/>
</linearGradient></defs>
<rect width="128" height="128" rx="16" fill="url(#b)"/>
<rect x="40" y="86" width="48" height="34" rx="8" fill="${shell}"/>
<line x1="64" y1="20" x2="64" y2="30" stroke="${shell}" stroke-width="3"/>
<circle cx="64" cy="18" r="4" fill="${accent}"/>
<rect x="36" y="30" width="56" height="50" rx="12" fill="${shell}"/>
<rect x="42" y="38" width="44" height="30" rx="7" fill="#1b1f26"/>
${led}
<rect x="54" y="72" width="20" height="3" rx="1.5" fill="#1b1f26" opacity="0.55"/>
</svg>`;
}

function renderCat(id) {
  const p = picker(id);
  const [bg1, bg2] = p.pick(BACKDROPS);
  const fur = p.pick(['#d9a066', '#4a4a4a', '#e8e2d6', '#8a6a4a', '#2f2f2f']);
  const inner = '#e8a9b8';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img">
<defs><linearGradient id="b" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="${bg1}"/><stop offset="1" stop-color="${bg2}"/>
</linearGradient></defs>
<rect width="128" height="128" rx="16" fill="url(#b)"/>
<ellipse cx="64" cy="100" rx="30" ry="24" fill="${fur}"/>
<path d="M40 40 L44 16 L60 30 Z" fill="${fur}"/><path d="M40 38 L43 23 L54 31 Z" fill="${inner}"/>
<path d="M88 40 L84 16 L68 30 Z" fill="${fur}"/><path d="M88 38 L85 23 L74 31 Z" fill="${inner}"/>
<circle cx="64" cy="54" r="26" fill="${fur}"/>
<ellipse cx="53" cy="50" rx="4" ry="5.5" fill="#2a2a1e"/><ellipse cx="75" cy="50" rx="4" ry="5.5" fill="#2a2a1e"/>
<path d="M60 62 L64 66 L68 62 Z" fill="${inner}"/>
<path d="M64 66 Q58 72 52 68 M64 66 Q70 72 76 68" stroke="#2a2a1e" stroke-width="1.8" fill="none" stroke-linecap="round"/>
<path d="M30 56 L46 58 M30 64 L46 63 M98 56 L82 58 M98 64 L82 63" stroke="#2a2a1e" stroke-width="1.4" opacity="0.7" stroke-linecap="round"/>
</svg>`;
}

// --------------------------------------------------------------- generate

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

let written = 0;
let skipped = 0;

for (const c of createAllProfiles()) {
  if (BESPOKE.has(c.id)) { skipped += 1; continue; }

  const svg = BOTS.has(c.id) ? renderBot(c.id)
    : ANIMALS.has(c.id) ? renderCat(c.id)
      : renderPerson(c.id);

  writeFileSync(join(OUT, `${c.id}.svg`), `${svg}\n`, 'utf8');
  written += 1;
}

console.log(`Generated ${written} avatars, skipped ${skipped} bespoke portraits.`);
console.log(`Output: ${OUT}`);
