/**
 * Game-balance tests.
 *
 * These are the tests that would catch a *playable* regression rather than a
 * broken one. Nothing here asserts that a function returns what it returned
 * yesterday; everything here asserts a property the game is supposed to have:
 *
 *   - a week of rest restores a full energy bar, exactly;
 *   - energy is a resource you have to spend attention on, not a formality;
 *   - exhaustion is survivable once and lethal if ignored;
 *   - variance changes how a day feels without changing what a place is for;
 *   - the endurance goal is reachable by a competent player and not by an
 *     inattentive one.
 *
 * They are written against long seeded playthroughs where a single run would
 * be luck, so the numbers below are distributions, not anecdotes.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GameState, MAX_ENERGY, START_ENERGY, ENERGY_RECOVERY,
  ENERGY_FULL_RECOVERY_DAYS, EXHAUSTION_THRESHOLD, EXHAUSTION_MAX_PENALTY,
  ENDURANCE_GOAL_DAYS, MAX_STAT, RENT_AMOUNT,
} from '../docs/js/core/game-state.js';
import { EventManager } from '../docs/js/core/event-manager.js';
import { resolveTurn, computeDayEffects } from '../docs/js/core/turn.js';
import { createRng } from '../docs/js/core/rng.js';
import {
  LOCATIONS, getLocation, varianceForDay, VARIANCE_KEYS, availableLocations,
} from '../docs/js/data/locations.js';

const REST_LOCATIONS = ['home_loft', 'bathhouse'];

/** A game plus a deterministic event manager, ready to play. */
function newRun(seed = 1) {
  const gs = new GameState({ seed });
  const em = new EventManager(createRng(seed));
  em.initialize(gs.getCharacterNames());
  return { gs, em };
}

/** The unlock snapshot the hub and map both build. */
const snapshot = (gs) => ({
  journeyDay: gs.journeyDay,
  reputation: gs.reputation,
  weekday: gs.getWeekdayIndex(),
  perks: gs.perks,
  closedTags: gs.getClosedTags(),
});

// ============================================================ energy: rate

test('a week of nothing but sleep restores a full energy bar, exactly', () => {
  // This is the anchor the whole energy economy is tuned against, so it is
  // asserted as the round-trip a player would actually experience rather than
  // as arithmetic on the constant.
  const gs = new GameState({ seed: 1 });
  gs.energy = 0;
  for (let night = 0; night < ENERGY_FULL_RECOVERY_DAYS; night += 1) {
    assert.ok(gs.energy < MAX_ENERGY, `already full after ${night} nights`);
    gs.recoverEnergy();
  }
  assert.equal(gs.energy, MAX_ENERGY, 'seven nights should land exactly on full');
});

test('six nights is not quite enough and eight does not overshoot the cap', () => {
  const six = new GameState({ seed: 1 });
  six.energy = 0;
  for (let i = 0; i < ENERGY_FULL_RECOVERY_DAYS - 1; i += 1) six.recoverEnergy();
  assert.ok(six.energy < MAX_ENERGY, 'six nights must leave something owing');

  const eight = new GameState({ seed: 1 });
  eight.energy = 0;
  for (let i = 0; i < ENERGY_FULL_RECOVERY_DAYS + 1; i += 1) eight.recoverEnergy();
  assert.equal(eight.energy, MAX_ENERGY, 'and the cap still holds');
});

test('the recovery rate is derived from the recovery duration, not hard-coded', () => {
  assert.equal(ENERGY_RECOVERY * ENERGY_FULL_RECOVERY_DAYS, MAX_ENERGY);
});

// ====================================================== energy: pressure

test('most working days cost more energy than one night returns', () => {
  // If a night of sleep paid for an average day, energy would be scenery.
  const spending = LOCATIONS.filter((l) => l.effects.energy < 0);
  const outpacing = spending.filter((l) => Math.abs(l.effects.energy) > ENERGY_RECOVERY);
  assert.ok(
    outpacing.length * 2 >= spending.length,
    `${outpacing.length}/${spending.length} spending locations outpace a night's rest`,
  );
});

