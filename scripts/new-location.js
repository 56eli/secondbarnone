#!/usr/bin/env node
/**
 * Location scaffolder.
 *
 * Adding a location means coordinated edits across three data files plus the
 * art tiers, with a red test suite as the error message. This script does the
 * mechanical 90% and tells you the creative 10% it left: every piece of
 * placeholder copy contains the word PLACEHOLDER so `git grep PLACEHOLDER` is
 * the punch list.
 *
 * ## The cast rule (owner's standing decision)
 *
 * **Cast additions are the repo owner's call. This script cannot and will not
 * create characters.** A new place is staffed by *re-binding* people who
 * already exist — the way Les Mines de la Butte and Le Clos Bénévole are
 * staffed (v2.7). Pass the people who move in via `--characters`; the script
 * re-points their `locationId` and carries their events to the new home,
 * flagging every moved event's fiction for honest re-authoring. If you need
 * somebody who does not exist yet, stop and talk to the owner.
 *
 * What it does:
 *   1. inserts the location definition into data/locations.js
 *   2. re-binds the listed characters (first is the host) to the new place
 *   3. moves their existing event stanzas into the new location's block in
 *      data/events.js, each marked `// PLACEHOLDER-fiction` for re-authoring
 *   4. inserts the host's small-talk block *only if they have none*
 *   5. writes a labelled placeholder background (real art replaces it —
 *      see docs/ART_DIRECTION.md); portraits already exist for living people
 *   6. formats the touched files and runs scripts/validate-content.js
 *
 * Usage:
 *   node scripts/new-location.js \
 *     --id coop_roof \
 *     --name "Le Toit Ouvrier" \
 *     --emoji 🏚️ --district "Belleville" --slot 4 \
 *     --tags community,outdoor,quiet \
 *     --effects 8,-4,-16,4,1 --variance 3,2,5,2,1 \
 *     --unlock-day 18 --unlock-rep 10 \
 *     --characters lakshay,qustoge,self
 *
 * The first --characters id is the host. Everyone listed must already exist
 * and, after the move, nobody's old place may drop below three residents —
 * the script checks the arithmetic before touching anything. Run with
 * --dry-run to preview the edits.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const DOCS = join(ROOT, 'docs');
const DRY_RUN = process.argv.includes('--dry-run');

// ------------------------------------------------------------ arg parsing
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    if (key === 'dry-run') continue;
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) usage(`--${key} needs a value`);
    out[key] = value;
    i += 1;
  }
  return out;
}

function usage(msg) {
  console.error(`error: ${msg}\nSee the header comment for usage.`);
  process.exit(2);
}

const args = parseArgs(process.argv.slice(2));

for (const required of [
  'id',
  'name',
  'emoji',
  'district',
  'slot',
  'tags',
  'effects',
  'variance',
  'unlock-day',
  'characters',
]) {
  if (!args[required]) usage(`--${required} is required`);
}

if (!/^[a-z][a-z0-9_]*$/.test(args.id)) usage(`--id '${args.id}' must be snake_case`);
const slot = Number(args.slot);
if (!Number.isInteger(slot) || slot < 3 || slot > 6) {
  usage('--slot must be 3, 4, 5 or 6 (slots 1-2 are the founding pair)');
}
const unlockDay = Number(args['unlock-day']);
const unlockRep = Number(args['unlock-rep'] ?? 0);
if (!Number.isInteger(unlockDay) || unlockDay < 1) usage('--unlock-day must be a positive integer');

const numList = (s, name) => {
  const parts = String(s).split(',').map(Number);
  if (parts.length !== 5 || parts.some((n) => !Number.isFinite(n))) {
    usage(`--${name} must be five comma-separated numbers (sanity,money,energy,reputation,insight)`);
  }
  return parts;
};
const effects = numList(args.effects, 'effects');
const variance = numList(args.variance, 'variance');

const charIds = String(args.characters)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
if (charIds.length < 3 || charIds.length > 4) {
  usage('--characters needs three or four existing cast ids (the cast-spread invariant)');
}
if (new Set(charIds).size !== charIds.length) usage('--characters ids repeat');

// ------------------------------------------------------ existence checks
const { LOCATIONS, Tag, District } = await import('../docs/js/data/locations.js');
const { RAW, SMALL_TALK, charactersAtLocation } = await import('../docs/js/data/characters.js');

if (LOCATIONS.some((l) => l.id === args.id)) usage(`location '${args.id}' already exists`);
if (!Object.values(District).includes(args.district)) {
  usage(`--district must be one of: ${Object.values(District).join(' | ')}`);
}
const tagList = String(args.tags).split(',').filter(Boolean);
const validTags = new Set(Object.values(Tag));
for (const t of tagList) if (!validTags.has(t)) usage(`unknown tag '${t}'`);

const byId = new Map(RAW.map((c) => [c.id, c]));
const movers = charIds.map((id) => {
  const c = byId.get(id);
  if (!c) {
    console.error(
      `error: '${id}' is not in the cast.\n` +
        'Cast additions are the repo owner\u2019s call — this scaffolder only re-binds ' +
        'people who already exist.\nSee docs/DESIGN_PRINCIPLES.md ("the cast is curated").',
    );
    process.exit(2);
  }
  return c;
});

// The spread invariant: no donor may drop below three residents after the
// move. Check before writing a byte.
for (const c of movers) {
  const staying = charactersAtLocation(c.locationId).length - movers.filter((m) => m.locationId === c.locationId).length;
  if (staying < 3) {
    usage(
      `moving ${movers
        .filter((m) => m.locationId === c.locationId)
        .map((m) => m.id)
        .join(', ')} would leave ${c.locationId} with ${staying} residents (minimum 3)`,
    );
  }
}

const host = movers[0];

// ------------------------------------------------------------ templates
const esc = (s) => s.replace(/'/g, "\\'");

const locEntry = `  loc({
    id: '${args.id}',
    host: '${host.id}',
    name: '${esc(args.name)}',
    emoji: '${args.emoji}',
    district: District.${Object.keys(District).find((k) => District[k] === args.district)},
    desc: 'PLACEHOLDER — two sentences: what the place is, and what it feels like to arrive.',
    actionLabel: 'PLACEHOLDER verb',
    actionDesc: 'PLACEHOLDER — first person, past tense, one breath of consequence.',
    historyLabel: 'PLACEHOLDER short past-tense label',
    tags: [${tagList.map((t) => `Tag.${Object.keys(Tag).find((k) => Tag[k] === t)}`).join(', ')}],
    effects: eff(${effects.join(', ')}),
    variance: vary(${variance.join(', ')}),
    slot: ${slot},
    unlock: { minDay: ${unlockDay}${unlockRep > 0 ? `, minReputation: ${unlockRep}` : ''} },
    bg: 'assets/backgrounds/${args.id}.webp',
  }),`;

const smallTalkStub = SMALL_TALK[host.id]
  ? null
  : `  ${host.id}: Object.freeze([\n    'PLACEHOLDER — ${esc(host.name)} greets you, in their own voice.',\n    'PLACEHOLDER — ${esc(host.name)} mentions the place, briefly.',\n    'PLACEHOLDER — ${esc(host.name)} says something only they would say.',\n  ]),`;

// ------------------------------------------------------- read data files
const LOCATIONS_JS = join(DOCS, 'js/data/locations.js');
const CHARACTERS_JS = join(DOCS, 'js/data/characters.js');
const EVENTS_JS = join(DOCS, 'js/data/events.js');

const locationsSrc = readFileSync(LOCATIONS_JS, 'utf8');
const charactersSrc = readFileSync(CHARACTERS_JS, 'utf8');
let eventsSrc = readFileSync(EVENTS_JS, 'utf8');

// --------------------------------------------- move the events that move
// Events are declared under the location their owner is bound to; a person
// who moves takes their events with them, and the fiction gets re-authored
// honestly afterwards. Each stanza is a prettier-uniform `ev(...)` block.
function moveEventsFor(charId, fromLocation) {
  const blockStart = eventsSrc.indexOf(`  ${fromLocation}: [`);
  if (blockStart === -1) usage(`could not find the '${fromLocation}' block in events.js`);
  const blockEnd = eventsSrc.indexOf('\n  ],', blockStart);
  if (blockEnd === -1) usage(`could not find the end of the '${fromLocation}' block`);

  const block = eventsSrc.slice(blockStart, blockEnd);
  const lines = block.split('\n');
  /** slice the block into leading text, stanzas, trailing text */
  const pieces = [];
  let cursor = 0;
  const isStanzaStart = (line) => line === '    ev(';
  const isStanzaEnd = (line) => line === '    ),';
  let i = 0;
  while (i < lines.length) {
    if (isStanzaStart(lines[i])) {
      let j = i + 1;
      while (j < lines.length && !isStanzaEnd(lines[j])) j += 1;
      if (j >= lines.length) usage(`unterminated ev() stanza in '${fromLocation}'`);
      pieces.push({ head: lines.slice(cursor, i), stanza: lines.slice(i, j + 1) });
      i = j + 1;
      cursor = i;
    } else {
      i += 1;
    }
  }
  const tail = lines.slice(cursor);

  const moved = [];
  const keptParts = [];
  pieces.forEach(({ head, stanza }, index) => {
    // The second line of a stanza is the character id.
    const ownerLine = stanza[2] ?? '';
    const owner = ownerLine.trim().replace(/['",]/g, '');
    if (owner === charId) {
      // A moved stanza takes its own stanza only; its head holds the comment
      // introducing it (if any), which is dead copy at the new home. Except
      // the first head: that one is the block opener (`  donor: [`).
      if (index === 0) keptParts.push(...head);
      moved.push(stanza);
    } else {
      keptParts.push(...head, ...stanza);
    }
  });
  const newBlock = keptParts
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\n\s*$/, '');
  eventsSrc = eventsSrc.slice(0, blockStart) + newBlock + eventsSrc.slice(blockEnd);
  return moved.map((stanza) =>
    [`    // PLACEHOLDER-fiction — moved from ${fromLocation}; re-author honestly.`, ...stanza].join(
      '\n',
    ),
  );
}

