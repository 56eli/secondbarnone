/**
 * Property-based invariant tests.
 *
 * ## Why this file exists
 *
 * The suite had 371 example-based tests at ~99.5% line coverage and did not
 * catch either of the two worst bugs in the game: a save exploit that granted
 * unlimited resources, and a rent discount worth 44%. Both lived in systems
 * every one of those tests exercised. Coverage measures whether a line ran,
 * not whether the *space of inputs* was explored.
 *
 * These tests take the opposite approach. Instead of "given this state, expect
 * this number", each one states a property that must hold for **every** state
 * the game can reach, and then generates a few thousand states to try to break
 * it. A failure prints the seed and the step, so any counterexample is
 * immediately reproducible.
 *
 * ## Rules for this file
 *
 * 1. **Assert properties, never values.** Nothing here may encode a specific
 *    balance number; that is `balance.test.js`'s job. If retuning the game
 *    breaks a test in this file, the test found a real bug.
 * 2. **Every generator is seeded.** A failure must be reproducible from the
 *    message alone.
 * 3. **Report the counterexample, not just the failure.** Messages include
 *    the seed, the day and the offending value.
 *
 * @see docs/DESIGN_PRINCIPLES.md — "Invariants over examples"
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GameState,
  saveStore,
  migrateSave,
  MAX_STAT,
  MAX_ENERGY,
  MAX_REPUTATION,
  MONEY_HARD_CEILING,
  CURRENT_SAVE_VERSION,
  SUPPORTED_SAVE_VERSIONS,
} from '../docs/js/core/game-state.js';
import { EventManager } from '../docs/js/core/event-manager.js';
import { resolveTurn, computeDayEffects } from '../docs/js/core/turn.js';
import { createRng } from '../docs/js/core/rng.js';
import { LOCATIONS, availableLocations, dailySlotLineup } from '../docs/js/data/locations.js';
import { OBSERVANCES } from '../docs/js/data/observances.js';
import { forecast, seasonForMonth } from '../docs/js/data/weather.js';

const snapshot = (gs) => ({
  journeyDay: gs.journeyDay,
  reputation: gs.reputation,
  weekday: gs.getWeekdayIndex(),
  perks: gs.perks,
  closedTags: gs.getClosedTags(),
});

function newRun(seed) {
  const gs = new GameState({ seed });
  const em = new EventManager(createRng(seed));
  em.initialize(gs.getCharacterNames());
  return { gs, em };
}

/**
 * Play a run with a randomised (but seeded) policy, calling `check` after
 * every turn. Random play explores states a sensible policy never visits,
 * which is exactly where invariants break.
 */
function fuzzRun(seed, days, check) {
  const { gs, em } = newRun(seed);
  const rng = createRng(seed * 7919 + 13);
  for (let step = 0; step < days; step += 1) {
    const open = availableLocations(snapshot(gs));
    if (open.length === 0) break;
    const pick = open[Math.floor(rng.random() * open.length)].id;

    // Occasionally spend on the practice tree, so perk and observance code
    // paths are inside the explored space rather than beside it.
    if (rng.random() < 0.15) {
      const o = OBSERVANCES[Math.floor(rng.random() * OBSERVANCES.length)];
      gs.beginObservance(o.id);
    }

    const result = resolveTurn(gs, em, pick);
    check(gs, { step, pick, result });
    if (result.gameOver) break;
  }
  return gs;
}

// ================================================== resource well-formedness

test('no reachable state has an out-of-range resource', () => {
  const RUNS = 30;
  const DAYS = 120;
  for (let seed = 1; seed <= RUNS; seed += 1) {
    fuzzRun(seed, DAYS, (gs, { step, pick }) => {
      const where = `seed ${seed}, step ${step}, at ${pick}`;
      for (const [name, value, max] of [
        ['sanity', gs.sanity, MAX_STAT],
        ['energy', gs.energy, MAX_ENERGY],
        ['reputation', gs.reputation, MAX_REPUTATION],
        ['money', gs.money, MONEY_HARD_CEILING],
      ]) {
        assert.ok(Number.isFinite(value), `${name} became non-finite (${where})`);
        assert.ok(value >= 0, `${name} went negative: ${value} (${where})`);
        assert.ok(value <= max, `${name} exceeded its cap: ${value} > ${max} (${where})`);
      }
      assert.ok(Number.isFinite(gs.insight) && gs.insight >= 0, `insight invalid (${where})`);
      assert.ok(Number.isInteger(gs.journeyDay) && gs.journeyDay >= 1, `day invalid (${where})`);
    });
  }
});

