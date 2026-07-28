/**
 * Progression tests — the systems that give a long run a shape.
 *
 * Covers the three things added to stop the run flattening after day 20:
 * escalating rent, the repeatable insight sink (observances), and per-
 * character affinity. Also pins the settings defaults a player meets on their
 * first load.
 *
 * These are behaviour tests, not balance tests: they assert that a system
 * *does something*, and leave "how much" to `balance.test.js` so retuning a
 * number does not break two files.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  GameState,
  RENT_AMOUNT,
  RENT_MAX_AMOUNT,
  RENT_ESCALATION_FIRST_DAY,
  RENT_ESCALATION_PERIOD_DAYS,
  RENT_ESCALATION_STEP,
  MASTERY_GOAL_DAYS,
  MASTERY_MONEY,
  MASTERY_REPUTATION,
  MASTERY_LOCATIONS,
  MASTERY_MAX_BAR_STREAK,
} from '../docs/js/core/game-state.js';
import { EventManager } from '../docs/js/core/event-manager.js';
import { resolveTurn, computeDayEffects } from '../docs/js/core/turn.js';
import { createRng } from '../docs/js/core/rng.js';
import {
  OBSERVANCES,
  getObservance,
  activeObservanceEffects,
} from '../docs/js/data/observances.js';
import { PERKS } from '../docs/js/data/perks.js';
import { locationIds } from '../docs/js/data/locations.js';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const DOCS = join(ROOT, 'docs');

function newRun(seed = 1) {
  const gs = new GameState({ seed });
  const em = new EventManager(createRng(seed));
  em.initialize(gs.getCharacterNames());
  return { gs, em };
}

// ================================================================ the rent

test('rent starts where it always did', () => {
  // The opening of a run must play exactly as it used to.
  const gs = new GameState({ seed: 1 });
  assert.equal(gs.baseRentOn(1), RENT_AMOUNT);
  assert.equal(gs.baseRentOn(RENT_ESCALATION_FIRST_DAY - 1), RENT_AMOUNT);
});

test('rent steps up on schedule and then stops', () => {
  const gs = new GameState({ seed: 1 });
  assert.equal(gs.baseRentOn(RENT_ESCALATION_FIRST_DAY), RENT_AMOUNT + RENT_ESCALATION_STEP);
  assert.equal(
    gs.baseRentOn(RENT_ESCALATION_FIRST_DAY + RENT_ESCALATION_PERIOD_DAYS),
    RENT_AMOUNT + 2 * RENT_ESCALATION_STEP,
  );
  assert.equal(gs.baseRentOn(100000), RENT_MAX_AMOUNT, 'escalation must have a ceiling');
});

test('the rent schedule matches the documented promise, in literals', () => {
  // The pair above asserts against the constants, so a mutant *in the
  // constants* passes both — the mutation harness shipped exactly that
  // unnoticed (scripts/mutation-test.js, roadmap 3.4). The contract from
  // PROJECT_OVERVIEW: 18, +4 every 14 days from day 15, ceiling 42. Written
  // in numbers, once, so a changed constant is a red test.
  const gs = new GameState({ seed: 1 });
  const expected = new Map([
    [1, 18],
    [14, 18],
    [15, 22],
    [28, 22],
    [29, 26],
    [42, 26],
    [43, 30],
    [56, 30],
    [57, 34],
    [99, 42], // 18 + 4·7 = 46 at the raw schedule — the ceiling binds
    [200, 42],
  ]);
  for (const [day, rent] of expected) {
    assert.equal(gs.baseRentOn(day), rent, `rent on day ${day}`);
  }
});

test('the player can always see the next rise coming', () => {
  // A pressure the player cannot anticipate is an ambush, not a difficulty
  // curve. The almanac reads this.
  const gs = new GameState({ seed: 1 });
  const next = gs.nextRentRiseDay(1);
  assert.equal(next, RENT_ESCALATION_FIRST_DAY);
  assert.ok(gs.baseRentOn(next) > gs.baseRentOn(1), 'the announced day must actually be a rise');
  assert.equal(gs.nextRentRiseDay(100000), null, 'once capped there is nothing to announce');
});

test('relief still works against a risen rent', () => {
  // The counterplay must keep functioning, or escalation just deletes the
  // perk that was sold as an answer to it.
  const plain = new GameState({ seed: 1 });
  plain.journeyDay = 60;
  const relieved = new GameState({ seed: 1 });
  relieved.journeyDay = 60;
  relieved.perks.add('tenants_union');
  relieved.reputation = 85;

  assert.ok(relieved.rentDue() < plain.rentDue(), 'perks and reputation must still reduce rent');
  assert.ok(relieved.rentDue() > 0, 'but never to nothing');
});

test('a late-game rent is heavier than an early one even fully relieved', () => {
  const early = new GameState({ seed: 1 });
  early.journeyDay = 1;
  const late = new GameState({ seed: 1 });
  late.journeyDay = 90;
  late.perks.add('tenants_union');
  late.reputation = 85;
  // Not necessarily higher than the *unrelieved* early rent — that is the
  // point of the counterplay — but the pressure must not have vanished.
  assert.ok(late.rentDue() > 0);
  assert.ok(late.baseRentOn() > early.baseRentOn());
});

// ============================================================ observances

test('every observance is well-formed', () => {
  const seen = new Set();
  for (const o of OBSERVANCES) {
    assert.ok(o.id && !seen.has(o.id), `duplicate or missing observance id: ${o.id}`);
    seen.add(o.id);
    assert.ok(o.name && o.emoji && o.desc, `${o.id} is missing display copy`);
    assert.ok(o.cost > 0, `${o.id} must cost something`);
    assert.ok(o.duration >= 1, `${o.id} must last at least a day`);
    assert.ok(Object.keys(o.effects).length > 0, `${o.id} must actually do something`);
  }
});

test('the insight economy has a sink that never runs out', () => {
  // Perks are finite by design; observances are the reason insight keeps
  // meaning something after the tree is bought out.
  const treeCost = PERKS.reduce((sum, p) => sum + p.cost, 0);
  const cheapest = Math.min(...OBSERVANCES.map((o) => o.cost));
  assert.ok(cheapest < treeCost, 'an observance should be affordable long before the whole tree');

  const gs = new GameState({ seed: 1 });
  gs.insight = 500;
  // Buy everything permanent.
  for (let pass = 0; pass < PERKS.length; pass += 1) {
    for (const p of PERKS) if (!gs.hasPerk(p.id)) gs.buyPerk(p.id);
  }
  assert.equal(gs.perks.size, PERKS.length, 'the tree should be fully bought');
  assert.ok(gs.canObserve(OBSERVANCES[0].id).ok, 'there must still be something to spend on');
});

test('an observance changes the day it is kept for', () => {
  const gs = new GameState({ seed: 4 });
  gs.insight = 100;
  const before = computeDayEffects(gs, 'bar').total;
  gs.beginObservance('steady_hands');
  const after = computeDayEffects(gs, 'bar').total;
  // Variance dampening pulls the day toward its printed numbers, so at least
  // one resource must move unless the swing was already zero.
  const moved = ['sanity', 'money', 'energy'].some((k) => before[k] !== after[k]);
  assert.ok(moved, 'steadying the day should change what the day offers');
});

test('rent relief from an observance shows up in what rent costs', () => {
  const gs = new GameState({ seed: 1 });
  gs.journeyDay = 30;
  gs.insight = 100;
  const before = gs.rentDue();
  gs.beginObservance('settled_ledger');
  assert.ok(gs.rentDue() < before, 'a settled ledger should reduce the next rent');
});

test('an observance rebate is paid when it ends, not when it starts', () => {
  const gs = new GameState({ seed: 1 });
  gs.insight = 100;
  const o = getObservance('teaching_note');
  gs.beginObservance(o.id);
  const afterStart = gs.insight;
  assert.equal(afterStart, 100 - o.cost, 'the cost is charged up front');

  for (let i = 0; i <= o.duration + 1; i += 1) gs.advanceDay();
  assert.equal(
    gs.insight,
    afterStart + o.effects.insightRebate,
    'the rebate lands when the observance is set down',
  );
});

test('starting a second observance replaces the first without a refund', () => {
  // Documented as a design rule: one at a time, and choosing is the gameplay.
  const gs = new GameState({ seed: 1 });
  gs.insight = 100;
  gs.beginObservance('steady_hands');
  const afterFirst = gs.insight;
  gs.beginObservance('long_sit');
  assert.equal(gs.pendingObservance.id, 'long_sit');
  assert.equal(gs.insight, afterFirst - getObservance('long_sit').cost, 'no refund on replacement');
});

test('activeObservanceEffects is safe on every degenerate input', () => {
  const zero = activeObservanceEffects(null, 1);
  assert.ok(Object.values(zero).every((v) => v === 0));
  assert.deepEqual(activeObservanceEffects({ id: 'nope', untilDay: 99 }, 1), zero);
  assert.deepEqual(activeObservanceEffects({ id: 'steady_hands', untilDay: 1 }, 50), zero);
});

// =============================================================== affinity

test('affinity is earned only by actually meeting someone', () => {
  const { gs, em } = newRun(7);
  assert.deepEqual(gs.affinity, {}, 'a fresh run knows nobody');

  let met = 0;
  for (let i = 0; i < 40 && !gs.gameOver; i += 1) {
    gs.sanity = 80;
    gs.money = 200;
    gs.energy = 90;
    const result = resolveTurn(gs, em, 'bar');
    if (result.event) {
      met += 1;
      assert.ok(
        gs.affinityFor(result.event.character) > 0,
        `meeting ${result.event.character} should register`,
      );
    }
    gs.gameOver = false;
  }
  assert.ok(met > 0, 'the setup should have produced some events');
  const total = Object.values(gs.affinity).reduce((a, b) => a + b, 0);
  assert.equal(total, met, 'affinity should count meetings exactly, no more and no less');
});

test('metCharacters lists the people this run actually knows, most-seen first', () => {
  const gs = new GameState({ seed: 1 });
  gs.noteAffinity('geo');
  gs.noteAffinity('geo');
  gs.noteAffinity('geo');
  gs.noteAffinity('renata');
  const met = gs.metCharacters();
  assert.deepEqual(
    met.map((m) => m.id),
    ['geo', 'renata'],
  );
  assert.equal(met[0].count, 3);
});

test('noteAffinity ignores a missing character id', () => {
  const gs = new GameState({ seed: 1 });
  assert.equal(gs.noteAffinity(''), 0);
  assert.equal(gs.noteAffinity(undefined), 0);
  assert.deepEqual(gs.affinity, {});
});

// ================================================================ mastery

test('the mastery layer is reachable by a player who aims at it', () => {
  // It previously required 200 money alongside conditions that structurally
  // prevent earning it — 0 wins in 25 seeds. This asserts it can be done.
  const gs = new GameState({ seed: 1 });
  gs.journeyDay = MASTERY_GOAL_DAYS;
  gs.reputation = MASTERY_REPUTATION;
  gs.money = MASTERY_MONEY;
  gs.visitedLocations = new Set(locationIds().slice(0, MASTERY_LOCATIONS));
  gs.maxConsecutiveBarDays = MASTERY_MAX_BAR_STREAK;
  assert.equal(gs.checkSecondWin(), true, 'exactly meeting every bar should win');
});

test('each mastery condition is individually necessary', () => {
  const base = () => {
    const gs = new GameState({ seed: 1 });
    gs.journeyDay = MASTERY_GOAL_DAYS;
    gs.reputation = MASTERY_REPUTATION;
    gs.money = MASTERY_MONEY;
    gs.visitedLocations = new Set(locationIds().slice(0, MASTERY_LOCATIONS));
    gs.maxConsecutiveBarDays = MASTERY_MAX_BAR_STREAK;
    return gs;
  };
  const breaks = {
    'too few days': (gs) => (gs.journeyDay = MASTERY_GOAL_DAYS - 1),
    'too little reputation': (gs) => (gs.reputation = MASTERY_REPUTATION - 1),
    'too little money': (gs) => (gs.money = MASTERY_MONEY - 1),
    'too few places': (gs) => gs.visitedLocations.delete([...gs.visitedLocations][0]),
    'bar streak too long': (gs) => (gs.maxConsecutiveBarDays = MASTERY_MAX_BAR_STREAK + 1),
  };
  for (const [why, breakIt] of Object.entries(breaks)) {
    const gs = base();
    breakIt(gs);
    assert.equal(gs.checkSecondWin(), false, `mastery should be denied when ${why}`);
  }
});

test('mastery progress is reportable so a player can find it', () => {
  // It was live code with no achievement, no almanac entry and no mention in
  // any document — unreachable *and* undiscoverable.
  const gs = new GameState({ seed: 1 });
  const rows = gs.masteryProgress();
  assert.equal(rows.length, 5, 'every condition should be reported');
  for (const row of rows) {
    assert.ok(row.label, 'each row needs a label a player can read');
    assert.ok(Number.isFinite(row.now) && Number.isFinite(row.need));
  }
  assert.ok(
    rows.some((r) => r.atMost),
    'the bar-streak row is an upper bound, not a target',
  );
});

// =============================================================== settings

test('background music starts at half volume, not silent', () => {
  // The loop is shipped, documented and inside the asset budget; defaulting
  // the slider to 0 meant nobody who did not open Settings ever heard it.
  const source = readFileSync(join(DOCS, 'js', 'app.js'), 'utf8');
  const match = source.match(/DEFAULT_MUSIC_VOLUME\s*=\s*([\d.]+)/);
  assert.ok(match, 'a named default should exist rather than a literal');
  const value = Number(match[1]);
  assert.equal(value, 0.5, 'the default should be half volume');
  assert.ok(value > 0 && value <= 1, 'and a legal volume');
});

test('a stored volume of zero is respected rather than overridden', () => {
  // The default applies to an *absent* setting. A player who deliberately
  // muted the game must stay muted.
  const source = readFileSync(join(DOCS, 'js', 'app.js'), 'utf8');
  assert.match(
    source,
    /raw === null \|\| raw === undefined \|\| raw === ''/,
    'only a missing value should fall back to the default',
  );
});