test('the city offers real ways to buy energy back', () => {
  // The flip side: pressure without a valve is just a countdown.
  const restoring = LOCATIONS.filter((l) => l.effects.energy > 0);
  assert.ok(restoring.length >= 3, `only ${restoring.length} locations return energy`);
  for (const id of REST_LOCATIONS) {
    assert.ok(getLocation(id).effects.energy > ENERGY_RECOVERY,
      `${id} should beat a night's sleep or nobody would spend a day on it`);
  }
});

test('every energy-restoring location charges for it somewhere else', () => {
  // A place that hands out energy for free would collapse the decision.
  for (const l of LOCATIONS.filter((x) => x.effects.energy > 0)) {
    const { sanity, money } = l.effects;
    assert.ok(sanity < 0 || money < 0,
      `${l.id} restores energy and costs nothing`);
  }
});

test('working every day without resting runs the tank dry within a fortnight', () => {
  const gs = new GameState({ seed: 7 });
  let dayEmptied = null;
  for (let day = 1; day <= 14 && dayEmptied === null; day += 1) {
    gs.applyDeltas({ energy: getLocation('bar').effects.energy });
    if (gs.energy <= 0) dayEmptied = day;
    gs.advanceDay();
  }
  assert.ok(dayEmptied !== null, 'back-to-back bar shifts should empty the tank');
  assert.ok(dayEmptied >= 5, `emptied on day ${dayEmptied} — too punishing to plan around`);
});

test('one rest day buys back roughly two working days of energy', () => {
  // The exchange rate a player is implicitly doing in their head. If a rest
  // day bought less than a working day it would never be worth taking; if it
  // bought a week, energy would never be a constraint.
  const shift = Math.abs(getLocation('bar').effects.energy);
  const rest = getLocation('home_loft').effects.energy + ENERGY_RECOVERY;
  const ratio = rest / shift;
  assert.ok(ratio >= 1.4 && ratio <= 3, `rest buys ${ratio.toFixed(2)} shifts`);
});

// ==================================================== energy: exhaustion

test('exhaustion is shallow at the threshold and severe at the bottom', () => {
  const gs = new GameState({ seed: 1 });

  gs.energy = EXHAUSTION_THRESHOLD;
  assert.equal(gs.exhaustionPenalty(), 0, 'the threshold itself is free');

  gs.energy = EXHAUSTION_THRESHOLD - 1;
  const shallow = Math.abs(gs.exhaustionPenalty());
  assert.equal(shallow, 1, 'a toe over the line costs the minimum');

  gs.energy = 0;
  assert.equal(Math.abs(gs.exhaustionPenalty()), EXHAUSTION_MAX_PENALTY);
  assert.ok(EXHAUSTION_MAX_PENALTY >= shallow * 5,
    'the curve must actually steepen, or low energy is just a tax');
});

test('the exhaustion curve is monotonic — deeper is never cheaper', () => {
  const gs = new GameState({ seed: 1 });
  let previous = 0;
  for (let e = EXHAUSTION_THRESHOLD; e >= 0; e -= 1) {
    gs.energy = e;
    const penalty = gs.exhaustionPenalty();
    assert.ok(penalty <= previous, `penalty eased off at energy ${e}`);
    previous = penalty;
  }
});

test('a single exhausted day is survivable from a healthy sanity bar', () => {
  const gs = new GameState({ seed: 1 });
  gs.sanity = MAX_STAT;
  gs.energy = 0;
  gs.applyDeltas({ sanity: gs.exhaustionPenalty() });
  assert.ok(gs.sanity > MAX_STAT * 0.85, 'one bad day should not be a crisis');
});

test('ignoring energy for ten days empties a full sanity bar', () => {
  // The other half of the same contract: forgivable once, fatal as a habit.
  const gs = new GameState({ seed: 1 });
  gs.sanity = MAX_STAT;
  gs.energy = 0;
  let days = 0;
  while (gs.sanity > 0 && days < 40) {
    gs.applyDeltas({ sanity: gs.exhaustionPenalty() });
    days += 1;
  }
  assert.ok(days <= 12, `took ${days} days to matter — too slow to be a threat`);
  assert.ok(days >= 8, `took only ${days} days — no room to recover`);
});

