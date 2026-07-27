#!/usr/bin/env node
/**
 * Balance simulator.
 *
 * Drives the *real* `resolveTurn` over many seeded runs and reports how often
 * each play style survives. This is the harness the project was missing: 275
 * unit tests proved the code was correct while the game itself was unloseable,
 * because nothing ever asked "can a competent player actually die?".
 *
 *   node scripts/simulate.js              # summary for every strategy
 *   node scripts/simulate.js --runs=200   # more seeds
 *   node scripts/simulate.js --days=300   # longer horizon
 *   node scripts/simulate.js --verbose    # per-location pick rates
 *
 * Exported for use by tests/balance.test.js, which asserts the survival bands
 * below stay inside their intended range.
 */

import { GameState } from '../docs/js/core/game-state.js';
import { EventManager } from '../docs/js/core/event-manager.js';
import { resolveTurn, computeDayEffects } from '../docs/js/core/turn.js';
import { LOCATIONS, evaluateUnlock } from '../docs/js/data/locations.js';
import { createRng } from '../docs/js/core/rng.js';
import { PERKS } from '../docs/js/data/perks.js';

/** The unlock snapshot, exactly as the UI builds it. */
const snapshotOf = (gs) => ({
  journeyDay: gs.journeyDay,
  reputation: gs.reputation,
  weekday: gs.getWeekdayIndex(),
  perks: gs.perks,
  closedTags: gs.getClosedTags(),
});

/**
 * Strategies, weakest to strongest.
 *
 * `greedy` is the important one: it is a stand-in for a player who reads the
 * preview chips and picks the best-looking day. If *that* player cannot die,
 * the game has no failure state worth the name.
 */
export const STRATEGIES = {
  /** Picks uniformly at random. A floor: models a distracted player. */
  random: (gs, pool, rng) => pool[Math.floor(rng.random() * pool.length)],

  /** The classic two-location loop: chase whichever resource is lower. */
  alternate: (gs, pool) => {
    const wantMoney = gs.money <= gs.sanity;
    const bar = pool.find((l) => l.id === 'bar');
    const com = pool.find((l) => l.id === 'spiritual_community');
    return (wantMoney ? bar : com) ?? pool[0];
  },

  /** Reads the preview and maximises a weighted score. Models a good player. */
  greedy: (gs, pool) => {
    let best = pool[0];
    let bestScore = -Infinity;
    for (const l of pool) {
      const { total } = computeDayEffects(gs, l.id);
      const sanityWeight = gs.sanity < 40 ? 4 : 1;
      const moneyWeight = gs.money < 40 ? 4 : 1;
      const score = total.sanity * sanityWeight
        + total.money * moneyWeight
        + total.energy * 0.4
        + total.reputation * 0.3
        + total.insight * 0.6;
      if (score > bestScore) { bestScore = score; best = l; }
    }
    return best;
  },
};

/**
 * Play one run to completion or to `maxDays`.
 * @returns {{days:number, died:boolean, cause:string, money:number,
 *            sanity:number, reachedGoal:boolean, visits:Record<string,number>}}
 */
export function playRun(seed, strategyName = 'greedy', { maxDays = 200, buyPerks = true } = {}) {
  const strategy = STRATEGIES[strategyName];
  if (!strategy) throw new Error(`unknown strategy: ${strategyName}`);

  const gs = new GameState({ seed });
  const rng = createRng(seed + 7);
  const events = new EventManager(rng);
  events.initialize(gs.getCharacterNames());

  const visits = Object.create(null);
  let guard = 0;

  while (!gs.gameOver && gs.journeyDay < maxDays && guard++ < maxDays + 50) {
    if (buyPerks) {
      for (const p of PERKS) if (gs.canBuy(p.id).ok) gs.buyPerk(p.id);
    }
    const open = LOCATIONS.filter((l) => evaluateUnlock(l, snapshotOf(gs)).unlocked);
    const pool = open.length > 0 ? open : [LOCATIONS[0]];
    const choice = strategy(gs, pool, rng);
    visits[choice.id] = (visits[choice.id] ?? 0) + 1;

    resolveTurn(gs, events, choice.id);
    if (gs.gameOver) break;
    gs.advanceDay();
  }

  return {
    days: gs.journeyDay,
    died: gs.gameOver,
    cause: gs.gameOver ? (gs.sanity <= 0 ? 'sanity' : 'money') : '',
    money: gs.money,
    sanity: gs.sanity,
    reputation: gs.reputation,
    insight: gs.insight,
    perks: gs.perks.size,
    reachedGoal: gs.won,
    visits,
  };
}

