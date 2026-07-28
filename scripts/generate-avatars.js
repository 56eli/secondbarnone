#!/usr/bin/env node
/**
 * Deterministic SVG avatar generator — v2 "painterly" edition.
 *
 * Produces circular, richly-shaded illustrated portraits in a style that sits
 * comfortably next to the hand-painted WebP portraits (Léon, Kaden, Sato, …).
 * The SVG uses gradients, soft shading, varied hairstyles and accessories to
 * give each character a distinctive face while staying under ~3 KB each.
 *
 * Deterministic: the same id always yields the same portrait, so regenerating
 * never churns unrelated diffs.
 *
 * Characters listed in BESPOKE keep their painted WebP and are skipped.
 * Bots render as machines; Cat renders as a cat.
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
  'kaden', 'sato', 'alex', 'ethan', 'matt', 'artem', 'klaudia', 'brian',
  'susan', 'hawkinstv', 'ricolewis', 'emily', 'kate',
  'yun', 'marlies', 'yume', 'mateo', 'luca', 'cheezl', 'joar',
  'brock_lee', 'ahyeon', 'renata', 'siekamcebule', 'lou',
  'baris', 'stephen', 'iulian',
  'tarrasqu', 'friend', 'nestomalt', 'self', 'daniela', 'crveni',
  'gordon', 'oh', 'ricardoea', 'speedfire', 'scatmandu', 'cat',
  'hanans', 'kaschem', 'vanna', 'sir_cruds',
  'qustoge', 'groovyphoenix', 'cary', 'aril_stellar', 'alvigunilla', 'fraghis',
  'mrone', 'raul', 'marlene_xoxo', 'diamndsdancin',
  'seth', 'kopung', 'isra', 'kobideh', 'stijn12d', 'andre_watson',
]);

/**
 * True when a painted source image exists for this id, in which case the
 * procedural avatar must not be generated. Checked against the filesystem so
 * the generator cannot drift out of sync with the art the way the hardcoded
 * BESPOKE list did.
 */
function hasPaintedArt(id) {
  return existsSync(join(OUT, `${id}.png`)) || existsSync(join(OUT, `${id}.webp`));
}

/** Characters rendered as machines rather than people. */
const BOTS = new Set(['carl_bot', 'docbot']);

/** Rendered as a cat. */
const ANIMALS = new Set(['cat']);

mkdirSync(OUT, { recursive: true });

// ----------------------------------------------------------------- hashing

/** FNV-1a — stable across platforms. */
function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

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
    chance(p) { return (this.next() % 1000) < p * 1000; },
  };
}

// ---------------------------------------------------------------- palettes

/**
 * Backdrop palettes — each entry is [outer dark, mid-tone, warm highlight]
 * designed to feel like an out-of-focus environment with warm painterly bokeh.
 */
const BACKDROPS = [
  ['#1f2e1d', '#486042', '#b89a5c'], // olive forest
  ['#1c2438', '#3c4a6b', '#c29a63'], // dusk blue
  ['#2e1b1b', '#5e3636', '#c5875b'], // tavern red
  ['#1b2e30', '#3b5f63', '#9bb678'], // teal evening
  ['#2b2518', '#5c4b2d', '#d4a86a'], // candlelit amber
  ['#261a2e', '#4a335e', '#b08fc7'], // dusk violet
  ['#1d2b3a', '#34516b', '#e0a368'], // harbour blue
  ['#3a2416', '#6b4328', '#d9985a'], // whiskey
  ['#21311f', '#3f5d38', '#a8b56a'], // moss
  ['#2d1a2b', '#5c3350', '#d08aa8'], // rose dusk
  ['#1a2c34', '#2f5561', '#7bb0b3'], // cool teal
  ['#302a1a', '#5d4e2d', '#c9a455'], // parchment
];

const SKINS = [
  { base: '#f3ccaa', shade: '#c89772', blush: '#e5a989' },
  { base: '#e5b48a', shade: '#b7815c', blush: '#d18c6a' },
  { base: '#c68a5f', shade: '#8f5c3c', blush: '#a96a48' },
  { base: '#a97048', shade: '#76462a', blush: '#8c5736' },
  { base: '#885535', shade: '#5d3820', blush: '#6e4327' },
  { base: '#5f3c24', shade: '#3d2516', blush: '#4c2d1c' },
  { base: '#f8d8ba', shade: '#d3a682', blush: '#efb59a' },
  { base: '#d59d71', shade: '#9c6a46', blush: '#bb7f58' },
  { base: '#8d5c39', shade: '#603b22', blush: '#70462a' },
  { base: '#6f4628', shade: '#462a17', blush: '#58351e' },
];

