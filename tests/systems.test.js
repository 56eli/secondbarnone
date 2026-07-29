/**
 * Tests for the expanded runtime: energy, reputation, insight,
 * perks, achievements, save/load and the widened turn resolver.
 *
 * All headless. Weather is seeded per-GameState so every assertion about a
 * specific day's sky is reproducible.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GameState, saveStore, SAVE_KEY,
  MAX_STAT, MAX_ENERGY, MAX_REPUTATION, MONEY_HARD_CEILING, MONEY_SOFT_CAP,
  ENDURANCE_GOAL_DAYS, START_ENERGY, START_REPUTATION,
  ENERGY_RECOVERY, EXHAUSTION_THRESHOLD, EXHAUSTION_MAX_PENALTY, RENT_AMOUNT,
} from '../docs/js/core/game-state.js';
import { EventManager } from '../docs/js/core/event-manager.js';
import { resolveTurn, computeDayEffects, scaleEventDeltas } from '../docs/js/core/turn.js';
import { createRng } from '../docs/js/core/rng.js';
import { LOCATIONS, getLocation, locationIds, varianceForDay } from '../docs/js/data/locations.js';
import { getPerk, perkIds } from '../docs/js/data/perks.js';
import { buildEventPool } from '../docs/js/data/events.js';
import { weatherForDay } from '../docs/js/data/weather.js';

const fresh = (seed = 1) => new GameState({ seed });
const manager = (seed = 42) => {
  const em = new EventManager(createRng(seed));
  em.initialize(['Geo', 'Susan']);
  return em;
};
/** An event manager that will never fire, for isolating other systems. */
const quietManager = () => {
  const em = manager();
  em._nextEventDay = Number.MAX_SAFE_INTEGER;
  return em;
};

/** Minimal in-memory localStorage stand-in. */
function fakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    get size() { return map.size; },
  };
}

// ================================================================= energy

test('a run starts at full energy', () => {
  const gs = fresh();
  assert.equal(gs.energy, START_ENERGY);
  assert.equal(gs.isExhausted, false);
});

test('energy is clamped to its own maximum, not the stat maximum', () => {
  const gs = fresh();
  gs.applyDeltas({ energy: 9999 });
  assert.equal(gs.energy, MAX_ENERGY);
  gs.applyDeltas({ energy: -9999 });
  assert.equal(gs.energy, 0);
});

test('a new day recovers energy without exceeding the cap', () => {
  const gs = fresh();
  gs.energy = 40;
  gs.advanceDay();
  assert.equal(gs.energy, 40 + ENERGY_RECOVERY);

  gs.energy = MAX_ENERGY - 1;
  gs.advanceDay();
  assert.equal(gs.energy, MAX_ENERGY);
});

// Removed obsolete inventory test.

test('exhaustion costs nothing above the threshold and bites below it', () => {
  const gs = fresh();
  gs.energy = EXHAUSTION_THRESHOLD;
  assert.equal(gs.exhaustionPenalty(), 0);
  assert.equal(gs.isExhausted, false);

  gs.energy = EXHAUSTION_THRESHOLD - 1;
  assert.ok(gs.exhaustionPenalty() < 0);
  assert.equal(gs.isExhausted, true);

  gs.energy = 0;
  assert.equal(gs.exhaustionPenalty(), -EXHAUSTION_MAX_PENALTY, 'empty is the worst it gets');
});

test('exhaustion deepens smoothly as energy drains', () => {
  const gs = fresh();
  let previous = 1;
  for (let e = EXHAUSTION_THRESHOLD; e >= 0; e -= 5) {
    gs.energy = e;
    const penalty = gs.exhaustionPenalty();
    assert.ok(penalty <= previous, `penalty went up at energy ${e}`);
    previous = penalty;
  }
});

test('Second Wind widens the exhaustion threshold but also softens the fall', () => {
  const gs = fresh();
  gs.energy = EXHAUSTION_THRESHOLD + 4;
  assert.equal(gs.exhaustionPenalty(), 0);

  gs.perks.add('deep_practice');
  gs.perks.add('second_wind');
  assert.ok(gs.exhaustionPenalty() < 0, 'the threshold moved up, so this now counts as tired');
  assert.equal(gs.isExhausted, true);
});

test('the daily focus cue reflects exhaustion', () => {
  const gs = fresh();
  gs.energy = 0;
  assert.match(gs.getDailyNudge().label, /Pace/i);
  gs.energy = EXHAUSTION_THRESHOLD - 1;
  assert.match(gs.getDailyNudge().text, /energy/i);
});

// ==================================================== reputation & insight

test('reputation starts low, is capped, and never goes negative', () => {
  const gs = fresh();
  assert.equal(gs.reputation, START_REPUTATION);
  gs.applyDeltas({ reputation: 9999 });
  assert.equal(gs.reputation, MAX_REPUTATION);
  gs.applyDeltas({ reputation: -9999 });
  assert.equal(gs.reputation, 0);
});

