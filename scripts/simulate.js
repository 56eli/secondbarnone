#!/usr/bin/env node
/**
 * Balance simulator.
 *
 * Drives the *real* `resolveTurn` over many seeded runs and reports how often
 * each play style survives. This is the harness the project was missing: a
 * large unit suite proved the code was correct while the game itself was unloseable,
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
import { observablePreview } from '../docs/js/core/preview.js';
import { LOCATIONS, evaluateUnlock, dailySlotLineup } from '../docs/js/data/locations.js';
import { createRng } from '../docs/js/core/rng.js';
import { PERKS } from '../docs/js/data/perks.js';
import { RENOVATIONS } from '../docs/js/data/renovations.js';

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
const randomChoice = (pool, rng) => pool[Math.floor(rng.random() * pool.length)];

/** Score a preview with a configurable amount of survival awareness. */
function scorePreview(gs, location, { focus = 1, optimise = false } = {}) {
  // Models consume exactly what the UI exposes. Rain/snow become signed bands
  // and fog becomes positive focus icons; hidden arithmetic never leaks into a
  // strategy decision.
  const { total } = computeDayEffects(gs, location.id, { preview: true });
  const observed = observablePreview(gs.getWeather(), total, location);
  const visible = observed.bundle;
  const sanityWeight = gs.sanity < 45 ? 1 + 4 * focus : 1;
  const moneyWeight = gs.money < 45 ? 1 + 4 * focus : 1;
  const energyWeight = gs.energy < 35 ? 0.4 + 1.4 * focus : 0.2;
  const rentSoon = gs.getWeekdayIndex() >= 4 && gs.money < gs.rentDue() + 20;
  const rentWeight = rentSoon ? 1.5 * focus : 0;
  const headroom = optimise
    ? Math.min(gs.sanity + visible.sanity, 100) * 0.08 +
      Math.min(gs.money + visible.money, 100) * 0.08
    : 0;
  return (
    visible.sanity * sanityWeight +
    visible.money * (moneyWeight + rentWeight) +
    visible.energy * energyWeight +
    visible.reputation * 0.25 +
    visible.insight * 0.35 +
    headroom
  );
}

function bestPreview(gs, pool, options) {
  return pool.reduce(
    (best, location) =>
      scorePreview(gs, location, options) > scorePreview(gs, best, options) ? location : best,
    pool[0],
  );
}

/**
 * Explicit player models, from no attention to deliberate optimisation.
 * They use the preview information that the actual game presents; the
 * difficulty suite uses the real six-card hub pool, not a hidden full map.
 */
export const STRATEGIES = {
  /** Picks uniformly at random. */
  random: (_gs, pool, rng) => randomChoice(pool, rng),

  /** Strictly alternates the founding pair without reading previews, energy or rent. */
  doesnt_pay_attention: (gs, pool) => {
    const wanted = gs.journeyDay % 2 === 1 ? 'spiritual_community' : 'bar';
    return pool.find((location) => location.id === wanted) ?? pool[0];
  },

  /** Looks at a preview roughly one day in three; otherwise acts on impulse. */
  pays_attention_sometimes: (gs, pool, rng) =>
    rng.random() < 1 / 3 ? bestPreview(gs, pool, { focus: 0.65 }) : randomChoice(pool, rng),

  /** An average player notices genuine danger sometimes, but otherwise follows
   * impulse and does not optimise. The attention cadence is intentionally
   * calibrated against the real hub to make the 60-day goal a coin flip;
   * it moves when the economy does (see tests/difficulty.test.js). */
  average: (gs, pool, rng) =>
    rng.random() < 0.2 ? bestPreview(gs, pool, { focus: 0.75 }) : randomChoice(pool, rng),

  /** Reads every preview and consistently addresses the most urgent resource. */
  concentrates: (gs, pool) => bestPreview(gs, pool, { focus: 1 }),

  /** Uses every preview plus rent timing and headroom to optimise survival. */
  min_maxing: (gs, pool) => bestPreview(gs, pool, { focus: 1.25, optimise: true }),

  /** Historic preview-reader baseline retained for economy regression tests. */
  greedy: (gs, pool) => {
    let best = pool[0];
    let bestScore = -Infinity;
    for (const l of pool) {
      const { total } = computeDayEffects(gs, l.id, { preview: true });
      const visible = observablePreview(gs.getWeather(), total, l).bundle;
      const sanityWeight = gs.sanity < 40 ? 4 : 1;
      const moneyWeight = gs.money < 40 ? 4 : 1;
      const score =
        visible.sanity * sanityWeight +
        visible.money * moneyWeight +
        visible.energy * 0.4 +
        visible.reputation * 0.3 +
        visible.insight * 0.6;
      if (score > bestScore) {
        bestScore = score;
        best = l;
      }
    }
    return best;
  },
  alternate: (gs, pool) => {
    const wantMoney = gs.money <= gs.sanity;
    const bar = pool.find((l) => l.id === 'bar');
    const community = pool.find((l) => l.id === 'spiritual_community');
    return (wantMoney ? bar : community) ?? pool[0];
  },
};

