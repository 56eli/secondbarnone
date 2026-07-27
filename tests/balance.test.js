/**
 * Balance tests.
 *
 * The test suite this project was missing. Everything else here proves the
 * *code* behaves; these prove the *game* does — that a run can actually be
 * lost, that skill is rewarded, and that no single location dominates.
 *
 * Before this pass the game was unloseable: 275 passing tests and ~99%
 * coverage sat happily on top of a core loop where a greedy player survived
 * 100/100 seeds and finished with 700+ money against a "comfort cap" of 100.
 * Nothing failed, because nothing was looking.
 *
 * These assertions are deliberately stated as generous *bands* rather than
 * exact figures. They are meant to catch a regression that breaks the game
 * (an unloseable economy, or a brutally unfair one) without failing every
 * time someone retunes a single location by a point.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { summarise, playRun } from '../scripts/simulate.js';
import { LOCATIONS } from '../docs/js/data/locations.js';
import { buildEventPool } from '../docs/js/data/events.js';
import { GameState, RENT_AMOUNT, RENT_MAX } from '../docs/js/core/game-state.js';
import { computeDayEffects } from '../docs/js/core/turn.js';
import { WEATHER_TYPES } from '../docs/js/data/weather.js';

/** Keep the suite quick: enough seeds to be stable, few enough to stay fast. */
const RUNS = 60;
const HORIZON = 200;

// --------------------------------------------------------- the core claim

test('the game can be lost: a greedy player dies in a meaningful share of runs', () => {
  const s = summarise('greedy', { runs: RUNS, maxDays: HORIZON });
  assert.ok(
    s.deathRate >= 0.10,
    `a competent player should be at real risk; death rate was ${(s.deathRate * 100).toFixed(0)}%`,
  );
  assert.ok(
    s.deathRate <= 0.70,
    `...but skill must still pay; death rate was ${(s.deathRate * 100).toFixed(0)}%`,
  );
});

test('careless play is punished much harder than careful play', () => {
  const random = summarise('random', { runs: RUNS, maxDays: HORIZON });
  const greedy = summarise('greedy', { runs: RUNS, maxDays: HORIZON });
  assert.ok(
    random.deathRate > greedy.deathRate,
    `random (${random.deathRate}) should die more than greedy (${greedy.deathRate})`,
  );
  assert.ok(
    random.deathRate - greedy.deathRate >= 0.25,
    'the gap between careless and careful play should be substantial',
  );
});

test('the classic two-location loop is viable but not immortal', () => {
  // Alternating bar/community is the game's advertised core fantasy, so it
  // must work — but it should not be a guaranteed win either.
  const s = summarise('alternate', { runs: RUNS, maxDays: HORIZON });
  assert.ok(s.deathRate <= 0.60, `the core loop should be playable; died ${s.deathRate}`);
  assert.ok(s.goalRate >= 0.25, `the core loop should often reach day 100; got ${s.goalRate}`);
});

test('the 100-day goal is an achievement, not a formality', () => {
  const random = summarise('random', { runs: RUNS, maxDays: HORIZON });
  assert.ok(
    random.goalRate <= 0.45,
    `careless play should rarely reach day 100; got ${(random.goalRate * 100).toFixed(0)}%`,
  );
});

test('money does not run away: a long greedy run stays near the comfort band', () => {
  // The old economy ended 200 days with ~700 money against a soft cap of 100,
  // which made the wallet meaningless. Some accumulation is fine; an order of
  // magnitude is not.
  const s = summarise('greedy', { runs: RUNS, maxDays: HORIZON });
  assert.ok(
    s.meanMoney < 300,
    `end-of-run money averaged ${s.meanMoney.toFixed(0)}; the economy is inflating`,
  );
});

test('both failure modes are reachable', () => {
  // If only one resource ever kills you, the other is decoration.
  const all = ['random', 'alternate', 'greedy']
    .map((n) => summarise(n, { runs: RUNS, maxDays: HORIZON }));
  const sanityDeaths = all.reduce((n, s) => n + s.deathsBySanity, 0);
  const moneyDeaths = all.reduce((n, s) => n + s.deathsByMoney, 0);
  assert.ok(moneyDeaths > 0, 'running out of money should be able to end a run');
  assert.ok(sanityDeaths > 0, 'running out of sanity should be able to end a run');
});

// -------------------------------------------------------- no dominant play

test('no single location is picked for more than half of all days', () => {
  // `home_loft` used to take 56% of a greedy run's days because rest was the
  // strongest play in the game. A dominant option collapses the decision.
  const s = summarise('greedy', { runs: RUNS, maxDays: HORIZON });
  const [topId, topShare] = Object.entries(s.pickRates)[0] ?? ['none', 0];
  assert.ok(
    topShare <= 0.50,
    `${topId} accounts for ${(topShare * 100).toFixed(0)}% of all days chosen`,
  );
});

test('the two founding locations are not the two worst options', () => {
  // The whole premise is the tension between them. If every added location
  // strictly dominates both, the advertised dilemma is dead content.
  const score = (l) => {
    const e = l.effects;
    return e.sanity + e.money + e.energy * 0.4 + e.reputation * 0.3 + e.insight * 0.6;
  };
  const ranked = [...LOCATIONS].sort((a, b) => score(b) - score(a));
  const rankOf = (id) => ranked.findIndex((l) => l.id === id);
  const worstTwo = ranked.length - 2;
  assert.ok(
    rankOf('spiritual_community') < worstTwo || rankOf('bar') < worstTwo,
    'the founding two should not both rank last on raw value',
  );
});