const HAIRS = [
  '#1a110c', '#241510', '#3b1f0f', '#5a2e1c', '#7a4622',
  '#9e6a33', '#c2903f', '#505055', '#88888f', '#c2c2c8',
  '#3a1845', '#1a3347', '#6a2222', '#234169', '#b64a2d',
  '#d4b07a', '#3a2a1a', '#4c1f1f',
];

const GARMENTS = [
  ['#3f6548', '#29412e'], ['#364c66', '#223246'],
  ['#61442d', '#3f2c1c'], ['#543764', '#352340'],
  ['#63333d', '#401e26'], ['#3c5668', '#253642'],
  ['#4d572f', '#31381e'], ['#685733', '#40351f'],
  ['#336355', '#203f36'], ['#483865', '#2d2340'],
  ['#66384a', '#42222f'], ['#384565', '#232c42'],
  ['#7a4f2e', '#4e311c'], ['#2e3f4f', '#1c2833'],
  ['#523f2a', '#33271a'], ['#6b3c2f', '#45241c'],
  ['#425a3a', '#2a3825'], ['#3a3052', '#231c32'],
];

/** Warm/cool accent colours for accessories / linings. */
const ACCENTS = ['#e6c66b','#7fd4a8','#e69a6b','#9ab8e6','#e67f9a','#c9a8e6','#d8c088','#8ad1b8','#c7b07a','#e8a67b'];

// ------------------------------------------------------------ face pieces

/**
 * Each hair style defines both a back-layer (behind head, for long hair that
 * falls past the jaw) and a front-layer (bangs/top). If a style has no back
 * layer its back string is ''.
 */