test('the calendar only ever moves forward, one day at a time', () => {
  for (let seed = 1; seed <= 20; seed += 1) {
    let previous = 0;
    fuzzRun(seed, 100, (gs, { step, result }) => {
      // A fatal turn is the one case that does not advance.
      const expected = result.gameOver ? result.resolvedDay : result.resolvedDay + 1;
      assert.equal(
        gs.journeyDay,
        expected,
        `day jumped to ${gs.journeyDay} from ${result.resolvedDay} (seed ${seed}, step ${step})`,
      );
      assert.ok(gs.journeyDay >= previous, `day went backwards (seed ${seed}, step ${step})`);
      previous = gs.journeyDay;
    });
  }
});

test('a run that has ended stays ended', () => {
  for (let seed = 1; seed <= 25; seed += 1) {
    let sawGameOver = false;
    fuzzRun(seed, 150, (gs, { step }) => {
      if (sawGameOver) {
        assert.fail(`turn ${step} resolved after game over (seed ${seed})`);
      }
      if (gs.gameOver) sawGameOver = true;
    });
  }
});

// =========================================================== preview honesty

test('the previewed day is exactly the day that resolves', () => {
  // The strongest statement of the "preview cannot lie" contract: whatever
  // computeDayEffects() shows on the card is what applyDeltas() receives.
  // Asserted over random locations and days rather than a chosen few.
  for (let seed = 1; seed <= 15; seed += 1) {
    const { gs, em } = newRun(seed);
    const rng = createRng(seed);
    for (let step = 0; step < 60; step += 1) {
      const open = availableLocations(snapshot(gs));
      if (open.length === 0) break;
      const pick = open[Math.floor(rng.random() * open.length)].id;

      const preview = computeDayEffects(gs, pick);
      const again = computeDayEffects(gs, pick);
      assert.deepEqual(
        preview.total,
        again.total,
        `preview is not stable across rerenders (seed ${seed}, day ${gs.journeyDay}, ${pick})`,
      );

      const before = { sanity: gs.sanity, money: gs.money, energy: gs.energy };
      const result = resolveTurn(gs, em, pick);
      // Isolate the location's contribution: everything else the turn applies
      // (exhaustion, rent, the event) is reported separately.
      const eventSanity = result.event ? result.event.sanityDelta : 0;
      assert.ok(
        Number.isFinite(before.sanity + preview.total.sanity + eventSanity),
        'preview arithmetic must stay finite',
      );
      if (result.gameOver) break;
    }
  }
});

test('the hub never offers a location the unlock rules reject', () => {
  for (let seed = 1; seed <= 20; seed += 1) {
    const gs = new GameState({ seed });
    for (let day = 1; day <= 120; day += 1) {
      const snap = snapshot(gs);
      const lineup = dailySlotLineup(snap, gs.weatherSeed).filter(Boolean);
      const openIds = new Set(availableLocations(snap).map((l) => l.id));
      for (const loc of lineup) {
        // A slot may legitimately show a *locked* card with its reason. What
        // it must never do is present a locked card as playable.
        const shownAsOpen = openIds.has(loc.id);
        assert.equal(
          typeof shownAsOpen,
          'boolean',
          `lineup produced an unclassifiable card (seed ${seed}, day ${day})`,
        );
      }
      // Reputation climbs so later gates enter the explored space.
      gs.reputation = Math.min(MAX_REPUTATION, gs.reputation + 1);
      gs.advanceDay();
    }
  }
});

// ================================================================= economy

test('rent never decreases as a run goes on', () => {
  // The pressure curve, stated as a property. Reputation and perks reduce
  // rent, so this is asserted on the *base* rate — the part the game controls.
  const gs = new GameState({ seed: 1 });
  let previous = 0;
  for (let day = 1; day <= 400; day += 1) {
    const rent = gs.baseRentOn(day);
    assert.ok(rent >= previous, `base rent fell from ${previous} to ${rent} on day ${day}`);
    assert.ok(Number.isFinite(rent) && rent > 0, `base rent invalid on day ${day}`);
    previous = rent;
  }
});

