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
  GameState,
  saveStore,
  SAVE_KEY,
  SAVE_SLOTS,
  MAX_STAT,
  MAX_ENERGY,
  MAX_REPUTATION,
  MONEY_HARD_CEILING,
  MONEY_SOFT_CAP,
  ENDURANCE_GOAL_DAYS,
  START_ENERGY,
  START_REPUTATION,
  ENERGY_RECOVERY,
  EXHAUSTION_THRESHOLD,
  EXHAUSTION_MAX_PENALTY,
  RENT_AMOUNT,
  CURRENT_SAVE_VERSION,
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
    setItem: (k, v) => {
      map.set(k, String(v));
    },
    removeItem: (k) => {
      map.delete(k);
    },
    get size() {
      return map.size;
    },
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

test('applyDeltas takes a full or partial five-stat bundle', () => {
  const gs = fresh();
  gs.applyDeltas({ sanity: -5, money: 7 });
  assert.equal(gs.sanity, 45);
  assert.equal(gs.money, 57);
  gs.applyDeltas({ energy: -10, reputation: 5, insight: 2 });
  assert.equal(gs.energy, START_ENERGY - 10);
  assert.equal(gs.reputation, START_REPUTATION + 5);
  assert.equal(gs.insight, 2);
});

test('stats_changed reports all four gauges', () => {
  const gs = fresh();
  let seen = null;
  gs.on('stats_changed', (...args) => {
    seen = args;
  });
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
  gs.on('perks_changed', () => {
    count += 1;
  });
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
  assert.equal(
    Object.values(base).reduce((a, b) => a + b, 0),
    0,
  );
  assert.equal(
    Object.values(total).reduce((a, b) => a + b, 0),
    0,
  );
  assert.deepEqual(reasons, []);
});

