/**
 * Cast and event-binding tests.
 *
 * The contract these enforce, in one sentence: **every character is bound to
 * exactly one real location, and has at least three events, all of which fire
 * only at that location.**
 *
 * That is the property the whole "the city feels peopled" design rests on, so
 * it is asserted over the entire catalogue rather than sampled — a new
 * character with two events, or an event that drifted away from its owner's
 * location, fails the build rather than quietly diluting a place.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createAllProfiles, charactersAtLocation, Role, SMALL_TALK, smallTalkFor,
} from '../docs/js/data/characters.js';
import {
  buildEventPool, EVENTS_BY_LOCATION, eventsForCharacter, eventsAtLocation,
  eventCountsByCharacter, weightForRarity, Rarity, Category,
  WEIGHT_STANDARD, WEIGHT_RARE_HELPFUL, WEIGHT_RARE_HURTFUL,
} from '../docs/js/data/events.js';
import { LOCATIONS, getLocation, locationIds } from '../docs/js/data/locations.js';
import { getWeather } from '../docs/js/data/weather.js';
import { EventManager, BURNOUT_THRESHOLD } from '../docs/js/core/event-manager.js';
import { createRng } from '../docs/js/core/rng.js';

const PROFILES = createAllProfiles();
const HIGH_AFFINITY = Object.fromEntries(PROFILES.map((p) => [p.id, 99]));
const BY_ID = new Map(PROFILES.map((p) => [p.id, p]));
const POOL = buildEventPool();

/** The minimum every character must clear. */
const MIN_EVENTS_PER_CHARACTER = 3;

// ================================================ characters ↔ locations

test('every character is bound to exactly one real location', () => {
  const ids = new Set(locationIds());
  for (const p of PROFILES) {
    assert.ok(p.locationId, `${p.id} has no locationId`);
    assert.ok(ids.has(p.locationId), `${p.id} points at unknown location ${p.locationId}`);
  }
});

test('the displayed location name is derived from the binding, never stored', () => {
  // Two fields that can disagree are two fields that eventually will.
  for (const p of PROFILES) {
    assert.equal(p.location, getLocation(p.locationId).name,
      `${p.id} shows "${p.location}" but is bound to ${p.locationId}`);
  }
});

test('nobody is bound to a location that does not exist in the catalogue', () => {
  const placed = LOCATIONS.flatMap((l) => charactersAtLocation(l.id));
  assert.equal(placed.length, PROFILES.length, 'every character lands somewhere');
  assert.equal(new Set(placed).size, placed.length, 'and nobody lands twice');
});

test('the cast is spread roughly evenly across the city', () => {
  // A location with nobody in it is scenery; one with fifteen people is a
  // crowd you cannot tell apart. Both ruin the "who is here" reading.
  const counts = LOCATIONS.map((l) => ({ id: l.id, n: charactersAtLocation(l.id).length }));
  const lowest = Math.min(...counts.map((c) => c.n));
  const highest = Math.max(...counts.map((c) => c.n));

  assert.ok(lowest >= 3, `${counts.find((c) => c.n === lowest).id} has only ${lowest} people`);
  assert.ok(highest - lowest <= 2,
    `spread is ${lowest}-${highest}: ${counts.map((c) => `${c.id}:${c.n}`).join(', ')}`);
});

test('every location host is bound to the location they host', () => {
  // A host who lives somewhere else is the most visible possible version of
  // this bug — their face is on the card.
  for (const l of LOCATIONS) {
    const host = BY_ID.get(l.host);
    assert.ok(host, `${l.id} host ${l.host} is not in the cast`);
    assert.equal(host.locationId, l.id,
      `${l.host} hosts ${l.id} but is bound to ${host.locationId}`);
  }
});

test('every host has small talk and every small-talk entry is a host', () => {
  for (const l of LOCATIONS) {
    const lines = SMALL_TALK[l.host];
    assert.ok(lines?.length >= 3, `${l.host} needs at least three lines`);
    assert.ok(lines.includes(smallTalkFor(l.host, 1)));
  }
  const hosts = new Set(LOCATIONS.map((l) => l.host));
  for (const id of Object.keys(SMALL_TALK)) {
    assert.ok(hosts.has(id), `${id} has small talk but hosts nowhere`);
  }
});

// ======================================================= three events each

test('every character has at least three events', () => {
  const counts = eventCountsByCharacter();
  const short = PROFILES
    .map((p) => ({ id: p.id, n: counts.get(p.id) ?? 0 }))
    .filter((c) => c.n < MIN_EVENTS_PER_CHARACTER);
  assert.deepEqual(short, [], `these characters are under ${MIN_EVENTS_PER_CHARACTER} events`);
});

test('every event belongs to a real character', () => {
  for (const e of POOL) {
    assert.ok(e.character, `${e.id} has no character`);
    assert.ok(BY_ID.has(e.character), `${e.id} → unknown character ${e.character}`);
  }
});