let movedStanzas = [];
for (const c of movers) {
  const stanzas = moveEventsFor(c.id, c.locationId);
  if (stanzas.length < 3) {
    usage(
      `${c.id} has only ${stanzas.length} events at ${c.locationId} (minimum 3) — ` +
        'refusing to strand them below the floor',
    );
  }
  movedStanzas = movedStanzas.concat(stanzas);
}

const eventBlock = `  // ================================================== ${args.name}
  ${args.id}: [
${movedStanzas.join('\n\n')}
  ],`;

// --------------------------------------------------- apply the file edits
function insertBeforeMarker(src, marker, text) {
  if (!src.includes(marker)) {
    console.error(`error: missing scaffold marker (${marker.split(' ')[0]} …)`);
    process.exit(1);
  }
  return src.replace(marker, `${text}\n  ${marker.trimStart()}`);
}

const newLocationsSrc = insertBeforeMarker(locationsSrc, '// [[scaffold:location]]', locEntry);

let newCharactersSrc = charactersSrc;
for (const c of movers) {
  const idLine = `    id: '${c.id}',`;
  const at = newCharactersSrc.indexOf(idLine);
  if (at === -1) usage(`could not find profile for '${c.id}'`);
  const after = newCharactersSrc.indexOf("locationId:", at);
  const lineEnd = newCharactersSrc.indexOf('\n', after);
  newCharactersSrc =
    newCharactersSrc.slice(0, after) +
    `locationId: '${args.id}',` +
    newCharactersSrc.slice(newCharactersSrc.indexOf(',', after) + 1, lineEnd === -1 ? undefined : lineEnd) +
    newCharactersSrc.slice(lineEnd === -1 ? undefined : lineEnd);
}
if (smallTalkStub) {
  newCharactersSrc = insertBeforeMarker(
    newCharactersSrc,
    '// [[scaffold:smalltalk]]',
    smallTalkStub,
  );
}