function hairPath(style, hairColor, hairShade) {
  switch (style) {
    case 0: // short crop
      return { back: '', front: `
        <path d="M40 54 Q40 24 64 22 Q90 22 88 54 Q86 40 72 32 Q64 28 54 34 Q44 40 40 54Z" fill="${hairColor}"/>
        <path d="M48 36 Q58 30 66 32 Q78 34 82 44 Q74 38 62 37 Q52 39 48 44Z" fill="${hairShade}" opacity="0.55"/>` };
    case 1: // long, past shoulders
      return { back: `<path d="M30 66 Q28 20 64 18 Q100 20 98 66 L100 108 Q92 88 88 76 L88 58 Q64 50 40 58 L40 76 Q36 88 30 108Z" fill="${hairColor}"/>`,
               front: `<path d="M40 46 Q42 22 64 22 Q86 22 88 46 Q82 34 64 32 Q46 34 40 46Z" fill="${hairColor}"/>
        <path d="M44 40 Q54 30 66 30 Q80 32 84 44 Q74 34 64 33 Q52 35 44 42Z" fill="${hairShade}" opacity="0.45"/>` };
    case 2: // bun
      return { back: '', front: `
        <ellipse cx="64" cy="32" rx="21" ry="13" fill="${hairColor}"/>
        <circle cx="64" cy="17" r="11" fill="${hairColor}"/>
        <path d="M55 30 Q64 26 73 30 Q70 36 64 37 Q58 36 55 30Z" fill="${hairShade}" opacity="0.4"/>
        <path d="M57 14 Q64 10 71 14 Q68 20 64 20 Q60 20 57 14Z" fill="${hairShade}" opacity="0.4"/>` };
    case 3: // curly / afro
      return { back: '', front: `
        <circle cx="46" cy="30" r="13" fill="${hairColor}"/>
        <circle cx="60" cy="22" r="14" fill="${hairColor}"/>
        <circle cx="76" cy="26" r="13" fill="${hairColor}"/>
        <circle cx="52" cy="40" r="11" fill="${hairColor}"/>
        <circle cx="74" cy="40" r="11" fill="${hairColor}"/>
        <circle cx="64" cy="32" r="12" fill="${hairShade}" opacity="0.35"/>` };
    case 4: // side-part
      return { back: '', front: `
        <path d="M42 42 Q44 20 64 20 Q88 20 88 42 Q82 30 70 28 Q58 30 48 36 Q44 38 42 42Z" fill="${hairColor}"/>
        <path d="M52 32 Q64 26 78 30 Q70 34 60 34 Q54 34 52 38Z" fill="${hairShade}" opacity="0.5"/>` };
    case 5: // bald / shaved
      return { back: '', front: `
        <path d="M48 42 Q50 30 64 30 Q78 30 80 42 Q70 36 64 36 Q58 36 48 42Z" fill="${hairColor}" opacity="0.25"/>` };
    case 6: // twin tails
      return { back: `<ellipse cx="28" cy="66" rx="12" ry="24" fill="${hairColor}"/><ellipse cx="100" cy="66" rx="12" ry="24" fill="${hairColor}"/>`,
               front: `<path d="M40 44 Q42 20 64 20 Q86 20 88 44 Q78 30 64 29 Q50 30 40 44Z" fill="${hairColor}"/>
        <circle cx="43" cy="26" r="8" fill="${hairColor}"/>
        <circle cx="85" cy="26" r="8" fill="${hairColor}"/>` };
    case 7: // topknot / undercut
      return { back: `<path d="M46 44 Q48 30 64 28 Q80 30 82 44 Z" fill="${hairShade}" opacity="0.8"/>`,
               front: `<path d="M46 40 Q48 22 64 22 Q80 22 82 40 Q70 30 64 30 Q56 32 46 40Z" fill="${hairColor}"/>
        <ellipse cx="64" cy="15" rx="8" ry="10" fill="${hairColor}"/>` };
    case 8: // wavy bob
      return { back: `<path d="M34 60 Q32 24 64 22 Q96 24 94 60 Q94 74 90 82 L88 58 Q64 50 40 58 L38 82 Q34 74 34 60Z" fill="${hairColor}"/>`,
               front: `<path d="M40 42 Q44 22 64 22 Q84 22 88 42 Q80 32 64 32 Q48 32 40 42Z" fill="${hairColor}"/>
        <path d="M86 50 Q88 62 84 74" stroke="${hairShade}" stroke-width="1.5" fill="none" opacity="0.4"/>
        <path d="M42 50 Q40 62 44 74" stroke="${hairShade}" stroke-width="1.5" fill="none" opacity="0.4"/>` };
    case 9: // slicked back (older / scholarly)
      return { back: '', front: `
        <path d="M42 50 Q42 20 64 18 Q86 20 86 50 Q84 30 74 28 Q64 26 54 28 Q44 30 42 50Z" fill="${hairColor}"/>
        <path d="M48 30 Q64 22 78 30 Q72 36 64 36 Q56 36 48 30Z" fill="${hairShade}" opacity="0.5"/>` };
    case 10: // headband / flowing
      return { back: `<path d="M30 70 Q28 22 64 20 Q100 22 98 70 L100 110 Q90 86 86 70 L86 52 Q64 46 40 52 L40 70 Q36 86 28 110Z" fill="${hairColor}"/>`,
               front: `<path d="M40 44 Q44 22 64 22 Q84 22 88 44 Q80 36 64 35 Q48 36 40 44Z" fill="${hairColor}"/>
        <rect x="38" y="36" width="52" height="5" rx="2" fill="${hairShade}" opacity="0.55"/>` };
    case 11: // mohawk / punk
      return { back: `<path d="M50 48 Q52 30 64 24 Q76 30 78 48 Z" fill="${hairShade}" opacity="0.7"/>`,
               front: `<path d="M56 44 Q58 14 64 12 Q70 14 72 44 Z" fill="${hairColor}"/>
        <path d="M40 48 Q44 42 56 44" stroke="${hairColor}" stroke-width="4" fill="none" stroke-linecap="round"/>
        <path d="M88 48 Q84 42 72 44" stroke="${hairColor}" stroke-width="4" fill="none" stroke-linecap="round"/>` };
    default:
      return { back: '', front: `<ellipse cx="64" cy="34" rx="22" ry="15" fill="${hairColor}"/>` };
  }
}