test('every event fires only at its own character\u2019s location', () => {
  for (const e of POOL) {
    const owner = BY_ID.get(e.character);
    assert.equal(e.requiredLocation, owner.locationId,
      `${e.id} belongs to ${e.character} (${owner.locationId}) but fires at ${e.requiredLocation}`);
  }
});

test('a character\u2019s events are all in one place', () => {
  for (const p of PROFILES) {
    const places = new Set(eventsForCharacter(p.id).map((e) => e.requiredLocation));
    assert.equal(places.size, 1, `${p.id}'s events are scattered across ${[...places].join(', ')}`);
  }
});

test('every location has events, and they belong to the people who are there', () => {
  for (const l of LOCATIONS) {
    const events = eventsAtLocation(l.id);
    assert.ok(events.length >= MIN_EVENTS_PER_CHARACTER * 3,
      `${l.id} has only ${events.length} events`);
    const residents = new Set(charactersAtLocation(l.id));
    for (const e of events) {
      assert.ok(residents.has(e.character),
        `${e.id} fires at ${l.id} but ${e.character} is not there`);
    }
  }
});

test('the catalogue is declared by location, so the gate cannot be forgotten', () => {
  // The structural version of the rule above: requiredLocation is stamped
  // from the declaring key rather than typed out per event.
  for (const [locationId, events] of Object.entries(EVENTS_BY_LOCATION)) {
    assert.ok(getLocation(locationId), `${locationId} is not a real location`);
    for (const raw of events) {
      assert.equal(raw.requiredLocation, '', `${raw.id} hard-codes a location`);
    }
  }
  assert.deepEqual(
    Object.keys(EVENTS_BY_LOCATION).sort(),
    locationIds().sort(),
    'every location should appear exactly once as a key',
  );
});

test('buildEventPool returns fresh objects every call', () => {
  // The {friend} substitution used to write back into the shared pool.
  const first = buildEventPool();
  const second = buildEventPool();
  assert.notEqual(first[0], second[0], 'events must not be shared by reference');
  first[0].description = 'mutated';
  assert.notEqual(buildEventPool()[0].description, 'mutated');
});

// ============================================================== integrity

test('every event id is unique', () => {
  assert.equal(new Set(POOL.map((e) => e.id)).size, POOL.length);
});

test('every event is fully specified', () => {
  for (const e of POOL) {
    assert.match(e.id, /^[a-z0-9_]+$/, `${e.id} is not a slug`);
    assert.ok(e.title.length > 3, `${e.id} title`);
    assert.ok(e.description.length > 40, `${e.id} description too short`);
    assert.ok(Object.values(Category).includes(e.category), `${e.id} category ${e.category}`);
    assert.ok(Object.values(Rarity).includes(e.rarity), `${e.id} rarity ${e.rarity}`);
  }
});

test('every event actually does something', () => {
  const keys = ['sanityDelta', 'moneyDelta', 'energyDelta', 'reputationDelta', 'insightDelta'];
  for (const e of POOL) {
    assert.ok(keys.some((k) => e[k] !== 0), `${e.id} has no effect at all`);
  }
});

test('rarity weights follow the 10 / 2 / 2 rule', () => {
  assert.equal(weightForRarity(Rarity.STANDARD), WEIGHT_STANDARD);
  assert.equal(weightForRarity(Rarity.RARE_HELPFUL), WEIGHT_RARE_HELPFUL);
  assert.equal(weightForRarity(Rarity.RARE_HURTFUL), WEIGHT_RARE_HURTFUL);
  for (const e of POOL) assert.equal(e.weight, weightForRarity(e.rarity), `${e.id} weight`);
});

test('rare-helpful events are actually helpful and rare-hurtful ones actually hurt', () => {
  const net = (e) => e.sanityDelta + e.moneyDelta + e.reputationDelta + e.insightDelta;
  for (const e of POOL) {
    if (e.rarity === Rarity.RARE_HELPFUL) {
      assert.ok(net(e) > 0, `${e.id} is flagged helpful but nets ${net(e)}`);
    }
    if (e.rarity === Rarity.RARE_HURTFUL) {
      assert.ok(net(e) < 0, `${e.id} is flagged hurtful but nets ${net(e)}`);
    }
  }
});

test('extra gates name real weather and sane minimum days', () => {
  for (const e of POOL) {
    if (e.requiredWeather) {
      assert.ok(getWeather(e.requiredWeather), `${e.id} requires unknown weather`);
    }
    assert.ok(Number.isInteger(e.minimumDay) && e.minimumDay >= 1, `${e.id} minimumDay`);
  }
});