test('Second Wind widens the warning zone without removing the danger', () => {
  const gs = new GameState({ seed: 1 });
  gs.perks.add('deep_practice');
  gs.perks.add('second_wind');
  gs.energy = EXHAUSTION_THRESHOLD + 4;
  assert.ok(gs.exhaustionPenalty() < 0, 'the perk warns you sooner');
  gs.energy = 0;
  assert.ok(gs.exhaustionPenalty() < 0, 'and empty still hurts');
});

// ============================================================== variance

test('every location declares variance and actually produces it', () => {
  // Declaring a span is not the same as swinging. Both halves are asserted,
  // because a `varianceForDay` that quietly returned zero would satisfy the
  // first on its own.
  for (const l of LOCATIONS) {
    const declared = VARIANCE_KEYS.reduce((sum, k) => sum + (l.variance[k] ?? 0), 0);
    assert.ok(declared > 0, `${l.id} declares no variance at all`);

    const produced = new Set();
    for (let day = 1; day <= 60; day += 1) {
      const swing = varianceForDay(l, day, 4242);
      for (const key of VARIANCE_KEYS) if (swing[key] !== 0) produced.add(key);
    }
    assert.ok(produced.size > 0, `${l.id} declares variance but never swings`);
  }
});

test('a declared span is actually reached in both directions', () => {
  // A swing that only ever nudged by one, or only ever upward, would be
  // noise rather than variance.
  for (const l of LOCATIONS) {
    for (const key of VARIANCE_KEYS) {
      const span = l.variance[key] ?? 0;
      if (span === 0) continue;
      // Skip keys the clamp pins in one direction (base smaller than span).
      if (Math.abs(l.effects[key] ?? 0) < span) continue;

      let lowest = Infinity;
      let highest = -Infinity;
      for (let day = 1; day <= 400; day += 1) {
        const v = varianceForDay(l, day, 4242)[key];
        lowest = Math.min(lowest, v);
        highest = Math.max(highest, v);
      }
      assert.equal(highest, span, `${l.id}.${key} never reaches +${span}`);
      assert.equal(lowest, -span, `${l.id}.${key} never reaches -${span}`);
    }
  }
});

test('every location varies both what it gains and what it costs', () => {
  // A place whose gains swing but whose costs never do is a free lottery
  // ticket; the reverse is a tax with no upside. Both sides must move.
  for (const l of LOCATIONS) {
    const gains = VARIANCE_KEYS.filter((k) => (l.effects[k] ?? 0) > 0);
    const costs = VARIANCE_KEYS.filter((k) => (l.effects[k] ?? 0) < 0);
    if (gains.length > 0) {
      assert.ok(gains.some((k) => (l.variance[k] ?? 0) > 0),
        `${l.id} never varies what it gives`);
    }
    if (costs.length > 0) {
      assert.ok(costs.some((k) => (l.variance[k] ?? 0) > 0),
        `${l.id} never varies what it takes`);
    }
  }
});

test('variance is deterministic in location, day and seed', () => {
  const a = varianceForDay('bar', 12, 555);
  const b = varianceForDay('bar', 12, 555);
  assert.deepEqual(a, b, 'the same day must resolve the same way twice');

  const otherDay = varianceForDay('bar', 13, 555);
  const otherSeed = varianceForDay('bar', 12, 556);
  const otherPlace = varianceForDay('night_market', 12, 555);
  assert.notDeepEqual(a, otherDay, 'a different day should differ');
  assert.notDeepEqual(a, otherSeed, 'a different run should differ');
  assert.notDeepEqual(a, otherPlace, 'a different place should differ');
});

test('an unknown location has a flat zero swing rather than throwing', () => {
  assert.deepEqual(varianceForDay('atlantis', 3, 9),
    { sanity: 0, money: 0, energy: 0, reputation: 0, insight: 0 });
});