function eyes(style, skinShade) {
  const eyeWhite = '#f6f0e2';
  const iris = ['#4b3520','#2a1a10','#3a5638','#3a5878','#5a4225','#6a7a54','#2e4055','#7a4a28'][style % 8];
  switch (style % 5) {
    case 0: // standard round
      return `
        <ellipse cx="54" cy="49" rx="4.6" ry="3.2" fill="${eyeWhite}"/>
        <ellipse cx="74" cy="49" rx="4.6" ry="3.2" fill="${eyeWhite}"/>
        <circle cx="54" cy="49" r="3" fill="${iris}"/>
        <circle cx="74" cy="49" r="3" fill="${iris}"/>
        <circle cx="54" cy="48" r="1.2" fill="#111"/>
        <circle cx="74" cy="48" r="1.2" fill="#111"/>
        <circle cx="55.1" cy="47.5" r="0.9" fill="#fff"/>
        <circle cx="75.1" cy="47.5" r="0.9" fill="#fff"/>
        <path d="M49 48 Q54 44 59 48" stroke="${shade(skinShade,-10)}" stroke-width="1.4" fill="none" stroke-linecap="round"/>
        <path d="M69 48 Q74 44 79 48" stroke="${shade(skinShade,-10)}" stroke-width="1.4" fill="none" stroke-linecap="round"/>`;
    case 1: // closed / serene
      return `
        <path d="M49 50 Q54 53 59 50" stroke="#3a2418" stroke-width="2" fill="none" stroke-linecap="round"/>
        <path d="M69 50 Q74 53 79 50" stroke="#3a2418" stroke-width="2" fill="none" stroke-linecap="round"/>`;
    case 2: // wide, bright
      return `
        <ellipse cx="54" cy="49" rx="5" ry="3.6" fill="${eyeWhite}"/>
        <ellipse cx="74" cy="49" rx="5" ry="3.6" fill="${eyeWhite}"/>
        <circle cx="54" cy="49" r="3.3" fill="${iris}"/>
        <circle cx="74" cy="49" r="3.3" fill="${iris}"/>
        <circle cx="54" cy="48.5" r="1.4" fill="#111"/>
        <circle cx="74" cy="48.5" r="1.4" fill="#111"/>
        <circle cx="55.5" cy="47.5" r="1.1" fill="#fff"/>
        <circle cx="75.5" cy="47.5" r="1.1" fill="#fff"/>`;
    case 3: // narrow / focused (older)
      return `
        <path d="M49 49 L59 48" stroke="#2a1810" stroke-width="2.5" stroke-linecap="round"/>
        <path d="M69 48 L79 49" stroke="#2a1810" stroke-width="2.5" stroke-linecap="round"/>
        <ellipse cx="54" cy="50" rx="2" ry="1" fill="${iris}"/>
        <ellipse cx="74" cy="50" rx="2" ry="1" fill="${iris}"/>`;
    default: // downturned / kind
      return `
        <ellipse cx="54" cy="49" rx="4.4" ry="3" fill="${eyeWhite}"/>
        <ellipse cx="74" cy="49" rx="4.4" ry="3" fill="${eyeWhite}"/>
        <circle cx="54" cy="49" r="2.9" fill="${iris}"/>
        <circle cx="74" cy="49" r="2.9" fill="${iris}"/>
        <circle cx="54" cy="48" r="1.1" fill="#111"/>
        <circle cx="74" cy="48" r="1.1" fill="#111"/>
        <path d="M49 47 Q54 44 59 49" stroke="${shade(skinShade,-10)}" stroke-width="1.3" fill="none" stroke-linecap="round"/>
        <path d="M69 49 Q74 44 79 47" stroke="${shade(skinShade,-10)}" stroke-width="1.3" fill="none" stroke-linecap="round"/>`;
  }
}

function nose(skinShade) {
  return `
    <path d="M64 50 Q62 57 60 60 Q62 62 64 62 Q66 62 68 60 Q66 57 64 50Z" fill="${skinShade}" opacity="0.35"/>
    <ellipse cx="61" cy="60" rx="0.9" ry="0.6" fill="${shade(skinShade,-20)}" opacity="0.5"/>
    <ellipse cx="67" cy="60" rx="0.9" ry="0.6" fill="${shade(skinShade,-20)}" opacity="0.5"/>`;
}

function mouth(style, skinShade, accent) {
  const lip = shade(skinShade,-30);
  switch (style % 5) {
    case 0: // soft smile
      return `
        <path d="M56 63 Q64 69 72 63" stroke="${lip}" stroke-width="2" fill="none" stroke-linecap="round"/>
        <path d="M58 63 Q64 66 70 63" fill="${lip}" opacity="0.35"/>`;
    case 1: // neutral
      return `<path d="M57 64 L71 64" stroke="${lip}" stroke-width="2" fill="none" stroke-linecap="round"/>`;
    case 2: // open / laughing
      return `<path d="M58 63 Q64 70 70 63 Q68 67 64 68 Q60 67 58 63Z" fill="${shade(lip,-20)}"/>
              <path d="M59 63 L69 63" stroke="#fff" stroke-width="1" opacity="0.7"/>`;
    case 3: // small smirk
      return `<path d="M57 64 Q64 66 72 62" stroke="${lip}" stroke-width="2" fill="none" stroke-linecap="round"/>`;
    default: // gentle, lips closed
      return `<path d="M57 63 Q64 66 71 63" stroke="${lip}" stroke-width="1.8" fill="none" stroke-linecap="round"/>
              <path d="M57 64 Q64 65 71 64" stroke="${lip}" stroke-width="1.2" fill="none" stroke-linecap="round" opacity="0.7"/>`;
  }
}