/** The seven models reported by the player-difficulty suite. */
export const PLAYER_STRATEGIES = Object.freeze([
  'random',
  'doesnt_pay_attention',
  'pays_attention_sometimes',
  'average',
  'greedy',
  'concentrates',
  'min_maxing',
]);

/**
 * Play one run to completion or to `maxDays`.
 * @returns {{days:number, died:boolean, cause:string, money:number,
 *            sanity:number, reachedGoal:boolean, visits:Record<string,number>}}
 */
export function playRun(
  seed,
  strategyName = 'greedy',
  { maxDays = 200, buyPerks = true, buyRenovations = true, poolMode = 'unlocked' } = {},
) {
  const strategy = STRATEGIES[strategyName];
  if (!strategy) throw new Error(`unknown strategy: ${strategyName}`);

  const gs = new GameState({ seed });
  // Production seeds event scheduling directly from the city seed. Player
  // decisions consume a separate deterministic stream so an impulsive choice
  // cannot shift future event timing.
  const eventRng = createRng(seed);
  const decisionRng = createRng((seed + 0x9e3779b9) >>> 0);
  const events = new EventManager(eventRng);
  events.initialize(gs.getCharacterNames());

  const visits = Object.create(null);
  let guard = 0;

  while (!gs.gameOver && gs.journeyDay < maxDays && guard++ < maxDays + 50) {
    if (buyPerks) {
      for (const p of PERKS) if (gs.canBuy(p.id).ok) gs.buyPerk(p.id);
    }

    let snap = snapshotOf(gs);
    let open = LOCATIONS.filter((l) => evaluateUnlock(l, snap).unlocked);
    // The normal simulator retains its historic all-unlocked-map mode. The
    // difficulty suite uses the actual six-card hub: two foundations plus the
    // four deterministic rotating slot cards, filtered if locked/closed.
    let hub = [
      ...LOCATIONS.filter((l) => l.id === 'spiritual_community' || l.id === 'bar'),
      ...dailySlotLineup(snap, gs.weatherSeed),
    ].filter(
      (l, i, all) => evaluateUnlock(l, snap).unlocked && all.findIndex((x) => x.id === l.id) === i,
    );

    // Renovations are only available while the House of Middleway card is on
    // the hub. They cost no day in production, so a long-horizon model funds
    // every currently affordable project before choosing its daily action.
    if (buyRenovations && hub.some((location) => location.id === 'house_of_middleway')) {
      for (const renovation of RENOVATIONS) {
        if (gs.getRenovations().find((entry) => entry.id === renovation.id)?.canBuy) {
          gs.buyRenovation(renovation.id);
        }
      }
      snap = snapshotOf(gs);
      open = LOCATIONS.filter((l) => evaluateUnlock(l, snap).unlocked);
      hub = [
        ...LOCATIONS.filter((l) => l.id === 'spiritual_community' || l.id === 'bar'),
        ...dailySlotLineup(snap, gs.weatherSeed),
      ].filter(
        (l, i, all) =>
          evaluateUnlock(l, snap).unlocked && all.findIndex((x) => x.id === l.id) === i,
      );
    }

    const pool = poolMode === 'hub' ? hub : open;
    const choices = pool.length > 0 ? pool : [LOCATIONS[0]];
    const choice = strategy(gs, choices, decisionRng);
    visits[choice.id] = (visits[choice.id] ?? 0) + 1;

    resolveTurn(gs, events, choice.id);
    if (gs.gameOver) break;
    gs.advanceDay();
  }

  const cause = !gs.gameOver ? '' : gs.sanity <= 0 ? 'sanity' : gs.energy <= 0 ? 'energy' : 'money';

  return {
    days: gs.journeyDay,
    died: gs.gameOver,
    cause,
    money: gs.money,
    sanity: gs.sanity,
    energy: gs.energy,
    reputation: gs.reputation,
    insight: gs.insight,
    perks: gs.perks.size,
    renovations: gs.renovations.size,
    reachedGoal: gs.won,
    reachedMastery: gs.masteryWon,
    visits,
  };
}