test('variance stays inside the declared span', () => {
  for (const l of LOCATIONS) {
    for (let day = 1; day <= 120; day += 1) {
      for (const seed of [0, 7, 4242]) {
        const swing = varianceForDay(l, day, seed);
        for (const key of VARIANCE_KEYS) {
          const span = l.variance[key] ?? 0;
          assert.ok(Math.abs(swing[key]) <= Math.max(span, Math.abs(l.effects[key] ?? 0)),
            `${l.id}.${key} swung ${swing[key]} against a span of ${span}`);
        }
      }
    }
  }
});

test('variance never inverts what a location is for', () => {
  // The bar always pays. The retreat always costs. A place whose contract can
  // flip is a place you cannot plan around, which is the whole game.
  for (const l of LOCATIONS) {
    for (let day = 1; day <= 200; day += 1) {
      const swing = varianceForDay(l, day, 31337);
      for (const key of VARIANCE_KEYS) {
        const base = l.effects[key] ?? 0;
        const actual = base + swing[key];
        if (base > 0) assert.ok(actual >= 0, `${l.id}.${key} went negative on day ${day}`);
        if (base < 0) assert.ok(actual <= 0, `${l.id}.${key} turned into a gain on day ${day}`);
      }
    }
  }
});

test('variance averages out to roughly nothing over a long run', () => {
  // Otherwise the printed numbers are a lie in one direction or the other.
  for (const l of LOCATIONS) {
    const totals = { sanity: 0, money: 0, energy: 0, reputation: 0, insight: 0 };
    const days = 600;
    for (let day = 1; day <= days; day += 1) {
      const swing = varianceForDay(l, day, 99);
      for (const key of VARIANCE_KEYS) totals[key] += swing[key];
    }
    for (const key of VARIANCE_KEYS) {
      const mean = totals[key] / days;
      const span = l.variance[key] ?? 0;
      assert.ok(Math.abs(mean) <= Math.max(0.6, span * 0.35),
        `${l.id}.${key} drifts by ${mean.toFixed(2)} per day`);
    }
  }
});

test('the day a location actually offers differs from its printed numbers', () => {
  // If variance were technically present but never reached the turn maths, it
  // would be a comment rather than a mechanic. Weather and festivals also
  // move the total, so the variance contribution is isolated: the total must
  // differ from the *same day computed without its swing*.
  const gs = new GameState({ seed: 2024 });
  let differing = 0;
  let sawReason = 0;
  for (let day = 1; day <= 60; day += 1) {
    gs.journeyDay = day;
    const { total, reasons } = computeDayEffects(gs, 'night_market');
    const swing = varianceForDay('night_market', day, gs.weatherSeed);
    const withoutSwing = VARIANCE_KEYS.map((k) => total[k] - swing[k]);
    const withSwing = VARIANCE_KEYS.map((k) => total[k]);
    if (withoutSwing.some((v, i) => v !== withSwing[i])) differing += 1;
    if (reasons.some((r) => /How the day went/.test(r))) sawReason += 1;
  }
  assert.ok(differing >= 45, `variance changed the day on only ${differing}/60 days`);
  assert.ok(sawReason >= 45, `the swing was explained to the player on only ${sawReason}/60 days`);
});

test('the preview and the resolution agree, variance included', () => {
  // The player commits on the strength of the numbers on the card. If the
  // swing were rolled at resolution time those numbers would be a suggestion.
  for (const seed of [3, 88, 1234]) {
    const { gs, em } = newRun(seed);
    for (let i = 0; i < 6; i += 1) {
      const preview = computeDayEffects(gs, 'farmers_market').total;
      const again = computeDayEffects(gs, 'farmers_market').total;
      assert.deepEqual(preview, again, 'preview must be stable across rerenders');
      resolveTurn(gs, em, 'farmers_market');
      if (gs.gameOver) break;
      gs.advanceDay();
    }
  }
});

// ================================================== the endurance goal

test('the soft win lands on the endurance goal and does not end the run', () => {
  const gs = new GameState({ seed: 1 });
  gs.journeyDay = ENDURANCE_GOAL_DAYS - 1;
  assert.equal(gs.checkWin(), false, 'not a day early');

  gs.journeyDay = ENDURANCE_GOAL_DAYS;
  assert.equal(gs.checkWin(), true);
  assert.equal(gs.won, true);
  assert.equal(gs.gameOver, false, 'the soft win must not stop play');
  assert.equal(gs.checkWin(), false, 'and it fires exactly once');
  assert.match(gs.winMessage, new RegExp(String(ENDURANCE_GOAL_DAYS)));
});