function accessory(style, accent, garmentDark) {
  switch (style % 8) {
    case 0: return '';
    case 1: return '';
    case 2: // round glasses
      return `<g fill="none" stroke="${accent}" stroke-width="1.4">
        <circle cx="54" cy="49" r="7"/><circle cx="74" cy="49" r="7"/>
        <path d="M61 49 L67 49"/>
        <path d="M47 47 Q42 44 39 46"/><path d="M81 47 Q86 44 89 46"/>
      </g>`;
    case 3: // headphones
      return `<path d="M36 48 Q36 22 64 20 Q92 22 92 48" stroke="${accent}" stroke-width="3" fill="none"/>
        <rect x="30" y="46" width="9" height="16" rx="4.5" fill="${accent}"/>
        <rect x="89" y="46" width="9" height="16" rx="4.5" fill="${accent}"/>
        <rect x="32" y="48" width="5" height="12" rx="2" fill="${garmentDark}"/>
        <rect x="91" y="48" width="5" height="12" rx="2" fill="${garmentDark}"/>`;
    case 4: // hoop earring
      return `<circle cx="42" cy="56" r="2.8" fill="none" stroke="${accent}" stroke-width="1.4"/>
              <circle cx="86" cy="56" r="2.8" fill="none" stroke="${accent}" stroke-width="1.4"/>`;
    case 5: // beanie
      return `<path d="M34 42 Q34 16 64 14 Q94 16 94 42 Q94 34 86 30 Q74 24 64 24 Q54 24 42 30 Q34 34 34 42Z" fill="${accent}"/>
        <path d="M34 40 Q64 34 94 40" stroke="${garmentDark}" stroke-width="2" fill="none" opacity="0.5"/>
        <circle cx="64" cy="14" r="4" fill="${garmentDark}"/>`;
    case 6: // necklace with pendant
      return `<path d="M48 66 Q64 84 80 66" stroke="${accent}" stroke-width="1.2" fill="none"/>
              <circle cx="64" cy="82" r="2.8" fill="${accent}"/>`;
    case 7: // earrings (small studs)
      return `<circle cx="41" cy="55" r="1.5" fill="${accent}"/>
              <circle cx="87" cy="55" r="1.5" fill="${accent}"/>`;
    default: return '';
  }
}

/** Darken / lighten a hex colour by percentage. */
function shade(hex, pct) {
  const h = hex.replace('#','');
  const r = parseInt(h.substring(0,2),16);
  const g = parseInt(h.substring(2,4),16);
  const b = parseInt(h.substring(4,6),16);
  const adj = (c) => {
    const v = pct < 0 ? Math.round(c * (100 + pct) / 100) : Math.round(c + (255 - c) * pct / 100);
    return Math.max(0, Math.min(255, v));
  };
  const toHex = (n) => n.toString(16).padStart(2,'0');
  return `#${toHex(adj(r))}${toHex(adj(g))}${toHex(adj(b))}`;
}

// ------------------------------------------------------------- renderers

const SVG_OPEN = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img">
<defs>
  <radialGradient id="bg" cx="0.5" cy="0.35" r="0.75">
    <stop offset="0" stop-color="BG_HI"/>
    <stop offset="0.55" stop-color="BG_MID"/>
    <stop offset="1" stop-color="BG_LO"/>
  </radialGradient>
  <radialGradient id="faceHi" cx="0.35" cy="0.25" r="0.85">
    <stop offset="0" stop-color="FACEHI" stop-opacity="0.45"/>
    <stop offset="1" stop-color="FACEHI" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="garmentGrad" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="GARMLT"/>
    <stop offset="1" stop-color="GARM DK"/>
  </linearGradient>
  <clipPath id="circle"><circle cx="64" cy="64" r="64"/></clipPath>
  <filter id="paint" x="0%" y="0%" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="SEED"/>
    <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.14 0"/>
    <feComposite in2="SourceGraphic" operator="in"/>
  </filter>
