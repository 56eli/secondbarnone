#!/usr/bin/env node
/**
 * Content linter: the fast, standalone gate for authoring work.
 *
 * The test suite (tests/cast.test.js, tests/world.test.js) asserts the same
 * contracts through node:test, and remains the authority. This script exists
 * for the *authoring loop*: it runs in under a second, reports every problem
 * it finds in one pass with messages written for the person who just added
 * content — not for someone debugging a test — and adds checks the suite
 * does not do, like the eager-payload projection.
 *
 * Checks:
 *   locations  unique ids, complete fields, host exists/bound/has small talk,
 *              real district, real tags, background file, sane unlock gates
 *   characters unique ids, valid role, bound to a real location, three or
 *              more events each, cast spread stays within house limits
 *   events     unique ids, owner exists, owner lives at the declaring
 *              location, the event actually does something, gates name real
 *              weather/days/weekdays, every location carries at least one
 *              rare-hurtful event
 *   orphans    portraits and backgrounds on disk that nothing references
 *   pacing     unlock/gate distribution — warns when the world stops opening
 *              long before the endurance goal
 *   budget     eager-payload projection with the cost of future content
 *
 * Usage:
 *   node scripts/validate-content.js          full report
 *   node scripts/validate-content.js --quiet  errors + warnings only
 *
 * Exit code is non-zero if any error is found. Warnings are printed but do
 * not fail the run.
 */

import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  LOCATIONS, DISTRICT_ORDER, Tag, WELCOME_LOCATION_ID,
} from '../docs/js/data/locations.js';
import { createAllProfiles, SMALL_TALK } from '../docs/js/data/characters.js';
import {
  buildEventPool, EVENTS_BY_LOCATION, Rarity, Category,
  WEIGHT_STANDARD, WEIGHT_RARE_HELPFUL, WEIGHT_RARE_HURTFUL,
} from '../docs/js/data/events.js';
import { WEATHER_TYPES } from '../docs/js/data/weather.js';
import { PERKS } from '../docs/js/data/perks.js';
import { OBSERVANCES } from '../docs/js/data/observances.js';
import { ENDURANCE_GOAL_DAYS } from '../docs/js/core/balance.js';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const DOCS = join(ROOT, 'docs');

const QUIET = process.argv.includes('--quiet');

let errors = 0;
let warnings = 0;
const err = (m) => { errors += 1; console.error(`  ✗ ${m}`); };
const warn = (m) => { warnings += 1; console.warn(`  ⚠ ${m}`); };
const ok = (m) => { if (!QUIET) console.log(`  ✓ ${m}`); };
const section = (m) => { if (!QUIET) console.log(`\n${m}`); };

/** Effect keys an event may set (kept in sync with the ev() helper). */
const DELTA_KEYS = ['sanity', 'money', 'energy', 'reputation', 'insight'];

// ---------------------------------------------------------------- load
const PROFILES = createAllProfiles();
const PROFILE_IDS = new Set(PROFILES.map((p) => p.id));
const POOL = buildEventPool();
const WEATHER_IDS = new Set(WEATHER_TYPES.map((w) => w.id));
const TAGS = new Set(Object.values(Tag));
const RARITIES = new Set(Object.values(Rarity));
const CATEGORIES = new Set(Object.values(Category));

// ------------------------------------------------------------- locations
section('Locations');