const newEventsSrc = insertBeforeMarker(eventsSrc, '// [[scaffold:events]]', eventBlock);

if (DRY_RUN) {
  console.log('--- locations.js addition ---\n' + locEntry);
  console.log('\n--- characters.js rebinds ---');
  for (const c of movers) console.log(`  ${c.id}: ${c.locationId} -> ${args.id}`);
  if (smallTalkStub) console.log(smallTalkStub);
  console.log('\n--- events.js addition ---\n' + eventBlock);
  console.log('\n(dry run — no files changed, no art written)');
  process.exit(0);
}

writeFileSync(LOCATIONS_JS, newLocationsSrc);
writeFileSync(CHARACTERS_JS, newCharactersSrc);
writeFileSync(EVENTS_JS, newEventsSrc);
console.log('✓ data files updated');

// ---------------------------------------------------- placeholder assets
// Only the background is new — the people moving in already have portraits.
// A labelled grey placeholder keeps checks green without pretending to be
// art. Dimensions match the real tier (1000x667); paint over it for real.
try {
  execFileSync('convert', [
    '-size',
    '1000x667',
    'gradient:#3a3a4a-#23232f',
    '-gravity',
    'center',
    '-font',
    'DejaVu-Sans',
    '-fill',
    '#9a978f',
    '-pointsize',
    '48',
    '-annotate',
    '+0+0',
    `PLACEHOLDER\n${args.id}`,
    join(DOCS, `assets/backgrounds/${args.id}.webp`),
  ]);
  console.log('✓ placeholder background written');
} catch (e) {
  console.warn(
    `⚠ ImageMagick not available — write docs/assets/backgrounds/${args.id}.webp yourself:\n${e.message}`,
  );
}

// ------------------------------------------------------- format + verify
execFileSync('npx', ['--no-install', 'prettier', '--write', LOCATIONS_JS, CHARACTERS_JS, EVENTS_JS], {
  stdio: 'inherit',
});
console.log('✓ prettier');

let validationFailed = false;
try {
  execFileSync(process.execPath, [join(ROOT, 'scripts/validate-content.js'), '--quiet'], {
    stdio: 'inherit',
  });
} catch {
  validationFailed = true;
}

console.log(`
Done. The punch list — everything marked PLACEHOLDER is yours to write:

  git grep -n PLACEHOLDER docs/js/data/

  1. Real copy for the location (desc, action, history), and re-authored
     fiction for every moved event (marked PLACEHOLDER-fiction) — the words
     still describe where these people used to live.
  2. Real background art: docs/ART_DIRECTION.md covers style; paint a master
     at assets/backgrounds/${args.id}.png, then npm run assets.
  3. npm run check — the full gate — before you commit.
`);
process.exit(validationFailed ? 1 : 0);