</defs>
<g clip-path="url(#circle)">
<rect width="128" height="128" fill="url(#bg)"/>`;

const SVG_CLOSE = `</g>
<circle cx="64" cy="64" r="63" fill="none" stroke="rgba(0,0,0,0.35)" stroke-width="1"/>
</svg>`;

function bokeh(colour) {
  // A few soft highlight spots to mimic a painted bokeh backdrop.
  return `
    <circle cx="${20 + (hash(colour) % 30)}" cy="${28 + (hash(colour) % 24)}" r="10" fill="${colour}" opacity="0.18"/>
    <circle cx="${88 + (hash(colour+'a') % 24)}" cy="${40 + (hash(colour+'b') % 30)}" r="14" fill="${colour}" opacity="0.12"/>
    <circle cx="${30 + (hash(colour+'c') % 18)}" cy="${96 - (hash(colour+'d') % 20)}" r="8" fill="${colour}" opacity="0.1"/>`;
}

function renderPerson(id) {
  const p = picker(id);
  const [bgLo, bgMid, bgHi] = p.pick(BACKDROPS);
  const skin = p.pick(SKINS);
  const hair = p.pick(HAIRS);
  const hairShade = shade(hair, -25);
  const [garmLt, garmDk] = p.pick(GARMENTS);
  const accent = p.pick(ACCENTS);

  const hairStyle = p.range(0, 11);
  const eyeStyle = p.range(0, 4);
  const mouthStyle = p.range(0, 4);
  const accStyle = p.range(0, 7);
  const seed = p.next() % 1000;

  const age = p.chance(0.2); // 20% chance of older features
  const blush = skin.blush;

  const hp = hairPath(hairStyle, hair, hairShade);

  let svg = SVG_OPEN
    .replace('BG_HI', bgHi).replace('BG_MID', bgMid).replace('BG_LO', bgLo)
    .replace('FACEHI', shade(skin.base, 25)).replace('SEED', seed)
    .replace('GARMLT', garmLt).replace('GARM DK', garmDk);

  svg += bokeh(shade(bgHi, 10));

  // Garment (shoulders/upper torso)
  svg += `
    <path d="M0 128 Q0 92 28 86 Q42 82 52 88 Q58 94 64 94 Q70 94 76 88 Q86 82 100 86 Q128 92 128 128 Z" fill="url(#garmentGrad)"/>
    <path d="M24 90 Q40 86 50 92 Q58 98 64 98" stroke="${shade(garmDk,-15)}" stroke-width="0.8" fill="none" opacity="0.5"/>
    <path d="M104 90 Q88 86 78 92 Q70 98 64 98" stroke="${shade(garmDk,-15)}" stroke-width="0.8" fill="none" opacity="0.5"/>`;

  // Neck
  svg += `<path d="M54 74 Q54 90 64 92 Q74 90 74 74 Z" fill="${skin.base}"/>
    <path d="M56 78 Q58 86 64 88 Q70 86 72 78" fill="${skin.shade}" opacity="0.35"/>`;

  // Back hair (long hair behind body)
  if (hp.back) svg += hp.back;

  // Ears
  svg += `<ellipse cx="40" cy="53" rx="4" ry="6" fill="${skin.base}"/>
    <ellipse cx="88" cy="53" rx="4" ry="6" fill="${skin.base}"/>
    <ellipse cx="40" cy="54" rx="2" ry="3.5" fill="${skin.shade}" opacity="0.4"/>
    <ellipse cx="88" cy="54" rx="2" ry="3.5" fill="${skin.shade}" opacity="0.4"/>`;

  // Head
  svg += `<ellipse cx="64" cy="52" rx="24" ry="28" fill="${skin.base}"/>`;
  // Warm highlight from the upper-left key light (gives painterly volume).
  svg += `<ellipse cx="55" cy="42" rx="16" ry="12" fill="url(#faceHi)"/>`;

  // Face shading (jaw, side of nose, temples)
  svg += `
    <path d="M42 50 Q40 68 52 80 Q58 80 60 76 Q52 70 50 62 Q48 52 46 46Z" fill="${skin.shade}" opacity="0.3"/>
    <path d="M86 50 Q88 68 76 80 Q70 80 68 76 Q76 70 78 62 Q80 52 82 46Z" fill="${skin.shade}" opacity="0.25"/>
    <ellipse cx="64" cy="70" rx="14" ry="6" fill="${skin.shade}" opacity="0.2"/>`;

  // Age wrinkles
  if (age) {
    svg += `<path d="M48 40 Q54 38 60 40" stroke="${skin.shade}" stroke-width="0.6" fill="none" opacity="0.4"/>
      <path d="M68 40 Q74 38 80 40" stroke="${skin.shade}" stroke-width="0.6" fill="none" opacity="0.4"/>
      <path d="M56 70 Q64 72 72 70" stroke="${skin.shade}" stroke-width="0.5" fill="none" opacity="0.3"/>`;
  }

  // Blush
  svg += `<ellipse cx="50" cy="60" rx="5" ry="2.5" fill="${blush}" opacity="0.35"/>
    <ellipse cx="78" cy="60" rx="5" ry="2.5" fill="${blush}" opacity="0.35"/>`;

  // Features
  svg += eyes(eyeStyle, skin.shade);
  svg += nose(skin.shade);
  svg += mouth(mouthStyle, skin.shade, accent);

  // Brows
  const brow = shade(hair, -10);
  svg += `<path d="M48 43 Q54 40 60 43" stroke="${brow}" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    <path d="M68 43 Q74 40 80 43" stroke="${brow}" stroke-width="1.8" fill="none" stroke-linecap="round"/>`;

  // Front hair
  if (hp.front) svg += hp.front;

  // Accessory
  svg += accessory(accStyle, accent, garmDk);

  // Subtle rim light
  svg += `<ellipse cx="64" cy="30" rx="26" ry="32" fill="none" stroke="rgba(255,230,180,0.18)" stroke-width="1.2"/>`;

  // Subtle painterly grain overlay (a translucent noise layer).
  svg += `<g filter="url(#paint)" opacity="0.45">
    <rect width="128" height="128" fill="#808080"/>
  </g>`;

  svg += SVG_CLOSE;

  // Fix the light-face highlight colour (FACEHI token is literal at this point).
  svg = svg.replace(/FACEHI/g, shade(skin.base, 25));
  // Swap the dark-garment token (the id had a space so the literal was "GARM DK").
  svg = svg.replace(/GARM DK/g, garmDk);
  // feTurbulence seed must be an integer.
  svg = svg.replace(/SEED/g, seed);

  // Ensure gradient/filter ids are unique per portrait so multiple SVGs can
  // coexist in one document without id collisions.
  const uniq = (key, prefix) => {
    const uid = prefix + seed.toString(36);
    svg = svg.split(`id="${key}"`).join(`id="${uid}"`);
    svg = svg.split(`url(#${key})`).join(`url(#${uid})`);
  };
  uniq('garmentGrad', 'g');
  uniq('bg', 'b');
  uniq('faceHi', 'f');
  uniq('paint', 'p');
  uniq('circle', 'c');

  return svg;
}