const locationIds = new Set();
for (const l of LOCATIONS) {
  if (locationIds.has(l.id)) err(`duplicate location id '${l.id}'`);
  locationIds.add(l.id);

  for (const field of ['name', 'emoji', 'district', 'desc', 'actionLabel', 'effects', 'unlock']) {
    if (l[field] === undefined || l[field] === null || l[field] === '') {
      err(`location '${l.id}' is missing ${field}`);
    }
  }
  if (!DISTRICT_ORDER.includes(l.district)) {
    err(`location '${l.id}' is in unknown district '${l.district}'`);
  }
  for (const t of l.tags ?? []) {
    if (!TAGS.has(t)) err(`location '${l.id}' has unknown tag '${t}'`);
  }
  for (const k of DELTA_KEYS) {
    if (typeof l.effects?.[k] !== 'number') err(`location '${l.id}' effects missing '${k}'`);
  }
  const u = l.unlock ?? {};
  if (u.minDay < 1) err(`location '${l.id}' unlocks before day 1`);
  if (u.minReputation < 0) err(`location '${l.id}' has a negative reputation gate`);
  if (u.requiresPerk && !PERKS.some((p) => p.id === u.requiresPerk)) {
    err(`location '${l.id}' requires unknown perk '${u.requiresPerk}'`);
  }

  if (l.bg && !existsSync(join(DOCS, l.bg))) err(`location '${l.id}' background missing: ${l.bg}`);

  // The host must be a real character who lives at the location, and as the
  // person who speaks for the place they must have small talk.
  const host = PROFILES.find((p) => p.id === l.host);
  if (!host) err(`location '${l.id}' names unknown host '${l.host}'`);
  else if (host.locationId !== l.id) {
    err(`host '${l.host}' is bound to '${host.locationId}' but hosts '${l.id}'`);
  }
  if (!SMALL_TALK[l.host]) err(`host '${l.host}' of '${l.id}' has no small talk`);
}

{
  const welcomes = LOCATIONS.filter((l) => l.dayOneWelcome).map((l) => l.id);
  if (welcomes.length !== 1 || welcomes[0] !== WELCOME_LOCATION_ID) {
    err(`expected exactly the welcome location '${WELCOME_LOCATION_ID}', found: ${welcomes.join(', ') || 'none'}`);
  }
}
ok(`${LOCATIONS.length} locations checked`);

// ----------------------------------------------------------- characters
section('Characters');

{
  const seen = new Set();
  for (const p of PROFILES) {
    if (seen.has(p.id)) err(`duplicate character id '${p.id}'`);
    seen.add(p.id);
    if (!locationIds.has(p.locationId)) err(`character '${p.id}' bound to unknown location '${p.locationId}'`);
    if (!p.bio) err(`character '${p.id}' has no bio`);
    if (!p.relationship) err(`character '${p.id}' has no relationship line`);
  }
}

const countsByLocation = new Map(LOCATIONS.map((l) => [l.id, 0]));
for (const p of PROFILES) countsByLocation.set(p.locationId, (countsByLocation.get(p.locationId) ?? 0) + 1);
{
  const entries = [...countsByLocation.entries()];
  const low = Math.min(...entries.map(([, n]) => n));
  const high = Math.max(...entries.map(([, n]) => n));
  if (low < 3) err(`${entries.find(([, n]) => n === low)[0]} has only ${low} people (minimum 3 — a place needs a cast)`);
  if (high - low > 2) err(`cast spread is ${low}–${high} per location; keep it within 2 (find homes for newcomers before adding more)`);
  ok(`${PROFILES.length} characters, spread ${low}–${high} per location`);
}

// ------------------------------------------------------------ events
section('Events');