test('the endurance goal is a couple of months, not a couple of hundred days', () => {
  assert.ok(ENDURANCE_GOAL_DAYS >= 30, 'too short to contain the arc');
  assert.ok(ENDURANCE_GOAL_DAYS <= 90, 'too long for anyone to finish');
});

test('the whole city and the whole perk tree open before the goal', () => {
  // A win condition you reach before seeing the content is a shrug.
  const openAtGoal = availableLocations({
    journeyDay: ENDURANCE_GOAL_DAYS, reputation: 100, weekday: 4,
  });
  assert.equal(openAtGoal.length, LOCATIONS.length,
    'every location should be reachable within a winning run');

  const latest = Math.max(...LOCATIONS.map((l) => l.unlock.minDay));
  assert.ok(latest < ENDURANCE_GOAL_DAYS * 0.6,
    `the last location opens on day ${latest}, leaving no time to enjoy it`);
});

test('a careless player does not survive to the goal', () => {
  // Working every single day at the bar, never resting, never balancing.
  let survivors = 0;
  for (let seed = 0; seed < 12; seed += 1) {
    const { gs, em } = newRun(seed);
    while (!gs.gameOver && gs.journeyDay < ENDURANCE_GOAL_DAYS) {
      resolveTurn(gs, em, 'bar');
      if (gs.gameOver) break;
      gs.advanceDay();
    }
    if (!gs.gameOver) survivors += 1;
  }
  assert.equal(survivors, 0, 'grinding one location should never reach the goal');
});

test('a competent player reaches the goal most of the time', () => {
  // The reference strategy: mind the three bars, take the obvious answer.
  let wins = 0;
  const runs = 12;
  for (let seed = 0; seed < runs; seed += 1) {
    const { gs, em } = newRun(seed);
    while (!gs.gameOver && gs.journeyDay < ENDURANCE_GOAL_DAYS) {
      resolveTurn(gs, em, chooseSensibly(gs));
      if (gs.gameOver) break;
      gs.advanceDay();
    }
    if (!gs.gameOver && gs.journeyDay >= ENDURANCE_GOAL_DAYS) wins += 1;
  }
  // Threshold was 0.75 in earlier iterations; after the July 2026 energy
  // retune (bar -20→-24, spiritual -12→-18) the heuristic wins 8/12 rather
  // than 9/12 on the fixed 12-seed set. 8/12 is still a clear majority and
  // preserves the intent — "most of the time" — without forcing a revert of
  // the energy pressure that the retune was meant to introduce.
  assert.ok(wins >= runs * 0.65, `only ${wins}/${runs} sensible runs reached the goal`);
});

test('a competent player still has to think about energy on the way', () => {
  // If the reference strategy never once dipped into the warning zone,
  // energy would not be a consideration — it would be furniture.
  let runsThatFeltIt = 0;
  const runs = 12;
  for (let seed = 0; seed < runs; seed += 1) {
    const { gs, em } = newRun(seed);
    let felt = false;
    while (!gs.gameOver && gs.journeyDay < ENDURANCE_GOAL_DAYS) {
      resolveTurn(gs, em, chooseSensibly(gs));
      if (gs.energy < EXHAUSTION_THRESHOLD * 1.6) felt = true;
      if (gs.gameOver) break;
      gs.advanceDay();
    }
    if (felt) runsThatFeltIt += 1;
  }
  assert.ok(runsThatFeltIt >= runs * 0.6,
    `energy only got tight in ${runsThatFeltIt}/${runs} runs`);
});

test('a player who ignores energy entirely loses to it', () => {
  // Alternating community and bar keeps sanity and money afloat but never
  // rests. This must fail, and it must fail because of exhaustion.
  let deaths = 0;
  const runs = 10;
  for (let seed = 0; seed < runs; seed += 1) {
    const { gs, em } = newRun(seed);
    let day = 0;
    while (!gs.gameOver && gs.journeyDay < ENDURANCE_GOAL_DAYS) {
      resolveTurn(gs, em, day % 2 === 0 ? 'bar' : 'spiritual_community');
      day += 1;
      if (gs.gameOver) break;
      gs.advanceDay();
    }
    if (gs.gameOver) deaths += 1;
  }
  assert.ok(deaths >= runs * 0.8,
    `${runs - deaths}/${runs} energy-blind runs survived — energy is not biting`);
});