function renderBot(id) {
  const p = picker(id);
  const [bgLo, bgMid, bgHi] = p.pick(BACKDROPS);
  const accent = p.pick(ACCENTS);
  const shell = p.pick(['#8a8f9a', '#6f7681', '#9aa1ad', '#5f6670']);
  const shellDk = shade(shell, -25);
  const eyeShape = p.range(0, 2);
  const seed = p.next() % 1000;

  const led = eyeShape === 0
    ? `<circle cx="52" cy="52" r="6" fill="${accent}"/><circle cx="76" cy="52" r="6" fill="${accent}"/>
       <circle cx="52" cy="50" r="2" fill="#fff" opacity="0.7"/><circle cx="76" cy="50" r="2" fill="#fff" opacity="0.7"/>`
    : eyeShape === 1
      ? `<rect x="44" y="48" width="16" height="8" rx="4" fill="${accent}"/><rect x="68" y="48" width="16" height="8" rx="4" fill="${accent}"/>`
      : `<rect x="40" y="48" width="48" height="10" rx="5" fill="${accent}"/>
         <rect x="46" y="50" width="36" height="2" rx="1" fill="#fff" opacity="0.5"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img">
<defs>
<radialGradient id="bgg${seed}" cx="0.5" cy="0.35" r="0.75">
<stop offset="0" stop-color="${bgHi}"/><stop offset="0.55" stop-color="${bgMid}"/><stop offset="1" stop-color="${bgLo}"/>
</radialGradient>
<linearGradient id="shell${seed}" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="${shell}"/><stop offset="1" stop-color="${shellDk}"/>
</linearGradient>
<clipPath id="cc${seed}"><circle cx="64" cy="64" r="64"/></clipPath>
</defs>
<g clip-path="url(#cc${seed})">
<rect width="128" height="128" fill="url(#bgg${seed})"/>
${bokeh(bgHi)}
<rect x="22" y="78" width="84" height="50" rx="8" fill="url(#shell${seed})"/>
<rect x="32" y="30" width="64" height="58" rx="14" fill="url(#shell${seed})"/>
<rect x="36" y="34" width="56" height="50" rx="10" fill="${shade(shell,-10)}"/>
${led}
<rect x="50" y="66" width="28" height="4" rx="2" fill="${shellDk}"/>
<circle cx="64" cy="24" r="4" fill="${accent}"/>
<rect x="62" y="24" width="4" height="10" fill="${shellDk}"/>
<rect x="30" y="60" width="4" height="18" rx="2" fill="${shellDk}"/>
<rect x="94" y="60" width="4" height="18" rx="2" fill="${shellDk}"/>
</g>
<circle cx="64" cy="64" r="63" fill="none" stroke="rgba(0,0,0,0.35)" stroke-width="1"/>
</svg>`;
}