{
  const seen = new Set();
  const eventsByCharacter = new Map();
  const hurtfulByLocation = new Map(LOCATIONS.map((l) => [l.id, 0]));

  for (const e of POOL) {
    if (seen.has(e.id)) err(`duplicate event id '${e.id}'`);
    seen.add(e.id);
    eventsByCharacter.set(e.character, (eventsByCharacter.get(e.character) ?? 0) + 1);

    if (!e.title || !e.description) err(`event '${e.id}' needs both a title and a description`);
    if (!CATEGORIES.has(e.category)) err(`event '${e.id}' has unknown category '${e.category}'`);
    if (!RARITIES.has(e.rarity)) err(`event '${e.id}' has unknown rarity '${e.rarity}'`);

    const owner = PROFILES.find((p) => p.id === e.character);
    if (!owner) err(`event '${e.id}' belongs to unknown character '${e.character}'`);
    else if (owner.locationId !== e.requiredLocation) {
      err(`event '${e.id}' is declared under '${e.requiredLocation}' but '${e.character}' lives at '${owner.locationId}'`);
    }

    // The event must change something, or it is a day that reads as a reward
    // and plays as nothing.
    if (DELTA_KEYS.every((k) => (e[`${k}Delta`] ?? 0) === 0)) {
      err(`event '${e.id}' changes nothing — give it at least one non-zero delta`);
    }

    const expectedWeight = e.rarity === Rarity.STANDARD
      ? WEIGHT_STANDARD
      : e.rarity === Rarity.RARE_HELPFUL ? WEIGHT_RARE_HELPFUL : WEIGHT_RARE_HURTFUL;
    if (e.weight !== expectedWeight) err(`event '${e.id}' has weight ${e.weight}, expected ${expectedWeight} for ${e.rarity}`);

    if (e.rarity === Rarity.RARE_HELPFUL && DELTA_KEYS.every((k) => (e[`${k}Delta`] ?? 0) <= 0)) {
      err(`rare-helpful event '${e.id}' gives the player nothing`);
    }
    if (e.rarity === Rarity.RARE_HURTFUL && DELTA_KEYS.every((k) => (e[`${k}Delta`] ?? 0) >= 0)) {
      err(`rare-hurtful event '${e.id}' costs the player nothing`);
    }
    if (e.rarity === Rarity.RARE_HURTFUL) {
      hurtfulByLocation.set(e.requiredLocation, (hurtfulByLocation.get(e.requiredLocation) ?? 0) + 1);
    }

    if (e.requiredTag && !TAGS.has(e.requiredTag)) err(`event '${e.id}' requires unknown tag '${e.requiredTag}'`);
    if (e.requiredWeather && !WEATHER_IDS.has(e.requiredWeather)) {
      err(`event '${e.id}' is gated on unknown weather '${e.requiredWeather}'`);
    }
    if (e.minimumDay < 1) err(`event '${e.id}' has minimumDay ${e.minimumDay} < 1`);
    if (e.minAffinity < 0) err(`event '${e.id}' has a negative affinity gate`);
    if ((e.minReputation ?? 0) < 0 || (e.minReputation ?? 0) > 100) {
      err(`event '${e.id}' has an implausible reputation gate (${e.minReputation}); reputation runs 0–100`);
    }
    for (const d of e.allowedWeekdays ?? []) {
      if (!Number.isInteger(d) || d < 0 || d > 6) err(`event '${e.id}' allows impossible weekday ${d}`);
    }
  }

  for (const p of PROFILES) {
    const n = eventsByCharacter.get(p.id) ?? 0;
    if (n < 3) err(`character '${p.id}' has only ${n} event(s) (minimum 3 — people need more than one thing to say)`);
  }

  // The downside contract: a place with no way to have a bad day teaches the
  // player that places are interchangeable. One rare-hurtful event per
  // location is the floor, authored for the place, not boilerplate.
  const unprotected = [...hurtfulByLocation.entries()].filter(([, n]) => n === 0).map(([id]) => id);
  if (unprotected.length > 0) {
    err(`no rare-hurtful event at: ${unprotected.join(', ')} — every location needs at least one bad day`);
  }

  // The catalogue must be declared under real location keys; anything else
  // drops events on the floor silently.
  for (const key of Object.keys(EVENTS_BY_LOCATION)) {
    if (!locationIds.has(key)) err(`events are declared under unknown location '${key}'`);
  }

  ok(`${POOL.length} events checked, ${POOL.filter((e) => e.rarity === Rarity.RARE_HURTFUL).length} rare-hurtful`);
}

// ------------------------------------------------------------- orphans
section('Orphaned assets');

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

{
  // Referenced from data or from code constants (the music loop lives in
  // app.js as MUSIC_SRC); keep the code-only cases explicit here.
  const referenced = new Set([
    ...PROFILES.flatMap((p) => [p.portrait, p.portraitHi]),
    ...LOCATIONS.map((l) => l.bg).filter(Boolean),
    'assets/backgrounds/hub_background.webp',
    'assets/audio/warm-piano-loop.wav',
    'assets/audio/README.md',
  ]);
  for (const file of walk(join(DOCS, 'assets'))) {
    const rel = relative(DOCS, file);
    if (rel.endsWith('README.md')) continue;
    if (!referenced.has(rel)) warn(`unreferenced asset: ${rel}`);
  }
}

