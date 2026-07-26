/**
 * Tests for the expanded runtime: energy, reputation, insight, the satchel,
 * perks, contracts, achievements, save/load and the widened turn resolver.
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
  ENERGY_RECOVERY, EXHAUSTION_THRESHOLD, SATCHEL_CAPACITY, RENT_AMOUNT,
} from '../docs/js/core/game-state.js';
import { EventManager } from '../docs/js/core/event-manager.js';
import { resolveTurn, computeDayEffects, scaleEventDeltas } from '../docs/js/core/turn.js';
import { createRng } from '../docs/js/core/rng.js';
import { LOCATIONS, getLocation, locationIds } from '../docs/js/data/locations.js';
import { getItem, ItemKind } from '../docs/js/data/items.js';
import { getPerk, perkIds } from '../docs/js/data/perks.js';
import { getContract } from '../docs/js/data/contracts.js';
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

test('recovery is boosted by Second Wind and by a carried thermos', () => {
  const plain = fresh();
  plain.energy = 0;
  const base = plain.recoverEnergy();

  const kitted = fresh();
  kitted.perks.add('deep_practice');
  kitted.perks.add('second_wind');
  kitted.addItem('thermos');
  kitted.energy = 0;
  assert.ok(kitted.recoverEnergy() > base, 'perks and items should help');
});

test('exhaustion costs nothing above the threshold and bites below it', () => {
  const gs = fresh();
  gs.energy = EXHAUSTION_THRESHOLD;
  assert.equal(gs.exhaustionPenalty(), 0);
  assert.equal(gs.isExhausted, false);

  gs.energy = EXHAUSTION_THRESHOLD - 1;
  assert.ok(gs.exhaustionPenalty() < 0);
  assert.equal(gs.isExhausted, true);

  gs.energy = 0;
  assert.equal(gs.exhaustionPenalty(), -6, 'empty is the worst it gets');
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

test('the mood line reflects exhaustion', () => {
  const gs = fresh();
  gs.energy = 0;
  assert.match(gs.getMood(), /nothing/i);
  gs.energy = EXHAUSTION_THRESHOLD - 1;
  assert.match(gs.getMood(), /out of road/i);
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

test('the legacy applyEventDeltas signature still works', () => {
  const gs = fresh();
  gs.applyEventDeltas(-5, 7);
  assert.equal(gs.sanity, 45);
  assert.equal(gs.money, 57);
  gs.applyEventDeltas(0, 0, -10, 5, 2);
  assert.equal(gs.energy, START_ENERGY - 10);
  assert.equal(gs.reputation, START_REPUTATION + 5);
  assert.equal(gs.insight, 2);
});

test('stats_changed reports all four gauges', () => {
  const gs = fresh();
  let seen = null;
  gs.on('stats_changed', (...args) => { seen = args; });
  gs.applyDeltas({ sanity: 1 });
  assert.equal(seen.length, 4);
  assert.deepEqual(seen, [gs.sanity, gs.money, gs.energy, gs.reputation]);
});

// ================================================================ satchel

test('items can be picked up, and duplicates are refused', () => {
  const gs = fresh();
  assert.equal(gs.addItem('thermos'), true);
  assert.equal(gs.hasItem('thermos'), true);
  assert.equal(gs.addItem('thermos'), false, 'no duplicates');
  assert.equal(gs.items.length, 1);
});

test('unknown items are refused', () => {
  const gs = fresh();
  assert.equal(gs.addItem('holy_hand_grenade'), false);
  assert.equal(gs.items.length, 0);
});

test('the satchel has a hard capacity', () => {
  const gs = fresh();
  const ids = ['prayer_beads', 'thermos', 'tip_jar', 'rain_shell', 'notebook', 'good_boots', 'brass_bell'];
  for (const id of ids.slice(0, SATCHEL_CAPACITY)) assert.equal(gs.addItem(id), true);
  assert.equal(gs.satchelFull, true);
  assert.equal(gs.addItem(ids[SATCHEL_CAPACITY]), false, 'a full satchel takes nothing more');
  assert.equal(gs.items.length, SATCHEL_CAPACITY);
});

test('removing an item frees a slot; removing a phantom does nothing', () => {
  const gs = fresh();
  gs.addItem('thermos');
  assert.equal(gs.removeItem('thermos'), true);
  assert.equal(gs.removeItem('thermos'), false);
  assert.equal(gs.items.length, 0);
});

test('inventory_changed fires on pickup and drop', () => {
  const gs = fresh();
  let count = 0;
  gs.on('inventory_changed', () => { count += 1; });
  gs.addItem('thermos');
  gs.removeItem('thermos');
  gs.addItem('nonsense');
  assert.equal(count, 2, 'only real changes should emit');
});

test('using a consumable applies its effect and spends it', () => {
  const gs = fresh();
  gs.sanity = 40;
  gs.addItem('herbal_tonic');
  const used = gs.useItem('herbal_tonic');
  assert.deepEqual(used, getItem('herbal_tonic').use);
  assert.equal(gs.sanity, 54);
  assert.equal(gs.hasItem('herbal_tonic'), false);
});

test('passives and keepsakes cannot be used up', () => {
  const gs = fresh();
  gs.addItem('prayer_beads');
  gs.addItem('river_stone');
  assert.equal(gs.useItem('prayer_beads'), null);
  assert.equal(gs.useItem('river_stone'), null);
  assert.equal(gs.items.length, 2, 'nothing should have been consumed');
});

test('using something you do not have returns null', () => {
  const gs = fresh();
  assert.equal(gs.useItem('strong_coffee'), null);
  assert.equal(gs.useItem('not_an_item'), null);
});

test('selling an item pays its value and removes it', () => {
  const gs = fresh();
  gs.money = 10;
  gs.addItem('brass_bell');
  const paid = gs.sellItem('brass_bell');
  assert.equal(paid, getItem('brass_bell').value);
  assert.equal(gs.money, 10 + paid);
  assert.equal(gs.hasItem('brass_bell'), false);
});

test('selling what you do not have pays nothing', () => {
  const gs = fresh();
  assert.equal(gs.sellItem('brass_bell'), 0);
  assert.equal(gs.sellItem('not_an_item'), 0);
});

test('a sale can push money past 100 — the wallet has no soft cap', () => {
  const gs = fresh();
  gs.money = MAX_STAT;
  gs.addItem('emergency_envelope');
  const got = gs.sellItem('emergency_envelope');
  assert.equal(gs.money, MAX_STAT + got);
  assert.ok(gs.money > 100);
});

test('mostValuableItem picks the best of what is carried', () => {
  const gs = fresh();
  assert.equal(gs.mostValuableItem(), null);
  gs.addItem('river_stone');      // value 2
  gs.addItem('emergency_envelope'); // value 14
  gs.addItem('notebook');          // value 5
  assert.equal(gs.mostValuableItem().id, 'emergency_envelope');
});

test('carried passives feed into the aggregate modifiers', () => {
  const gs = fresh();
  gs.addItem('prayer_beads');
  gs.addItem('tip_jar');
  const mods = gs.getItemModifiers();
  assert.equal(mods.sanityPerTurn, 1);
  assert.equal(mods.moneyPerWorkTurn, 2);
});

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

  const { base, total, reasons } = computeDayEffects(gs, 'river_walk');
  assert.equal(total.sanity, base.sanity - 3 + 2, 'rain: outdoor −3, quiet +2');
  assert.equal(total.energy, base.energy - 4);
  assert.ok(reasons.some((r) => /Rain/.test(r)));
});

test('a rain shell cancels bad weather but keeps the good', () => {
  let rainy = null;
  let clear = null;
  for (let seed = 0; seed < 500 && (!rainy || !clear); seed++) {
    const candidate = new GameState({ seed });
    candidate.dayOfMonth = 6;
    const id = candidate.getWeather().id;
    if (id === 'rain' && !rainy) rainy = candidate;
    if (id === 'clear' && !clear) clear = candidate;
  }
  assert.ok(rainy && clear);

  const before = computeDayEffects(rainy, 'river_walk').total;
  rainy.addItem('rain_shell');
  const after = computeDayEffects(rainy, 'river_walk').total;
  assert.ok(after.energy > before.energy, 'the shell should stop the drenching');

  // Good weather is not cancelled by wearing a coat.
  const dryBefore = computeDayEffects(clear, 'river_walk').total;
  clear.addItem('rain_shell');
  assert.equal(computeDayEffects(clear, 'river_walk').total.sanity, dryBefore.sanity);
});

test('a storm closes outdoor places unless you are dressed for it', () => {
  let gs = null;
  for (let seed = 0; seed < 2000; seed++) {
    const candidate = new GameState({ seed });
    if (candidate.getWeather().id === 'storm') { gs = candidate; break; }
  }
  assert.ok(gs, 'expected some seed to open on a storm');

  assert.deepEqual(gs.getClosedTags(), ['outdoor']);
  gs.addItem('rain_shell');
  assert.deepEqual(gs.getClosedTags(), [], 'the shell keeps the towpath open');
});

test('a festival adds its effects and names itself', () => {
  const gs = fresh();
  gs.monthIndex = 4;
  gs.dayOfMonth = 2;   // Founders' Day
  const festival = gs.getFestival();
  assert.equal(festival.id, 'founders_day');

  const { base, total, reasons } = computeDayEffects(gs, 'spiritual_community');
  assert.ok(total.money > base.money + 10, 'the bowl fills up');
  assert.ok(reasons.some((r) => /Founders/.test(r)));
});

test('perks show up in the day preview', () => {
  const gs = fresh();
  const before = computeDayEffects(gs, 'bar').total.sanity;
  gs.perks.add('steady_breath');
  const after = computeDayEffects(gs, 'bar');
  assert.equal(after.total.sanity, before + 3);
  assert.ok(after.reasons.includes('Perks'));
});

test('carried items show up in the day preview', () => {
  const gs = fresh();
  const before = computeDayEffects(gs, 'bar').total;
  gs.addItem('tip_jar');
  gs.addItem('prayer_beads');
  const after = computeDayEffects(gs, 'bar');
  assert.equal(after.total.money, before.money + 2, 'the tip sign works on work days');
  assert.equal(after.total.sanity, before.sanity + 1);
  assert.ok(after.reasons.includes('Satchel'));
});

test('the tip sign does nothing on a day that is not work', () => {
  const gs = fresh();
  const before = computeDayEffects(gs, 'home_loft').total.money;
  gs.addItem('tip_jar');
  assert.equal(computeDayEffects(gs, 'home_loft').total.money, before);
});

test('good boots only help on the long walks', () => {
  const gs = fresh();
  gs.reputation = 100;
  const before = computeDayEffects(gs, 'temple_ruins').total.energy;
  gs.addItem('good_boots');
  assert.equal(computeDayEffects(gs, 'temple_ruins').total.energy, before + 8);
});

test('good boots do nothing on a night behind a bar', () => {
  const plain = fresh();
  const booted = fresh();
  booted.addItem('good_boots');
  assert.equal(
    computeDayEffects(booted, 'bar').total.energy,
    computeDayEffects(plain, 'bar').total.energy,
  );
});

test('reasons are de-duplicated even when several tags match', () => {
  const gs = fresh();
  gs.perks.add('steady_breath');
  gs.addItem('prayer_beads');
  const { reasons } = computeDayEffects(gs, 'bar');
  assert.equal(new Set(reasons).size, reasons.length);
});

test('every location produces a finite preview under every weather', () => {
  for (let seed = 0; seed < 20; seed++) {
    const gs = new GameState({ seed });
    for (const l of LOCATIONS) {
      const { total } = computeDayEffects(gs, l.id);
      for (const [k, v] of Object.entries(total)) {
        assert.ok(Number.isFinite(v), `${l.id}.${k} was ${v} under seed ${seed}`);
      }
    }
  }
});

// ======================================================== event scaling

test('scaleEventDeltas is the identity with no perks', () => {
  const event = buildEventPool().find((e) => e.id === 'bar_fight_night');
  const plain = scaleEventDeltas(event, { hurtfulDampening: 0, helpfulAmplify: 0 });
  assert.equal(plain.sanity, event.sanityDelta);
  assert.equal(plain.money, event.moneyDelta);
});

test('Thick Skin softens harm without ever flipping its sign', () => {
  const event = buildEventPool().find((e) => e.id === 'bar_fight_night');
  const tough = scaleEventDeltas(event, { hurtfulDampening: 0.35, helpfulAmplify: 0 });
  assert.ok(tough.sanity > event.sanityDelta, 'less harm');
  assert.ok(tough.sanity < 0, 'still harm');
});

test('The Long View amplifies rare helpful events only', () => {
  const perks = { hurtfulDampening: 0, helpfulAmplify: 0.4 };
  const helpful = buildEventPool().find((e) => e.id === 'bar_big_tip_night');
  assert.ok(scaleEventDeltas(helpful, perks).money > helpful.moneyDelta);

  const common = buildEventPool().find((e) => e.id === 'unexpected_tips');
  assert.equal(scaleEventDeltas(common, perks).money, common.moneyDelta);
});

test('event scaling always returns whole numbers', () => {
  const perks = { hurtfulDampening: 0.35, helpfulAmplify: 0.4 };
  for (const e of buildEventPool()) {
    for (const v of Object.values(scaleEventDeltas(e, perks))) {
      assert.ok(Number.isInteger(v), `${e.id} produced ${v}`);
    }
  }
});

// ============================================================== the turn

test('a turn at every location leaves the state valid', () => {
  for (const l of LOCATIONS) {
    const gs = fresh(3);
    const em = manager();
    const r = resolveTurn(gs, em, l.id);
    assert.ok(gs.sanity >= 0 && gs.sanity <= MAX_STAT, `${l.id} sanity`);
    assert.ok(gs.money >= 0 && gs.money <= MONEY_HARD_CEILING, `${l.id} money`);
    assert.ok(gs.energy >= 0 && gs.energy <= MAX_ENERGY, `${l.id} energy`);
    assert.ok(gs.reputation >= 0 && gs.reputation <= MAX_REPUTATION, `${l.id} reputation`);
    assert.ok(gs.insight >= 0, `${l.id} insight`);
    assert.equal(r.weather.id, weatherForDay(1, gs.weatherSeed, 'Winter').id);
  }
});

test('a turn records the visit and the journal entry', () => {
  const gs = fresh();
  resolveTurn(gs, quietManager(), 'home_loft');
  assert.ok(gs.visitedLocations.has('home_loft'));
  assert.equal(gs.lastLocationVisited, 'home_loft');
  assert.equal(gs.journal.length, 1);
  assert.equal(gs.journal[0].location, 'home_loft');
  assert.equal(gs.journal[0].day, 1);
  assert.match(gs.journal[0].line, /Rested at the loft/);
});

test('the consecutive-bar counter only counts the bar', () => {
  const gs = fresh();
  const em = quietManager();
  resolveTurn(gs, em, 'bar');
  resolveTurn(gs, em, 'bar');
  assert.equal(gs.consecutiveBarDays, 2);
  resolveTurn(gs, em, 'rooftop');
  assert.equal(gs.consecutiveBarDays, 0, 'any other place breaks the streak');
});

test('night days are counted for the achievement', () => {
  const gs = fresh();
  const em = quietManager();
  resolveTurn(gs, em, 'bar');
  resolveTurn(gs, em, 'home_loft');
  resolveTurn(gs, em, 'night_market');
  assert.equal(gs.nightDays, 2);
});

test('the reported deltas match the actual movement', () => {
  const gs = fresh(11);
  const em = manager(3);
  const ids = locationIds();
  for (let i = 0; i < 12 && !gs.gameOver; i++) {
    const before = {
      sanity: gs.sanity, money: gs.money, energy: gs.energy,
      reputation: gs.reputation, insight: gs.insight,
    };
    const r = resolveTurn(gs, em, ids[i % ids.length]);
    for (const k of Object.keys(before)) {
      assert.equal(r.deltas[k], gs[k] - before[k], `${k} delta mismatch on turn ${i}`);
    }
    assert.equal(r.sanityDelta, r.deltas.sanity, 'legacy alias must agree');
    assert.equal(r.moneyDelta, r.deltas.money);
    if (!gs.gameOver) gs.advanceDay();
  }
});

test('exhaustion is applied and reported by the turn', () => {
  const gs = fresh();
  gs.energy = 0;
  const r = resolveTurn(gs, quietManager(), 'bar');
  assert.equal(r.exhaustion, -6);
});

test('rent is reported as an amount, not a flag', () => {
  const gs = fresh();
  for (let i = 0; i < 3; i++) gs.advanceDay();  // Sunday
  const r = resolveTurn(gs, quietManager(), 'bar');
  assert.equal(r.rentCharged, RENT_AMOUNT);
  assert.match(gs.recentHistory[0], /Paid rent/);
});

test('the union card makes rent permanently cheaper', () => {
  const gs = fresh();
  gs.perks.add('open_hand');
  gs.perks.add('good_name');
  gs.perks.add('tenants_union');
  assert.equal(gs.rentDue(), RENT_AMOUNT - 5);

  for (let i = 0; i < 3; i++) gs.advanceDay();
  const before = gs.money;
  assert.equal(gs.applyRentIfSunday(), RENT_AMOUNT - 5);
  assert.equal(gs.money, before - (RENT_AMOUNT - 5));
});

test('paying ahead buys a quiet Sunday, and only if you can afford it', () => {
  const gs = fresh();
  gs.money = 5;
  assert.equal(gs.prepayRent(1), false, 'cannot prepay what you do not have');

  gs.money = 60;
  assert.equal(gs.prepayRent(1), true);
  assert.equal(gs.money, 60 - RENT_AMOUNT);

  for (let i = 0; i < 3; i++) gs.advanceDay();  // Sunday
  assert.equal(gs.isRentDue(), false, 'already covered');
  assert.equal(gs.applyRentIfSunday(), 0);
});

test('the amnesty festival waives rent entirely', () => {
  const gs = fresh();
  // Walk the calendar to 8 August and land it on a Sunday.
  gs.monthIndex = 7;
  gs.dayOfMonth = 8;
  gs.journeyDay = 4;   // day 4 is a Sunday
  assert.equal(gs.getWeekdayName(), 'Sunday');
  assert.equal(gs.getFestival().id, 'rent_amnesty');
  assert.equal(gs.isRentDue(), false);
  assert.equal(gs.applyRentIfSunday(), 0);
});

test('a turn grants an item when its event says so, once', () => {
  const gs = fresh();
  const em = manager();
  // Force the next event to be the one that hands over a river stone.
  em._allEvents = buildEventPool().filter((e) => e.id === 'the_stone');
  em._nextEventDay = 1;
  const r = resolveTurn(gs, em, 'rooftop');
  assert.equal(r.event.id, 'the_stone');
  assert.equal(r.grantedItem, 'river_stone');
  assert.ok(gs.hasItem('river_stone'));

  // Second time round, the satchel already has one, so nothing is granted.
  em._nextEventDay = 1;
  const again = resolveTurn(gs, em, 'rooftop');
  assert.equal(again.grantedItem, null);
});

test('the turn skips its event once the game is over', () => {
  const gs = fresh();
  gs.gameOver = true;
  const r = resolveTurn(gs, manager(), 'bar');
  assert.equal(r.event, null);
});

// ============================================================== contracts

test('a contract can be accepted once and progresses on qualifying days', () => {
  const gs = fresh();
  assert.equal(gs.acceptContract('barrets_books'), true);
  assert.equal(gs.acceptContract('barrets_books'), false, 'no double-booking');
  assert.equal(gs.isContractActive('barrets_books'), true);

  const em = quietManager();
  resolveTurn(gs, em, 'bar');
  assert.equal(gs.activeContracts[0].progress, 1);
  resolveTurn(gs, em, 'home_loft');
  assert.equal(gs.activeContracts[0].progress, 1, 'the loft is not a bar shift');
});

test('accepting an unknown contract fails', () => {
  const gs = fresh();
  assert.equal(gs.acceptContract('sell_your_soul'), false);
});

test('no more than three commitments at a time', () => {
  const gs = fresh();
  assert.equal(gs.acceptContract('winter_fuel'), true);
  assert.equal(gs.acceptContract('barrets_books'), true);
  assert.equal(gs.acceptContract('ninety_day_sit'), true);
  assert.equal(gs.acceptContract('quiet_month'), false, 'three is the limit');
  assert.equal(gs.activeContracts.length, 3);
});

test('completing a contract pays out, grants its item and cannot be retaken', () => {
  const gs = fresh();
  const contract = getContract('barrets_books');
  gs.acceptContract('barrets_books');
  const em = quietManager();

  let finished = [];
  for (let i = 0; i < contract.need; i++) {
    finished = resolveTurn(gs, em, 'bar').completedContracts;
  }
  assert.equal(finished.length, 1);
  assert.equal(finished[0].id, 'barrets_books');
  assert.deepEqual(gs.completedContracts, ['barrets_books']);
  assert.equal(gs.activeContracts.length, 0);
  assert.ok(gs.hasItem(contract.reward.item), 'the reward item should be in the satchel');
  assert.equal(gs.acceptContract('barrets_books'), false, 'done is done');
});

test('a tag contract counts every location carrying the tag', () => {
  const gs = fresh();
  gs.acceptContract('winter_fuel');   // requires the work tag
  const em = quietManager();
  resolveTurn(gs, em, 'bar');
  resolveTurn(gs, em, 'farmers_market');
  assert.equal(gs.activeContracts[0].progress, 2);
});

test('a missed deadline costs reputation and is recorded', () => {
  const gs = fresh();
  const contract = getContract('barrets_books');
  gs.acceptContract('barrets_books');
  const before = gs.reputation;

  for (let i = 0; i <= contract.days; i++) gs.advanceDay();

  assert.equal(gs.activeContracts.length, 0);
  assert.deepEqual(gs.failedContracts, ['barrets_books']);
  assert.equal(gs.reputation, before + contract.penalty.reputation);
});

test('expireContracts is a no-op when nothing has lapsed', () => {
  const gs = fresh();
  gs.acceptContract('barrets_books');
  assert.deepEqual(gs.expireContracts(), []);
  assert.equal(gs.activeContracts.length, 1);
});

test('contracts_changed fires on accept, completion and expiry', () => {
  const gs = fresh();
  let count = 0;
  gs.on('contracts_changed', () => { count += 1; });
  gs.acceptContract('barrets_books');
  assert.equal(count, 1);

  const em = quietManager();
  for (let i = 0; i < getContract('barrets_books').need; i++) resolveTurn(gs, em, 'bar');
  assert.equal(count, 2);
});

// =========================================================== achievements

test('achievements are awarded once and emitted', () => {
  const gs = fresh();
  const seen = [];
  gs.on('achievement_earned', (a) => seen.push(a.id));

  gs.journeyDay = 7;
  const first = gs.checkAchievements();
  assert.ok(first.some((a) => a.id === 'first_week'));
  assert.deepEqual(gs.checkAchievements(), [], 'never twice');
  assert.equal(seen.filter((id) => id === 'first_week').length, 1);
});

test('the snapshot reflects live state', () => {
  const gs = fresh();
  gs.addItem('thermos');
  gs.perks.add('steady_breath');
  gs.reputation = 44;
  gs.noteVisit('bar');

  const snap = gs.achievementSnapshot();
  assert.equal(snap.reputation, 44);
  assert.deepEqual(snap.items, ['thermos']);
  assert.equal(snap.perks.size, 1);
  assert.equal(snap.totalLocations, LOCATIONS.length);
  assert.deepEqual(snap.locationTags, getLocation('bar').tags);
});

test('the snapshot accepts overrides for one-off checks', () => {
  const gs = fresh();
  assert.equal(gs.achievementSnapshot({ money: 999 }).money, 999);
});

test('achievements are picked up over the course of a real run', () => {
  const gs = fresh(9);
  const em = manager(9);
  for (let i = 0; i < 40 && !gs.gameOver; i++) {
    resolveTurn(gs, em, i % 3 === 0 ? 'bar' : (i % 3 === 1 ? 'spiritual_community' : 'home_loft'));
    if (!gs.gameOver) gs.advanceDay();
  }
  assert.ok(gs.achievements.size > 0, 'a forty-day run should earn something');
  assert.ok(gs.achievements.has('first_week'));
});

// ============================================================ save / load

test('a run round-trips through toJSON and loadFrom', () => {
  const gs = fresh(555);
  const em = manager();
  gs.acceptContract('barrets_books');
  gs.addItem('thermos');
  gs.insight = 12;
  gs.buyPerk('steady_breath');
  for (let i = 0; i < 5; i++) { resolveTurn(gs, em, 'bar'); gs.advanceDay(); }

  const snapshot = JSON.parse(JSON.stringify(gs.toJSON()));
  const restored = new GameState();
  assert.equal(restored.loadFrom(snapshot), true);

  for (const k of ['sanity', 'money', 'energy', 'reputation', 'insight',
    'journeyDay', 'dayOfMonth', 'monthIndex', 'year', 'weatherSeed',
    'nightDays', 'rentPaidCount', 'consecutiveBarDays']) {
    assert.equal(restored[k], gs[k], `${k} did not survive the round trip`);
  }
  assert.deepEqual(restored.items, gs.items);
  assert.deepEqual([...restored.perks], [...gs.perks]);
  assert.deepEqual([...restored.visitedLocations], [...gs.visitedLocations]);
  assert.deepEqual(restored.activeContracts, gs.activeContracts);
  assert.equal(restored.getDateDisplay(), gs.getDateDisplay());
  assert.equal(restored.getWeather().id, gs.getWeather().id, 'the sky must restore too');
});

test('loadFrom rejects junk without throwing', () => {
  const gs = fresh();
  for (const junk of [null, undefined, 42, 'save', [], {}, { v: 1 }, { v: 99 }]) {
    assert.equal(gs.loadFrom(junk), false, `accepted ${JSON.stringify(junk)}`);
  }
  assert.equal(gs.journeyDay, 1, 'state must be untouched by a failed load');
});

test('loadFrom sanitises out-of-range and malformed fields', () => {
  const gs = fresh();
  assert.equal(gs.loadFrom({
    v: 3,
    sanity: 9999,
    money: -50,
    energy: 'lots',
    reputation: NaN,
    insight: -10,
    journeyDay: -3,
    monthIndex: 40,
    dayOfMonth: 99,
    items: ['thermos', 'not_a_thing'],
    perks: ['steady_breath', 'telekinesis'],
    activeContracts: [{ id: 'barrets_books', progress: 1, need: 4, expiresOn: 9 }, { id: 'nope' }, null],
    recentHistory: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
    journal: 'not an array',
  }), true);

  assert.equal(gs.sanity, MAX_STAT);
  assert.equal(gs.money, 0);
  assert.equal(gs.energy, START_ENERGY, 'a non-number falls back to the default');
  assert.equal(gs.reputation, START_REPUTATION);
  assert.equal(gs.insight, 0);
  assert.equal(gs.journeyDay, 1);
  assert.equal(gs.monthIndex, 11);
  assert.equal(gs.dayOfMonth, 31);
  assert.deepEqual(gs.items, ['thermos']);
  assert.deepEqual([...gs.perks], ['steady_breath']);
  assert.equal(gs.activeContracts.length, 1);
  assert.equal(gs.recentHistory.length, 5);
  assert.deepEqual(gs.journal, []);
});

test('saveStore round-trips through a storage object', () => {
  const storage = fakeStorage();
  const gs = fresh(31);
  gs.journeyDay = 14;
  gs.addItem('notebook');

  assert.equal(saveStore.has(storage), false);
  assert.equal(saveStore.save(gs, storage), true);
  assert.equal(saveStore.has(storage), true);

  const restored = new GameState();
  assert.equal(saveStore.load(restored, storage), true);
  assert.equal(restored.journeyDay, 14);
  assert.deepEqual(restored.items, ['notebook']);

  assert.equal(saveStore.clear(storage), true);
  assert.equal(saveStore.has(storage), false);
  assert.equal(saveStore.load(new GameState(), storage), false);
});

test('saveStore is inert without storage, and never throws', () => {
  const gs = fresh();
  assert.equal(saveStore.available(null), false);
  assert.equal(saveStore.save(gs, null), false);
  assert.equal(saveStore.load(gs, null), false);
  assert.equal(saveStore.clear(null), false);
  assert.equal(saveStore.has(null), false);
});

test('saveStore survives a storage that throws on every call', () => {
  const hostile = {
    getItem() { throw new Error('denied'); },
    setItem() { throw new Error('quota'); },
    removeItem() { throw new Error('denied'); },
  };
  const gs = fresh();
  assert.equal(saveStore.save(gs, hostile), false);
  assert.equal(saveStore.load(gs, hostile), false);
  assert.equal(saveStore.clear(hostile), false);
  assert.equal(saveStore.has(hostile), false);
});

test('saveStore ignores corrupt JSON in the slot', () => {
  const storage = fakeStorage();
  storage.setItem(SAVE_KEY, '{not json');
  assert.equal(saveStore.load(new GameState(), storage), false);
});

// ================================================================= resets

test('resetGame clears every accumulated system', () => {
  const gs = fresh(8);
  const em = manager();
  gs.acceptContract('barrets_books');
  gs.addItem('thermos');
  gs.insight = 20;
  gs.buyPerk('steady_breath');
  for (let i = 0; i < 6; i++) { resolveTurn(gs, em, 'bar'); gs.advanceDay(); }

  gs.resetGame();

  assert.equal(gs.journeyDay, 1);
  assert.equal(gs.energy, START_ENERGY);
  assert.equal(gs.reputation, START_REPUTATION);
  assert.equal(gs.insight, 0);
  assert.deepEqual(gs.items, []);
  assert.equal(gs.perks.size, 0);
  assert.equal(gs.achievements.size, 0);
  assert.equal(gs.visitedLocations.size, 0);
  assert.equal(gs.activeContracts.length, 0);
  assert.equal(gs.journal.length, 0);
  assert.equal(gs.nightDays, 0);
  assert.equal(gs.getDateDisplay(), 'Thursday, January 1, 2026');
});

test('a seeded run has a stable weather seed across resets within a run', () => {
  const gs = new GameState({ seed: 4242 });
  assert.equal(gs.weatherSeed, 4242);
  gs.resetGame();
  assert.equal(gs.weatherSeed, 4242, 'a fixed seed must survive a restart');
});

test('an unseeded run still gets a usable weather seed', () => {
  const gs = new GameState();
  assert.ok(Number.isFinite(gs.weatherSeed));
  assert.ok(gs.getWeather().id.length > 0);
});

// ============================================================ simulation

test('long randomised runs across the whole city never go invalid', () => {
  const ids = locationIds();
  for (let seed = 0; seed < 12; seed++) {
    const rng = createRng(seed);
    const gs = new GameState({ seed });
    const em = new EventManager(rng);
    em.initialize(gs.getCharacterNames());

    for (let turn = 0; turn < 200 && !gs.gameOver; turn++) {
      resolveTurn(gs, em, ids[Math.floor(rng.random() * ids.length)]);
      assert.ok(gs.sanity >= 0 && gs.sanity <= MAX_STAT, `sanity ${gs.sanity}`);
      assert.ok(gs.money >= 0 && gs.money <= MONEY_HARD_CEILING, `money ${gs.money}`);
      assert.ok(gs.energy >= 0 && gs.energy <= MAX_ENERGY, `energy ${gs.energy}`);
      assert.ok(gs.reputation >= 0 && gs.reputation <= MAX_REPUTATION, `rep ${gs.reputation}`);
      assert.ok(Number.isFinite(gs.insight) && gs.insight >= 0);
      assert.ok(gs.recentHistory.length <= 5);
      assert.ok(gs.activeContracts.length <= 3);
      if (!gs.gameOver) gs.advanceDay();
    }
  }
});

test('resting forever is not a winning strategy', () => {
  // The loft costs money every day and earns none, so idling must eventually
  // bankrupt you. Without this the whole economy has an exploit in it.
  const gs = fresh(2);
  const em = manager(2);
  let turns = 0;
  while (!gs.gameOver && turns < 400) {
    resolveTurn(gs, em, 'home_loft');
    if (!gs.gameOver) gs.advanceDay();
    turns += 1;
  }
  assert.ok(gs.gameOver, 'idling should eventually end the run');
});

test('a sensible rotation survives noticeably longer than bar-only play', () => {
  const rotate = ['spiritual_community', 'bar', 'bar', 'home_loft'];
  let rotationTurns = 0;
  {
    const gs = fresh(6);
    const em = manager(6);
    while (!gs.gameOver && rotationTurns < 160) {
      resolveTurn(gs, em, rotate[rotationTurns % rotate.length]);
      if (!gs.gameOver) gs.advanceDay();
      rotationTurns += 1;
    }
  }

  let barTurns = 0;
  {
    const gs = fresh(6);
    const em = manager(6);
    while (!gs.gameOver && barTurns < 160) {
      resolveTurn(gs, em, 'bar');
      if (!gs.gameOver) gs.advanceDay();
      barTurns += 1;
    }
  }

  assert.ok(rotationTurns > barTurns, `rotation ${rotationTurns} vs bar-only ${barTurns}`);
});

test('the journal is bounded on a very long run', () => {
  const gs = fresh(1);
  for (let i = 0; i < 500; i++) {
    gs.addJournal({ location: 'bar', locationName: 'The Bar', line: 'x' });
  }
  assert.ok(gs.journal.length <= 400, `journal grew to ${gs.journal.length}`);
});

test('items and perks together never break the invariants', () => {
  const gs = fresh(77);
  gs.insight = 1000;
  for (const id of perkIds()) gs.buyPerk(id);
  for (const id of ['prayer_beads', 'thermos', 'tip_jar', 'rain_shell', 'notebook', 'good_boots']) {
    gs.addItem(id);
  }
  const em = manager(77);
  for (let i = 0; i < 80 && !gs.gameOver; i++) {
    resolveTurn(gs, em, LOCATIONS[i % LOCATIONS.length].id);
    assert.ok(gs.sanity <= MAX_STAT && gs.money <= MONEY_HARD_CEILING && gs.energy <= MAX_ENERGY);
    if (!gs.gameOver) gs.advanceDay();
  }
});

test('every item kind is exercised end to end', () => {
  const gs = fresh();
  const byKind = {};
  for (const kind of Object.values(ItemKind)) {
    byKind[kind] = getItem(['prayer_beads', 'strong_coffee', 'river_stone']
      .find((id) => getItem(id).kind === kind));
  }
  assert.ok(byKind[ItemKind.PASSIVE] && byKind[ItemKind.CONSUMABLE] && byKind[ItemKind.KEEPSAKE]);

  gs.addItem(byKind[ItemKind.PASSIVE].id);
  gs.addItem(byKind[ItemKind.CONSUMABLE].id);
  gs.addItem(byKind[ItemKind.KEEPSAKE].id);
  gs.energy = 10;
  assert.ok(gs.useItem(byKind[ItemKind.CONSUMABLE].id));
  assert.ok(gs.energy > 10);
  assert.ok(gs.sellItem(byKind[ItemKind.KEEPSAKE].id) > 0);
  assert.equal(gs.items.length, 1);
});

// ---------------- homely / money / win ----------------

test('money is a separate uncapped resource that still ends the run at 0', () => {
  const gs = fresh();
  gs.applyDeltas({ money: 200 });
  assert.ok(gs.money > 100);
  gs.money = 0;
  assert.equal(gs.checkGameOver(), true);
  assert.match(gs.gameOverMessage, /broke/i);
});

test('checkWin fires once at the endurance goal and does not end the run', () => {
  const gs = fresh();
  gs.journeyDay = ENDURANCE_GOAL_DAYS;
  assert.equal(gs.checkWin(), true);
  assert.equal(gs.won, true);
  assert.equal(gs.gameOver, false);
  assert.equal(gs.checkWin(), false, 'only once');
  assert.ok(gs.winMessage.length > 0);
});

test('getGreeting and getProtagonist always return something useful', () => {
  const gs = fresh();
  assert.ok(gs.getGreeting().length > 10);
  const leon = gs.getProtagonist();
  assert.equal(leon.id, 'leon');
  assert.match(leon.name, /L/);
  assert.ok(leon.portrait.includes('leon'));
});

test('every location names a real host character', () => {
  const gs = fresh();
  const ids = new Set(gs.getAllCharacters().map((c) => c.id));
  for (const l of LOCATIONS) {
    assert.ok(l.host, `${l.id} missing host`);
    assert.ok(ids.has(l.host), `${l.id} host ${l.host} unknown`);
  }
});

test('every event names a real character', () => {
  const gs = fresh();
  const ids = new Set(gs.getAllCharacters().map((c) => c.id));
  for (const e of buildEventPool()) {
    assert.ok(e.character, `${e.id} missing character`);
    assert.ok(ids.has(e.character), `${e.id} character ${e.character} unknown`);
  }
});

test('resolveTurn reports justWon when the endurance goal is crossed', () => {
  const gs = fresh();
  gs.journeyDay = ENDURANCE_GOAL_DAYS;
  gs.sanity = 80;
  gs.money = 80;
  gs.energy = 80;
  const em = manager(7);
  const r = resolveTurn(gs, em, 'spiritual_community');
  assert.equal(r.justWon, true);
  assert.equal(gs.won, true);
  assert.equal(r.gameOver, false);
});