test('most events belong to side characters', () => {
  const side = POOL.filter((e) => BY_ID.get(e.character)?.role === Role.SIDE_CHARACTER);
  assert.ok(side.length * 2 >= POOL.length,
    `${side.length}/${POOL.length} events are side-character events`);
});

test('the antagonists still have their multi-beat arcs', () => {
  for (const id of ['kaden', 'sato', 'alex']) {
    assert.ok(eventsForCharacter(id).length >= 3, `${id} arc is too short`);
  }
  // Kaden's arc escalates on a timer rather than firing all at once.
  const kadenDays = eventsForCharacter('kaden').map((e) => e.minimumDay).sort((a, b) => a - b);
  assert.ok(kadenDays.at(-1) > kadenDays[0], 'the rent pressure should escalate over the run');
});

// ============================================== behaviour at the table

test('the event manager only ever fires events belonging to where you are', () => {
  for (const l of LOCATIONS) {
    const em = new EventManager(createRng(l.id.length + 7));
    em.initialize(PROFILES.map((p) => p.name));
    const residents = new Set(charactersAtLocation(l.id));
    for (let day = 1; day <= 200; day += 1) {
      const e = em.selectEvent(day, day % 7, l.id, BURNOUT_THRESHOLD, {
        tags: l.tags, weatherId: 'clear',
      });
      if (!e) continue;
      assert.equal(e.requiredLocation, l.id, `${e.id} fired at ${l.id}`);
      assert.ok(residents.has(e.character), `${e.character} appeared at ${l.id}`);
    }
  }
});

test('every event in the catalogue is reachable in play', () => {
  // An event nobody can ever see is dead copy. Weather- and day-gated
  // entries are given the conditions they ask for.
  const seen = new Set();
  for (const l of LOCATIONS) {
    for (const weatherId of ['clear', 'storm', 'fog', 'rain']) {
      for (let seed = 0; seed < 6; seed += 1) {
        const em = new EventManager(createRng(seed));
        em.initialize(PROFILES.map((p) => p.name));
        for (let day = 1; day <= 300; day += 1) {
          const e = em.selectEvent(day, day % 7, l.id, BURNOUT_THRESHOLD, {
            tags: l.tags, weatherId, affinity: HIGH_AFFINITY,
          });
          if (e) seen.add(e.id);
        }
      }
    }
  }
  const unreachable = POOL.map((e) => e.id).filter((id) => !seen.has(id));
  assert.deepEqual(unreachable, [], 'these events can never fire');
});

test('the burnout gate still holds', () => {
  const em = new EventManager(createRng(3));
  em.initialize(PROFILES.map((p) => p.name));
  const bar = getLocation('bar');
  for (let day = 1; day <= 300; day += 1) {
    const e = em.selectEvent(day, day % 7, 'bar', BURNOUT_THRESHOLD - 1, { tags: bar.tags });
    if (e) assert.notEqual(e.id, 'burnout');
  }
});

test('a weather-gated event never fires under the wrong sky', () => {
  const gated = POOL.filter((e) => e.requiredWeather);
  assert.ok(gated.length >= 3, 'the weather gate should still be in use');
  for (const target of gated) {
    const l = getLocation(target.requiredLocation);
    const em = new EventManager(createRng(17));
    em.initialize(PROFILES.map((p) => p.name));
    for (let day = 1; day <= 300; day += 1) {
      const e = em.selectEvent(day, day % 7, l.id, 0, { tags: l.tags, weatherId: 'overcast' });
      if (e) assert.notEqual(e.id, target.id, `${target.id} fired in the wrong weather`);
    }
  }
});

// ==================================================== Seth, "The Hand"

test('Seth is known as The Hand in his profile', () => {
  const seth = BY_ID.get('seth');
  assert.ok(seth, 'Seth is still in the cast');

  const text = `${seth.bio} ${seth.relationship}`;
  const mentions = text.match(/The Hand/g) ?? [];
  assert.ok(mentions.length >= 3,
    `"The Hand" appears ${mentions.length} time(s); it should read as what people call him`);

  // Not just present — established as the name others use for him.
  assert.match(seth.bio, /call(?:s|ed)? him The Hand|They call him The Hand/,
    'the bio should say people call him The Hand');
  assert.match(text, /Seth/, 'his given name should still appear, for contrast');
});

test('Seth\u2019s events use the name people actually call him', () => {
  const events = eventsForCharacter('seth');
  assert.ok(events.length >= MIN_EVENTS_PER_CHARACTER);
  const hand = events.filter((e) => /The Hand/.test(`${e.title} ${e.description}`));
  assert.ok(hand.length >= 2,
    `only ${hand.length} of Seth's events use The Hand`);
});

test('Seth is bound to the night market, where the name comes from', () => {
  assert.equal(BY_ID.get('seth').locationId, 'night_market');
  for (const e of eventsForCharacter('seth')) {
    assert.equal(e.requiredLocation, 'night_market');
  }
});