{
  // Perks and observances should feed back into the world, not dangle.
  const perkIds = new Set(PERKS.map((p) => p.id));
  for (const p of PERKS) {
    for (const r of p.requires ?? []) {
      if (!perkIds.has(r)) err(`perk '${p.id}' requires unknown perk '${r}'`);
    }
  }
  for (const o of OBSERVANCES) {
    for (const r of o.requires ?? []) {
      if (!perkIds.has(r)) err(`observance '${o.id}' requires unknown perk '${r}'`);
    }
  }
}

// -------------------------------------------------------------- pacing
section('Pacing');

{
  const unlockDays = LOCATIONS.map((l) => l.unlock.minDay ?? 1);
  const lastUnlock = Math.max(...unlockDays);
  const lastGate = Math.max(0, ...POOL.map((e) => e.minimumDay ?? 1));
  const after = (n) => ({
    locations: LOCATIONS.filter((l) => (l.unlock.minDay ?? 1) >= n).length,
    events: POOL.filter((e) => (e.minimumDay ?? 1) >= n).length,
  });
  console.log(
    `  unlocks by day: ${unlockDays
      .map((d, i) => `${LOCATIONS[i].id}:${d}`)
      .sort((a, b) => Number(a.split(':')[1]) - Number(b.split(':')[1]))
      .slice(-6)
      .join('  ')}`,
  );
  console.log(`  last location unlock: day ${lastUnlock} · last event gate: day ${lastGate} · goal: day ${ENDURANCE_GOAL_DAYS}`);
  const late = after(25);
  console.log(`  arriving at/after day 25: ${late.locations} locations, ${late.events} events`);
  if (lastUnlock >= ENDURANCE_GOAL_DAYS) {
    err(`a location unlocks at day ${lastUnlock}, on or after the day-${ENDURANCE_GOAL_DAYS} goal — nobody meets it`);
  }
  if (ENDURANCE_GOAL_DAYS - Math.max(lastUnlock, lastGate) > 25) {
    warn(
      `nothing arrives after day ${Math.max(lastUnlock, lastGate)} — the last ${ENDURANCE_GOAL_DAYS - Math.max(lastUnlock, lastGate)} days of the arc have no new content`,
    );
  }
}

// -------------------------------------------------------------- budget
section('Budget projection');

{
  const HI_DIR = join('assets', 'portraits', 'hi');
  let eager = 0;
  let hi = 0;
  for (const file of walk(DOCS)) {
    const rel = relative(DOCS, file);
    const { size } = statSync(file);
    if (rel.startsWith(HI_DIR)) hi += size;
    else eager += size;
  }
  const EAGER_LIMIT = 4 * 1024 * 1024;
  const headroom = EAGER_LIMIT - eager;
  const mb = (n) => `${(n / 1024 / 1024).toFixed(2)} MB`;
  console.log(`  eager payload ${mb(eager)} of ${mb(EAGER_LIMIT)} (${(headroom / 1024).toFixed(0)} KB free), lightbox tier ${mb(hi)} on demand`);
  // Cost model matches scripts/check-assets.js: three characters (thumbnails)
  // plus one background per location.
  const PER_CHARACTER = 15 * 1024;
  const PER_BACKGROUND = 90 * 1024;
  const perLocation = 3 * PER_CHARACTER + PER_BACKGROUND;
  console.log(`  projected room: ~${Math.floor(headroom / PER_CHARACTER)} characters or ~${Math.floor(headroom / perLocation)} full locations`);
  if (headroom < perLocation) warn('eager headroom will not fit one more location (3 portraits + background) — plan the budget before authoring');
  if (eager > EAGER_LIMIT) err('eager payload is already over the 4 MB budget');
}

// -------------------------------------------------------------- summary
console.log(`\n${errors} error(s), ${warnings} warning(s).`);
if (errors > 0) process.exit(1);
console.log('Content validation passed.');