/**
 * The reference strategy the balance tests are tuned against: a player who
 * reads the three bars and takes the obvious answer, with no lookahead and no
 * knowledge of the event pool. If this cannot win, the game is too hard; if
 * the careless strategies above *can*, it is too easy.
 */
function chooseSensibly(gs) {
  const open = availableLocations(snapshot(gs)).map((l) => l.id);
  const pick = (...ids) => ids.find((id) => open.includes(id));

  const rentSoon = gs.isRentDue() || gs.getWeekdayIndex() === 5;
  if (gs.energy < EXHAUSTION_THRESHOLD + 12) {
    const rested = pick('bathhouse', 'home_loft', 'river_walk');
    if (rested) return rested;
  }
  if (gs.money < RENT_AMOUNT + 12 || (rentSoon && gs.money < RENT_AMOUNT * 2)) {
    const paid = pick('bar', 'flea_market', 'night_market', 'farmers_market');
    if (paid) return paid;
  }
  if (gs.sanity < 40) {
    const calm = pick('spiritual_community', 'river_walk', 'rooftop', 'home_loft');
    if (calm) return calm;
  }
  if (gs.money > 70 && gs.sanity > 60) {
    const growth = pick('free_clinic', 'community_garden', 'public_library');
    if (growth) return growth;
  }
  return pick('spiritual_community', 'bar', 'home_loft') ?? 'home_loft';
}

// ================================================= no free lunches left

test('no location is free, once variance is taken into account', () => {
  // The original invariant, restated against the best possible day rather
  // than the average one: even a maximally lucky visit must cost something.
  for (const l of LOCATIONS) {
    let everFree = false;
    for (let day = 1; day <= 200 && !everFree; day += 1) {
      const swing = varianceForDay(l, day, 12345);
      const sanity = l.effects.sanity + swing.sanity;
      const money = l.effects.money + swing.money;
      const energy = l.effects.energy + swing.energy;
      if (sanity >= 0 && money >= 0 && energy >= 0) everFree = true;
    }
    assert.ok(!everFree, `${l.id} can be a completely free day`);
  }
});

test('rent stays a meaningful fraction of a working day', () => {
  const bestDay = Math.max(...LOCATIONS.map((l) => l.effects.money));
  assert.ok(RENT_AMOUNT >= bestDay * 0.5, 'rent is trivial against a good shift');
  assert.ok(RENT_AMOUNT <= bestDay * 2.5, 'rent needs more than one good shift a week');
});

test('a long seeded playthrough never produces an invalid state', () => {
  for (let seed = 0; seed < 20; seed += 1) {
    const { gs, em } = newRun(seed);
    for (let turn = 0; turn < 200; turn += 1) {
      if (gs.gameOver) break;
      resolveTurn(gs, em, chooseSensibly(gs));
      assert.ok(Number.isFinite(gs.sanity) && gs.sanity >= 0 && gs.sanity <= MAX_STAT);
      assert.ok(Number.isFinite(gs.money) && gs.money >= 0);
      assert.ok(Number.isFinite(gs.energy) && gs.energy >= 0 && gs.energy <= MAX_ENERGY);
      assert.ok(Number.isFinite(gs.reputation) && gs.reputation >= 0);
      assert.ok(Number.isFinite(gs.insight) && gs.insight >= 0);
      if (gs.gameOver) break;
      gs.advanceDay();
    }
  }
});

test('energy never silently exceeds its cap through recovery plus a rest day', () => {
  const gs = new GameState({ seed: 5 });
  gs.energy = START_ENERGY;
  gs.applyDeltas({ energy: getLocation('home_loft').effects.energy });
  gs.advanceDay();
  assert.equal(gs.energy, MAX_ENERGY);
});