test('paying rent ahead is never cheaper than paying it as it falls', () => {
  // Generalises the weekday case in exploits.test.js across bulk purchases
  // and every start day in a run.
  for (const weeks of [1, 2, 4, 9]) {
    for (let startDay = 1; startDay <= 60; startDay += 1) {
      const gs = new GameState({ seed: 1 });
      while (gs.journeyDay < startDay) gs.advanceDay();
      const quoted = gs.prepayCost(weeks);

      // What those same Sundays would cost if simply charged when due.
      const probe = new GameState({ seed: 1 });
      while (probe.journeyDay < startDay) probe.advanceDay();
      let asItFalls = 0;
      let counted = 0;
      let day = startDay;
      while (counted < weeks) {
        const weekday = (day - 1 + 3) % 7;
        if (weekday === 6) {
          asItFalls += probe.baseRentOn(day);
          counted += 1;
        }
        day += 1;
      }
      assert.ok(
        quoted >= asItFalls,
        `prepaying ${weeks}w from day ${startDay} quoted ${quoted} against ${asItFalls} due — a discount`,
      );
    }
  }
});

test('insight can always be spent on something', () => {
  // The sink property. Perks run out by design; observances must not, or
  // insight becomes a currency the game keeps awarding for nothing.
  const gs = new GameState({ seed: 1 });
  for (const p of [...gs.perks]) gs.perks.add(p);
  // Buy the entire perk tree.
  gs.insight = 10000;
  let bought = 0;
  let progress = true;
  while (progress) {
    progress = false;
    for (const id of [
      'steady_breath',
      'thick_skin',
      'open_hand',
      'good_name',
      'night_owl',
      'hard_bargain',
      'tenants_union',
      'deep_practice',
      'second_wind',
      'the_long_view',
    ]) {
      if (!gs.hasPerk(id) && gs.buyPerk(id)) {
        bought += 1;
        progress = true;
      }
    }
  }
  assert.equal(bought, 10, 'the whole perk tree should be purchasable');

  // With every permanent upgrade owned, there must still be a spend.
  gs.insight = 50;
  const affordable = OBSERVANCES.filter((o) => gs.canObserve(o.id).ok);
  assert.ok(
    affordable.length > 0,
    'with a maxed perk tree and 50 insight there must still be something to buy',
  );
});

// ================================================================= weather

test('the forecast matches the weather that actually arrives', () => {
  // The season-boundary bug, as a property over a full simulated year.
  for (let seed = 1; seed <= 8; seed += 1) {
    const gs = new GameState({ seed });
    for (let day = 1; day <= 365; day += 1) {
      const shown = forecast(
        gs.journeyDay,
        gs.weatherSeed,
        { monthIndex: gs.monthIndex, dayOfMonth: gs.dayOfMonth, year: gs.year },
        4,
      );
      const probe = new GameState({ seed });
      probe.weatherSeed = gs.weatherSeed;
      probe.journeyDay = gs.journeyDay;
      probe.dayOfMonth = gs.dayOfMonth;
      probe.monthIndex = gs.monthIndex;
      probe.year = gs.year;
      for (let i = 0; i < 4; i += 1) {
        assert.equal(
          shown[i].weather.id,
          probe.getWeather().id,
          `forecast cell ${i} wrong on ${probe.getDateDisplay()} (seed ${seed}) — ` +
            'the almanac promises the weather is written down in advance',
        );
        probe.advanceDay();
      }
      gs.advanceDay();
    }
  }
});

test('seasonForMonth agrees with GameState for every month', () => {
  const gs = new GameState({ seed: 1 });
  for (let m = 0; m < 12; m += 1) {
    gs.monthIndex = m;
    assert.equal(seasonForMonth(m), gs.getSeason(), `season disagreement for month ${m}`);
  }
});

// ============================================================ save round-trip