test('weather bends the numbers and says so', () => {
  // Find a seed that is rainy on a day with no festival on it — 1 January is
  // the New Year Vigil, which would otherwise be folded into the same total.
  let gs = null;
  for (let seed = 0; seed < 500; seed++) {
    const candidate = new GameState({ seed });
    candidate.dayOfMonth = 6;
    if (candidate.getWeather().id === 'rain') {
      gs = candidate;
      break;
    }
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

// ======================================================= persistence v5

test('event manager snapshots preserve schedule, memory, and seeded RNG state', () => {
  const original = new EventManager(createRng(912));
  original.initialize(['Geo', 'Susan']);
  original._nextEventDay = 12;
  const [firstEvent, secondEvent] = buildEventPool();
  original._recentIds = [firstEvent.id, secondEvent.id];
  original._previousEventId = secondEvent.id;
  original.rng.random();

  const restored = new EventManager(createRng(1));
  restored.initialize(['Geo', 'Susan']);
  assert.equal(restored.loadFrom(original.toJSON()), true);
  assert.deepEqual(restored.toJSON(), original.toJSON());
  assert.equal(restored.rng.random(), original.rng.random(), 'future event rolls resume exactly');
});

test('application saves restore both game and event state', () => {
  const storage = fakeStorage();
  const gs = fresh(77);
  const original = new EventManager(createRng(88));
  original.initialize(gs.getCharacterNames());
  original._nextEventDay = 15;
  original._recentIds = [buildEventPool()[0].id];
  gs.advanceDay();

  assert.equal(saveStore.save(gs, storage, original), true);
  const raw = JSON.parse(storage.getItem(SAVE_KEY));
  // Assert against the constant, not a literal: this test is about the
  // envelope carrying both halves of a run, not about which schema version
  // happens to be current. Hard-coding the number made every schema bump
  // look like a regression here.
  assert.equal(raw.v, CURRENT_SAVE_VERSION);
  assert.equal(raw.gameState.journeyDay, 2);
  assert.equal(raw.eventManager.nextEventDay, 15);

  const loadedGs = fresh(1);
  const loadedEvents = new EventManager(createRng(2));
  loadedEvents.initialize(loadedGs.getCharacterNames());
  assert.equal(saveStore.load(loadedGs, storage, loadedEvents), true);
  assert.equal(loadedGs.journeyDay, 2);
  assert.deepEqual(loadedEvents.toJSON(), original.toJSON());
});

test('mastery is awarded once and persists independently of the sixty-day win', () => {
  const gs = fresh();
  gs.journeyDay = 100;
  gs.reputation = 85;
  gs.money = 250;
  gs.visitedLocations = new Set(locationIds().slice(0, 18));
  assert.equal(gs.checkSecondWin(), true);
  assert.equal(gs.masteryWon, true);
  assert.equal(gs.checkSecondWin(), false, 'mastery must not re-fire every turn');

  const loaded = fresh();
  assert.equal(loaded.loadFrom(gs.toJSON()), true);
  assert.equal(loaded.masteryWon, true);
  assert.equal(loaded.masteryMessage, gs.masteryMessage);
});

// ============================================================= save slots
//
// The slot layer's storage-key contract (`secondbarnone.save.active` and
// `.save.names` beside the three slot keys) is load-bearing in the other
// direction too: renaming a key orphans every existing player's pointer.
// These tests pin the strings down on purpose.

const SLOT_A_KEY = SAVE_KEY; // Run 1 *is* the historical single save key.
const SLOT_B_KEY = `${SAVE_KEY}.b`;
const SLOT_C_KEY = `${SAVE_KEY}.c`;
const ACTIVE_POINTER_KEY = 'secondbarnone.save.active';
const SLOT_NAMES_STORAGE_KEY = 'secondbarnone.save.names';

test('three slots exist and Run 1 is the historical save, active by default', () => {
  const storage = fakeStorage();
  assert.deepEqual(
    SAVE_SLOTS.map((s) => s.key),
    [SLOT_A_KEY, SLOT_B_KEY, SLOT_C_KEY],
    'Run 1 must keep the long-standing key so existing players keep their run',
  );
  assert.equal(saveStore.activeSlotKey(storage), SLOT_A_KEY);

  const slots = saveStore.slots(storage);
  assert.equal(slots.length, 3);
  assert.deepEqual(
    slots.map((s) => s.name),
    ['Run 1', 'Run 2', 'Run 3'],
  );
  assert.equal(slots[0].active, true, 'with no pointer stored, Run 1 is active');
  assert.ok(slots.every((s) => !s.present && s.journeyDay === null));
});

test('saving follows the active-slot pointer and slots stay isolated', () => {
  const storage = fakeStorage();
  const gs = fresh(11);
  gs.journeyDay = 12;

  // A save with no slot argument lands in Run 1, as it always has.
  assert.equal(saveStore.save(gs, storage), true);
  assert.ok(storage.getItem(SLOT_A_KEY));
  assert.equal(storage.getItem(SLOT_B_KEY), null);

  // Move the pointer, advance differently, save again: two divergent runs.
  assert.equal(saveStore.setActiveSlot(storage, SLOT_B_KEY), true);
  gs.journeyDay = 30;
  gs.money = 500;
  assert.equal(saveStore.save(gs, storage), true);

  const intoA = fresh(1);
  const intoB = fresh(1);
  assert.equal(saveStore.load(intoA, storage, null, SLOT_A_KEY), true);
  assert.equal(saveStore.load(intoB, storage, null, SLOT_B_KEY), true);
  assert.equal(intoA.journeyDay, 12);
  assert.equal(intoB.journeyDay, 30);
  assert.notEqual(intoA.money, intoB.money);

  // Erasing one slot must not touch its neighbour, and the pointer survives.
  assert.equal(saveStore.clear(storage, SLOT_B_KEY), true);
  assert.equal(storage.getItem(SLOT_B_KEY), null);
  assert.ok(storage.getItem(SLOT_A_KEY), 'erasing Run 2 must not erase Run 1');
  assert.equal(saveStore.activeSlotKey(storage), SLOT_B_KEY, 'erasing does not move the pointer');
});

test('no-argument save/load/has/clear all work the active slot', () => {
  const storage = fakeStorage();
  const gs = fresh();
  assert.equal(saveStore.has(storage), false);
  assert.equal(saveStore.save(gs, storage), true);
  assert.equal(saveStore.has(storage), true);

  assert.equal(saveStore.setActiveSlot(storage, SLOT_C_KEY), true);
  assert.equal(saveStore.has(storage), false, 'Run 3 is fresh');

  assert.equal(saveStore.setActiveSlot(storage, SLOT_A_KEY), true);
  assert.equal(saveStore.has(storage), true);
  assert.equal(saveStore.clear(storage), true, 'clear() with no slot clears the active one');
  assert.equal(storage.getItem(SLOT_A_KEY), null);
});

test('unknown slot keys are refused everywhere', () => {
  const storage = fakeStorage();
  const gs = fresh();
  assert.equal(saveStore.setActiveSlot(storage, 'nonsense'), false);
  assert.equal(saveStore.save(gs, storage, null, 'nonsense'), false);
  assert.equal(saveStore.load(gs, storage, null, 'nonsense'), false);
  assert.equal(saveStore.clear(storage, 'nonsense'), false);
  assert.equal(saveStore.has(storage, 'nonsense'), false);
  assert.equal(saveStore.renameSlot(storage, 'nonsense', 'x'), false);
});

test('a corrupted or unknown active-slot pointer degrades to Run 1', () => {
  const storage = fakeStorage();
  storage.setItem(ACTIVE_POINTER_KEY, 'not-a-real-slot');
  assert.equal(saveStore.activeSlotKey(storage), SLOT_A_KEY);
  storage.setItem(ACTIVE_POINTER_KEY, 'null');
  assert.equal(saveStore.activeSlotKey(storage), SLOT_A_KEY);
});

test('renames persist, cap at 24 characters and blank resets to the default', () => {
  const storage = fakeStorage();
  assert.equal(saveStore.renameSlot(storage, SLOT_B_KEY, "Mara's run"), true);
  assert.equal(saveStore.slots(storage)[1].name, "Mara's run");
  assert.ok(JSON.parse(storage.getItem(SLOT_NAMES_STORAGE_KEY))[SLOT_B_KEY]);

  const longName = 'a'.repeat(40);
  saveStore.renameSlot(storage, SLOT_B_KEY, longName);
  assert.equal(saveStore.slots(storage)[1].name, longName.slice(0, 24));

  saveStore.renameSlot(storage, SLOT_B_KEY, '   ');
  assert.equal(
    saveStore.slots(storage)[1].name,
    'Run 2',
    'a blank rename visibly falls back to the default name',
  );
});

test('a corrupted names key reads as no renames, and a saving storage failure is swallowed', () => {
  const storage = fakeStorage();
  storage.setItem(SLOT_NAMES_STORAGE_KEY, '{broken json');
  assert.equal(saveStore.slots(storage)[1].name, 'Run 2');

  const hostile = {
    getItem() {
      throw new Error('denied');
    },
    setItem() {
      throw new Error('denied');
    },
    removeItem() {
      throw new Error('denied');
    },
  };
  assert.equal(saveStore.activeSlotKey(hostile), SLOT_A_KEY);
  assert.equal(saveStore.setActiveSlot(hostile, SLOT_B_KEY), false);
  assert.doesNotThrow(() => saveStore.slots(hostile));
  assert.equal(saveStore.renameSlot(hostile, SLOT_B_KEY, 'x'), false);
});

test('slots() peeks at each run without loading it', () => {
  const storage = fakeStorage();
  const gs = fresh(3);
  const em = manager();
  gs.journeyDay = 27;
  saveStore.save(gs, storage, em);

  assert.equal(saveStore.setActiveSlot(storage, SLOT_B_KEY), true);
  const slots = saveStore.slots(storage);
  assert.equal(slots[0].present, true);
  assert.equal(slots[0].journeyDay, 27, 'the settings list reads day and date without a load');
  assert.equal(typeof slots[0].savedAt, 'string');
  assert.ok(!Number.isNaN(Date.parse(slots[0].savedAt)), 'savedAt should be a real timestamp');
  assert.equal(slots[1].present, false);
  assert.equal(slots[1].active, true, 'the pointer moved, the save stayed in Run 1');

  // A corrupted slot reads as absent, never as a crash.
  storage.setItem(SLOT_B_KEY, 'not json at all{');
  assert.equal(saveStore.slots(storage)[1].present, false);
});

test('legacy save keys migrate into Run 1 only, never into a side slot', () => {
  const storage = fakeStorage();
  const gs = fresh(9);
  gs.journeyDay = 8;
  saveStore.save(gs, storage);
  // Move the save sideways onto a legacy key, as if written by an old build.
  storage.setItem('secondbarnone.save.v3', storage.getItem(SLOT_A_KEY));
  storage.removeItem(SLOT_A_KEY);

  assert.equal(saveStore.setActiveSlot(storage, SLOT_B_KEY), true);
  assert.equal(saveStore.has(storage), false, 'Run 2 must not see the legacy save');
  assert.equal(saveStore.load(fresh(), storage), false);

  assert.equal(saveStore.setActiveSlot(storage, SLOT_A_KEY), true);
  assert.equal(saveStore.has(storage), true, 'Run 1 still finds and adopts the legacy save');
  const restored = fresh();
  assert.equal(saveStore.load(restored, storage), true);
  assert.equal(restored.journeyDay, 8);
});