/** Aggregate `runs` seeded runs for one strategy. */
export function summarise(strategyName, { runs = 100, maxDays = 200 } = {}) {
  const results = [];
  for (let i = 1; i <= runs; i++) {
    results.push(playRun(i * 1013, strategyName, { maxDays }));
  }
  const deaths = results.filter((r) => r.died);
  const mean = (arr) => arr.reduce((a, b) => a + b, 0) / (arr.length || 1);

  const visits = Object.create(null);
  for (const r of results) {
    for (const [k, v] of Object.entries(r.visits)) visits[k] = (visits[k] ?? 0) + v;
  }
  const totalVisits = Object.values(visits).reduce((a, b) => a + b, 0) || 1;

  return {
    strategy: strategyName,
    runs,
    maxDays,
    deathRate: deaths.length / runs,
    deathsBySanity: deaths.filter((r) => r.cause === 'sanity').length,
    deathsByMoney: deaths.filter((r) => r.cause === 'money').length,
    goalRate: results.filter((r) => r.reachedGoal).length / runs,
    meanDays: mean(results.map((r) => r.days)),
    meanMoney: mean(results.map((r) => r.money)),
    meanSanity: mean(results.map((r) => r.sanity)),
    meanReputation: mean(results.map((r) => r.reputation)),
    meanInsight: mean(results.map((r) => r.insight)),
    unusedLocations: LOCATIONS.filter((l) => !visits[l.id]).map((l) => l.id),
    pickRates: Object.fromEntries(
      Object.entries(visits)
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => [k, v / totalVisits]),
    ),
  };
}

// ------------------------------------------------------------------ CLI

function main() {
  const arg = (name, fallback) => {
    const found = process.argv.find((a) => a.startsWith(`--${name}=`));
    return found ? Number(found.split('=')[1]) : fallback;
  };
  const runs = arg('runs', 100);
  const maxDays = arg('days', 200);
  const verbose = process.argv.includes('--verbose');
  const pct = (n) => `${(n * 100).toFixed(0)}%`;

  console.log(`Balance simulation — ${runs} seeds, ${maxDays}-day horizon\n`);
  for (const name of Object.keys(STRATEGIES)) {
    const s = summarise(name, { runs, maxDays });
    console.log(`${name.padEnd(10)} death ${pct(s.deathRate).padStart(4)}`
      + `  (sanity ${s.deathsBySanity}, money ${s.deathsByMoney})`
      + `   day-100 ${pct(s.goalRate).padStart(4)}`
      + `   mean survival ${s.meanDays.toFixed(0)}d`);
    console.log(`${''.padEnd(10)} end: money ${s.meanMoney.toFixed(0)}`
      + `  sanity ${s.meanSanity.toFixed(0)}`
      + `  rep ${s.meanReputation.toFixed(0)}`
      + `  insight ${s.meanInsight.toFixed(0)}`);
    if (verbose) {
      const top = Object.entries(s.pickRates).slice(0, 6)
        .map(([k, v]) => `${k} ${pct(v)}`).join('  ');
      console.log(`${''.padEnd(10)} picks: ${top}`);
      if (s.unusedLocations.length) {
        console.log(`${''.padEnd(10)} never visited: ${s.unusedLocations.join(', ')}`);
      }
    }
    console.log();
  }
}

if (process.argv[1] && process.argv[1].endsWith('simulate.js')) main();