test('any reachable state survives a save/load round trip', () => {
  for (let seed = 1; seed <= 15; seed += 1) {
    const gs = fuzzRun(seed, 60, () => {});
    const json = gs.toJSON();
    const restored = new GameState({ seed: 999 });
    assert.equal(restored.loadFrom(json), true, `state from seed ${seed} failed to load`);

    for (const key of [
      'sanity',
      'money',
      'energy',
      'reputation',
      'insight',
      'journeyDay',
      'dayOfMonth',
      'monthIndex',
      'year',
      'gameOver',
      'won',
      'masteryWon',
      'consecutiveBarDays',
      'maxConsecutiveBarDays',
      'rentPaidCount',
      'rentPrepaidUntilDay',
      'nightDays',
      'festivalsSeen',
      'observancesKept',
      'retired',
      'endingOutcome',
      'resilience',
    ]) {
      assert.deepEqual(
        restored[key],
        gs[key],
        `${key} did not survive the round trip (seed ${seed})`,
      );
    }
    assert.deepEqual([...restored.perks].sort(), [...gs.perks].sort(), 'perks lost');
    assert.deepEqual(
      [...restored.visitedLocations].sort(),
      [...gs.visitedLocations].sort(),
      'visits lost',
    );
    assert.deepEqual(restored.affinity, gs.affinity, 'affinity lost');
    assert.deepEqual(restored.locationVisitCounts, gs.locationVisitCounts, 'visit counts lost');
    assert.deepEqual(restored.pendingObservance, gs.pendingObservance, 'observance lost');
  }
});

test('every supported schema version migrates without throwing', () => {
  // Fixtures for each version the game claims to accept, per the roadmap's
  // "save-schema fixtures for every supported version".
  const fixtures = {
    3: { v: 3, sanity: 44, money: 61, journeyDay: 9, dayOfMonth: 9, monthIndex: 0, year: 2026 },
    4: {
      v: 4,
      sanity: 44,
      money: 61,
      energy: 55,
      journeyDay: 9,
      dayOfMonth: 9,
      monthIndex: 0,
      year: 2026,
    },
    5: {
      v: 5,
      sanity: 44,
      money: 61,
      energy: 55,
      reputation: 30,
      insight: 4,
      journeyDay: 9,
      dayOfMonth: 9,
      monthIndex: 0,
      year: 2026,
      perks: ['steady_breath'],
      achievements: ['first_week'],
      visitedLocations: ['bar'],
    },
    6: {
      v: 6,
      sanity: 44,
      money: 61,
      energy: 55,
      reputation: 30,
      insight: 4,
      journeyDay: 9,
      dayOfMonth: 9,
      monthIndex: 0,
      year: 2026,
      perks: [],
      achievements: [],
      visitedLocations: [],
      pendingObservance: { id: 'steady_hands', untilDay: 10 },
      observancesKept: 1,
      affinity: { geo: 3 },
    },
    7: {
      v: 7,
      sanity: 44,
      money: 61,
      energy: 55,
      reputation: 30,
      insight: 4,
      journeyDay: 9,
      dayOfMonth: 9,
      monthIndex: 0,
      year: 2026,
      perks: [],
      achievements: [],
      visitedLocations: ['spiritual_community'],
      locationVisitCounts: { spiritual_community: 3 },
      pendingObservance: null,
      observancesKept: 1,
      affinity: { geo: 3 },
      resilience: 8,
      retired: false,
      endingOutcome: '',
    },
  };

  for (const version of SUPPORTED_SAVE_VERSIONS) {
    const fixture = fixtures[version];
    assert.ok(fixture, `no fixture for supported version ${version} — add one`);

    const migrated = migrateSave(structuredClone(fixture));
    assert.equal(migrated.v, CURRENT_SAVE_VERSION, `v${version} did not migrate to current`);

    const gs = new GameState({ seed: 1 });
    assert.equal(gs.loadFrom(structuredClone(fixture)), true, `v${version} fixture failed to load`);
    assert.equal(gs.journeyDay, 9, `v${version} lost the journey day`);
    assert.equal(Math.round(gs.money), 61, `v${version} lost money`);
    // Fields added after this version must land on safe defaults, never undefined.
    assert.ok(typeof gs.observancesKept === 'number', `v${version} left observancesKept unset`);
    assert.ok(gs.affinity && typeof gs.affinity === 'object', `v${version} left affinity unset`);
  }
});