test('insight accumulates without a ceiling and floors at zero', () => {
  const gs = fresh();
  gs.applyDeltas({ insight: 500 });
  assert.equal(gs.insight, 500, 'insight is a currency, not a gauge');
  gs.applyDeltas({ insight: -9999 });
  assert.equal(gs.insight, 0);
});

test('applyDeltas ignores unknown keys and an empty bundle', () => {
  const gs = fresh();
  const before = { s: gs.sanity, m: gs.money, e: gs.energy };
  gs.applyDeltas({ charisma: 10 });
  gs.applyDeltas();
  assert.equal(gs.sanity, before.s);
  assert.equal(gs.money, before.m);
  assert.equal(gs.energy, before.e);
});

test('stats_changed reports all four gauges', () => {
  const gs = fresh();
  let seen = null;
  gs.on('stats_changed', (...args) => { seen = args; });
  gs.applyDeltas({ sanity: 1 });
  assert.equal(seen.length, 4);
  assert.deepEqual(seen, [gs.sanity, gs.money, gs.energy, gs.reputation]);
});

// ============================================================ retired inventory

// Removed obsolete inventory test.

// Removed obsolete inventory test.

// Removed obsolete inventory test.

// Removed obsolete inventory test.

// Removed obsolete inventory test.

// Removed obsolete inventory test.

// Removed obsolete inventory test.


// Removed obsolete inventory test.

// ================================================================== perks

test('a perk can be bought once insight allows, and only once', () => {
  const gs = fresh();
  assert.equal(gs.buyPerk('steady_breath'), false, 'no insight yet');

  gs.insight = 10;
  assert.equal(gs.buyPerk('steady_breath'), true);
  assert.equal(gs.insight, 10 - getPerk('steady_breath').cost);
  assert.equal(gs.hasPerk('steady_breath'), true);
  assert.equal(gs.buyPerk('steady_breath'), false, 'cannot buy it twice');
});

test('prerequisites are enforced through GameState', () => {
  const gs = fresh();
  gs.insight = 100;
  assert.equal(gs.buyPerk('thick_skin'), false);
  assert.match(gs.canBuy('thick_skin').reason, /Steady Breath/);
  gs.buyPerk('steady_breath');
  assert.equal(gs.buyPerk('thick_skin'), true);
});

test('buying an unknown perk is a safe no-op', () => {
  const gs = fresh();
  gs.insight = 100;
  assert.equal(gs.buyPerk('telekinesis'), false);
  assert.equal(gs.insight, 100);
});

test('perks_changed fires only on a real purchase', () => {
  const gs = fresh();
  let count = 0;
  gs.on('perks_changed', () => { count += 1; });
  gs.insight = 100;
  gs.buyPerk('steady_breath');
  gs.buyPerk('steady_breath');
  gs.buyPerk('nonsense');
  assert.equal(count, 1);
});

test('the whole perk tree can be bought in declaration order', () => {
  const gs = fresh();
  gs.insight = 1000;
  for (const id of perkIds()) {
    assert.equal(gs.buyPerk(id), true, `could not buy ${id}`);
  }
  assert.equal(gs.perks.size, perkIds().length);
});

// ============================================================ day effects

test('computeDayEffects starts from the location and returns all five keys', () => {
  const gs = fresh();
  const { base, total } = computeDayEffects(gs, 'bar');
  assert.deepEqual(base, getLocation('bar').effects);
  for (const k of ['sanity', 'money', 'energy', 'reputation', 'insight']) {
    assert.equal(typeof total[k], 'number');
  }
});

test('computeDayEffects on an unknown location yields a flat zero bundle', () => {
  const gs = fresh();
  const { base, total, reasons } = computeDayEffects(gs, 'atlantis');
  assert.equal(Object.values(base).reduce((a, b) => a + b, 0), 0);
  assert.equal(Object.values(total).reduce((a, b) => a + b, 0), 0);
  assert.deepEqual(reasons, []);
});

test('weather bends the numbers and says so', () => {
  // Find a seed that is rainy on a day with no festival on it — 1 January is
  // the New Year Vigil, which would otherwise be folded into the same total.
  let gs = null;
  for (let seed = 0; seed < 500; seed++) {
    const candidate = new GameState({ seed });
    candidate.dayOfMonth = 6;
    if (candidate.getWeather().id === 'rain') { gs = candidate; break; }
  }
  assert.ok(gs, 'expected some seed to open on a rainy day');
  assert.equal(gs.getFestival(), null);

  // Variance is folded into `total` too, so the weather's contribution is
  // isolated by subtracting the day's own (deterministic) swing.
  const swing = varianceForDay('river_walk', gs.journeyDay, gs.weatherSeed);
  const { base, total, reasons } = computeDayEffects(gs, 'river_walk');
  assert.equal(total.sanity - swing.sanity, base.sanity - 3 + 2, 'rain: outdoor −3, quiet +2');
  assert.equal(total.energy - swing.energy, base.energy - 4);
  assert.ok(reasons.some((r) => /Rain/.test(r)));
});

// Removed obsolete inventory test.

// Removed obsolete inventory test.

// Removed obsolete inventory test.