test('every location still costs something real', () => {
  for (const l of LOCATIONS) {
    const { sanity, money, energy } = l.effects;
    assert.ok(
      sanity < 0 || money < 0 || energy < 0,
      `${l.id} costs nothing`,
    );
    // Stronger than the original invariant: a "cost" of −1 against a +30
    // payoff is not a cost. The total ledger has to stay within reach of the
    // founding two rather than dwarfing them.
    const net = sanity + money + energy * 0.4 + l.effects.reputation * 0.3 + l.effects.insight * 0.6;
    assert.ok(net <= 14, `${l.id} nets ${net.toFixed(1)} — too strong for one day`);
  }
});

// ------------------------------------------------------------- the economy

test('rent escalates and is capped', () => {
  const gs = new GameState({ seed: 1 });
  const day1 = gs.baseRentForToday();
  assert.equal(day1, RENT_AMOUNT, 'rent starts at the base rate');

  gs.journeyDay = 100;
  const day100 = gs.baseRentForToday();
  assert.ok(day100 > day1, 'rent should rise over a long run');

  gs.journeyDay = 100000;
  assert.equal(gs.baseRentForToday(), RENT_MAX, 'rent is capped so a long run stays playable');
});

test('prepaying rent is never cheaper than paying weekly', () => {
  // Regression: prepaying ON a due Sunday used to waive that Sunday *and* the
  // next, so one payment bought two weeks (144 vs 180 money over 70 days).
  const weekly = new GameState({ seed: 1 });
  let paidWeekly = 0;
  for (let i = 0; i < 70; i++) { paidWeekly += weekly.applyRentIfSunday(); weekly.advanceDay(); }

  const prepaid = new GameState({ seed: 1 });
  let paidPrepaid = 0;
  for (let i = 0; i < 70; i++) {
    if (prepaid.isRentDue()) {
      const before = prepaid.money;
      prepaid.prepayRent(1);
      paidPrepaid += before - prepaid.money;
    }
    paidPrepaid += prepaid.applyRentIfSunday();
    prepaid.advanceDay();
  }

  assert.equal(
    paidPrepaid, paidWeekly,
    `prepaying cost ${paidPrepaid} vs ${paidWeekly} weekly — prepay must not be an exploit`,
  );
});

test('the event pool is not a free income stream', () => {
  const pool = buildEventPool();
  const weight = pool.reduce((n, e) => n + e.weight, 0);
  const evMoney = pool.reduce((n, e) => n + e.weight * (e.moneyDelta ?? 0), 0) / weight;
  const evSanity = pool.reduce((n, e) => n + e.weight * (e.sanityDelta ?? 0), 0) / weight;
  // Events may lean helpful — this is a gentle game — but they must not
  // outpace the cost of living on their own.
  assert.ok(evMoney < 3, `events average ${evMoney.toFixed(2)} money each; too generous`);
  assert.ok(evSanity < 4, `events average ${evSanity.toFixed(2)} sanity each; too generous`);
});

test('energy is a real constraint, not a decoration', () => {
  // Overnight recovery used to exactly cancel the core loop's energy cost, so
  // exhaustion never fired. Grinding the bar should drain the tank.
  const gs = new GameState({ seed: 5 });
  const start = gs.energy;
  for (let i = 0; i < 8; i++) {
    gs.applyDeltas({ energy: LOCATIONS.find((l) => l.id === 'bar').effects.energy });
    gs.advanceDay();
  }
  assert.ok(gs.energy < start, 'a sustained grind must run energy down over time');
});

// ------------------------------------------------------- weather contract

test('weather modifiers stack once per matching tag', () => {
  // Documented in turn.js and pinned here: adding a tag to a location changes
  // its weather profile, so this must be a deliberate choice, not a surprise.
  const heatwave = WEATHER_TYPES.find((w) => w.id === 'heatwave');
  const nightMarket = LOCATIONS.find((l) => l.id === 'night_market');
  const matching = nightMarket.tags.filter((t) => heatwave.tagEffects[t]);
  assert.ok(matching.length >= 2, 'night_market should match heatwave on several tags');

  const expected = matching.reduce((acc, tag) => {
    for (const [k, v] of Object.entries(heatwave.tagEffects[tag])) acc[k] = (acc[k] ?? 0) + v;
    return acc;
  }, {});

  const gs = new GameState({ seed: 1 });
  gs.getWeather = () => heatwave;
  gs.getFestival = () => null;
  const { base, total } = computeDayEffects(gs, 'night_market');
  for (const [k, v] of Object.entries(expected)) {
    assert.equal(
      total[k] - base[k], v,
      `${k} should shift by the summed modifier of every matching tag`,
    );
  }
});

// ------------------------------------------------------------ determinism

test('the simulator is deterministic for a given seed', () => {
  const a = playRun(4242, 'greedy', { maxDays: 60 });
  const b = playRun(4242, 'greedy', { maxDays: 60 });
  assert.deepEqual(a.visits, b.visits, 'same seed must produce the same run');
  assert.equal(a.days, b.days);
  assert.equal(a.money, b.money);
});