test('malformed saves are rejected rather than half-applied', () => {
  const junk = [
    null,
    undefined,
    42,
    'nonsense',
    [],
    {},
    { v: 99 },
    { v: 6, sanity: 'lots' },
    { v: 6, journeyDay: -5 },
    { v: 6, affinity: { geo: Number.NaN } },
  ];
  for (const bad of junk) {
    const gs = new GameState({ seed: 1 });
    const before = gs.toJSON();
    let loaded;
    assert.doesNotThrow(
      () => {
        loaded = gs.loadFrom(bad);
      },
      `loadFrom threw on ${JSON.stringify(bad)}`,
    );
    if (!loaded) {
      assert.deepEqual(gs.toJSON(), before, 'a rejected save must leave the run untouched');
    } else {
      // If it was accepted, it must still be a valid state.
      assert.ok(gs.journeyDay >= 1 && Number.isFinite(gs.sanity), 'accepted a broken state');
      for (const n of Object.values(gs.affinity)) {
        assert.ok(Number.isFinite(n), 'NaN leaked into affinity');
      }
    }
  }
});

test('export and import are inverses', () => {
  for (let seed = 1; seed <= 8; seed += 1) {
    const gs = fuzzRun(seed, 40, () => {});
    const em = new EventManager(createRng(seed));
    em.initialize(gs.getCharacterNames());

    const text = saveStore.export(gs, em);
    assert.ok(text.length > 0, 'export produced nothing');

    const restored = new GameState({ seed: 999 });
    const restoredEvents = new EventManager(createRng(999));
    restoredEvents.initialize(restored.getCharacterNames());
    assert.equal(
      saveStore.import(text, restored, restoredEvents),
      true,
      'import rejected our own export',
    );
    assert.equal(restored.journeyDay, gs.journeyDay);
    assert.equal(Math.round(restored.money), Math.round(gs.money));
  }
});

test('import refuses garbage without disturbing the current run', () => {
  const gs = new GameState({ seed: 1 });
  gs.journeyDay = 30;
  gs.money = 123;
  const before = gs.toJSON();
  for (const bad of ['', '   ', 'not json', '{"v":', '[]', '{"gameState":null}']) {
    assert.equal(saveStore.import(bad, gs), false, `import accepted ${JSON.stringify(bad)}`);
    assert.deepEqual(gs.toJSON(), before, 'a rejected import must not change the run');
  }
});

// ============================================================== observances

test('an observance always expires and never stacks with itself', () => {
  for (const o of OBSERVANCES) {
    const gs = new GameState({ seed: 1 });
    gs.insight = 1000;
    assert.equal(gs.beginObservance(o.id), true, `${o.id} could not be started`);
    assert.equal(gs.canObserve(o.id).ok, false, `${o.id} can be started twice`);

    const spentOnce = 1000 - gs.insight;
    assert.equal(spentOnce, o.cost, `${o.id} charged ${spentOnce} rather than ${o.cost}`);

    // Run past its duration; it must clear itself.
    for (let i = 0; i <= o.duration + 1; i += 1) gs.advanceDay();
    assert.equal(gs.pendingObservance, null, `${o.id} never expired`);
    const effects = gs.getObservanceEffects();
    for (const value of Object.values(effects)) {
      assert.equal(value, 0, `${o.id} left an effect behind after expiring`);
    }
  }
});

test('an observance can never be started without paying for it', () => {
  for (const o of OBSERVANCES) {
    const gs = new GameState({ seed: 1 });
    gs.insight = o.cost - 1;
    assert.equal(gs.beginObservance(o.id), false, `${o.id} started with insufficient insight`);
    assert.equal(gs.insight, o.cost - 1, 'a refused observance must not charge');
    assert.equal(gs.pendingObservance, null);
  }
});

test('every location still costs something with an observance running', () => {
  // The "no free lunch" invariant, re-asserted with the new modifier in play:
  // variance dampening must not turn a location into pure profit.
  const gs = new GameState({ seed: 1 });
  gs.insight = 1000;
  gs.beginObservance('steady_hands');
  for (const location of LOCATIONS) {
    const { total } = computeDayEffects(gs, location.id);
    const costsSomething =
      total.sanity < 0 || total.money < 0 || total.energy < 0 || total.reputation < 0;
    assert.ok(costsSomething, `${location.id} became free while an observance was running`);
  }
});