/** Aggregate `runs` seeded runs for one strategy. */
export function summarise(strategyName, { runs = 100, maxDays = 200, poolMode = 'unlocked' } = {}) {
  const results = [];
  for (let i = 1; i <= runs; i += 1) {
    results.push(playRun(i * 1013, strategyName, { maxDays, poolMode }));
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
    deathsByEnergy: deaths.filter((r) => r.cause === 'energy').length,
    deathsByMoney: deaths.filter((r) => r.cause === 'money').length,
    // `goalRate` is monotonic: reaching day 60 stays earned after a later
    // death. `survivalRate` answers the separate maxDays-horizon question.
    goalRate: results.filter((r) => r.reachedGoal).length / runs,
    masteryRate: results.filter((r) => r.reachedMastery).length / runs,
    survivalRate: results.filter((r) => !r.died).length / runs,
    meanDays: mean(results.map((r) => r.days)),
    meanMoney: mean(results.map((r) => r.money)),
    meanSanity: mean(results.map((r) => r.sanity)),
    meanEnergy: mean(results.map((r) => r.energy)),
    meanReputation: mean(results.map((r) => r.reputation)),
    meanInsight: mean(results.map((r) => r.insight)),
    meanRenovations: mean(results.map((r) => r.renovations)),
    unusedLocations: LOCATIONS.filter((l) => !visits[l.id]).map((l) => l.id),
    pickRates: Object.fromEntries(
      Object.entries(visits)
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => [k, v / totalVisits]),
    ),
  };
}

/** Run the player-facing difficulty assessment against the actual hub. */
export function assessDifficulty({ runs = 200, maxDays = 61 } = {}) {
  return Object.fromEntries(
    PLAYER_STRATEGIES.map((name) => [name, summarise(name, { runs, maxDays, poolMode: 'hub' })]),
  );
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
  for (const name of PLAYER_STRATEGIES) {
    const s = summarise(name, { runs, maxDays, poolMode: 'hub' });
    console.log(
      `${name.padEnd(10)} death ${pct(s.deathRate).padStart(4)}` +
        `  (sanity ${s.deathsBySanity}, energy ${s.deathsByEnergy}, money ${s.deathsByMoney})` +
        `   goal ${pct(s.goalRate).padStart(4)}` +
        `   mastery ${pct(s.masteryRate).padStart(4)}` +
        `   horizon ${pct(s.survivalRate).padStart(4)}` +
        `   mean survival ${s.meanDays.toFixed(0)}d`,
    );
    console.log(
      `${''.padEnd(10)} end: money ${s.meanMoney.toFixed(0)}` +
        `  sanity ${s.meanSanity.toFixed(0)}` +
        `  energy ${s.meanEnergy.toFixed(0)}` +
        `  rep ${s.meanReputation.toFixed(0)}` +
        `  insight ${s.meanInsight.toFixed(0)}` +
        `  renovations ${s.meanRenovations.toFixed(1)}`,
    );
    if (verbose) {
      const top = Object.entries(s.pickRates)
        .slice(0, 6)
        .map(([k, v]) => `${k} ${pct(v)}`)
        .join('  ');
      console.log(`${''.padEnd(10)} picks: ${top}`);
      if (s.unusedLocations.length) {
        console.log(`${''.padEnd(10)} never visited: ${s.unusedLocations.join(', ')}`);
      }
    }
    console.log();
  }
}

if (process.argv[1] && process.argv[1].endsWith('simulate.js')) main();