function renderCat(id) {
  const p = picker(id);
  const [bgLo, bgMid, bgHi] = p.pick(BACKDROPS);
  const fur = p.pick(['#d8a87a','#8a5d3b','#3a2a1c','#c9c4b8','#e5c28a','#6e4a2c']);
  const furDk = shade(fur, -20);
  const furLt = shade(fur, 20);
  const seed = p.next() % 1000;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img">
<defs>
<radialGradient id="bgg${seed}" cx="0.5" cy="0.35" r="0.75">
<stop offset="0" stop-color="${bgHi}"/><stop offset="0.55" stop-color="${bgMid}"/><stop offset="1" stop-color="${bgLo}"/>
</radialGradient>
<clipPath id="cc${seed}"><circle cx="64" cy="64" r="64"/></clipPath>
</defs>
<g clip-path="url(#cc${seed})">
<rect width="128" height="128" fill="url(#bgg${seed})"/>
${bokeh(bgHi)}
<ellipse cx="64" cy="108" rx="50" ry="24" fill="${furDk}" opacity="0.35"/>
<!-- ears -->
<path d="M36 56 L28 28 L54 46 Z" fill="${fur}"/>
<path d="M92 56 L100 28 L74 46 Z" fill="${fur}"/>
<path d="M40 52 L34 38 L48 46 Z" fill="${furLt}" opacity="0.6"/>
<path d="M88 52 L94 38 L80 46 Z" fill="${furLt}" opacity="0.6"/>
<!-- head -->
<circle cx="64" cy="64" r="30" fill="${fur}"/>
<!-- cheeks -->
<circle cx="50" cy="72" r="10" fill="${furLt}" opacity="0.4"/>
<circle cx="78" cy="72" r="10" fill="${furLt}" opacity="0.4"/>
<!-- eyes -->
<ellipse cx="52" cy="60" rx="4" ry="6" fill="#c2a53a"/>
<ellipse cx="76" cy="60" rx="4" ry="6" fill="#c2a53a"/>
<ellipse cx="52" cy="60" rx="1.2" ry="5" fill="#111"/>
<ellipse cx="76" cy="60" rx="1.2" ry="5" fill="#111"/>
<!-- nose + mouth -->
<path d="M62 70 L66 70 L64 74 Z" fill="#c98a8a"/>
<path d="M64 74 Q60 78 58 76" stroke="#3a2010" stroke-width="1.2" fill="none" stroke-linecap="round"/>
<path d="M64 74 Q68 78 70 76" stroke="#3a2010" stroke-width="1.2" fill="none" stroke-linecap="round"/>
<!-- whiskers -->
<path d="M40 72 L24 70 M40 76 L24 78 M88 72 L104 70 M88 76 L104 78" stroke="#fff" stroke-width="0.6" opacity="0.6"/>
</g>
<circle cx="64" cy="64" r="63" fill="none" stroke="rgba(0,0,0,0.35)" stroke-width="1"/>
</svg>`;
}

// --------------------------------------------------------------- driver

const profiles = createAllProfiles();
let written = 0;
let skipped = 0;

for (const c of profiles) {
  const outPath = join(OUT, `${c.id}.svg`);
  // A character with painted art on disk is never overwritten, regardless of
  // what BESPOKE says. The hardcoded set had to be edited by hand every time
  // a portrait was painted, and drifted: as of the July 2026 pass all 78
  // characters have painted art, so this generator now writes nothing unless
  // a new character is added before their portrait exists.
  if (BESPOKE.has(c.id) || hasPaintedArt(c.id)) {
    skipped += 1;
    continue;
  }
  let svg;
  if (BOTS.has(c.id)) svg = renderBot(c.id);
  else if (ANIMALS.has(c.id)) svg = renderCat(c.id);
  else svg = renderPerson(c.id);

  writeFileSync(outPath, svg);
  written += 1;
}

console.log(`Generated ${written} SVG avatars (skipped ${skipped} with painted art).`);
if (written === 0) {
  console.log('Every character has painted art — nothing to stand in for.');
}
