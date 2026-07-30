/**
 * Player-difficulty assessment.
 *
 * Unlike the historic economy smoke test, this suite models seven explicit
 * behaviours against the real six-card hub. It is a calibration contract, not
 * a claim that a utility function is a human being: it gives balancing changes
 * a stable, reviewable definition of "average player" and makes the intended
 * difficulty measurable.
 *
 * Current tuning contract (Hard Winter, 2026-07-30 — one canonical tuning,
 * no easy mode):
 *
 *   model                    60-day goal   meaning
 *   doesnt_pay_attention     ~0%           alternates the founding pair and dies
 *   random                   <35%          luck is not a plan
 *   greedy                   15–30%        naive preview-reading dies ~3 of 4 runs
 *   average                  35–50%        the reference player: a real coin flip
 *   pays_attention_sometimes > average     attention is the game
 *   concentrates             ≥50%          engaged play wins ~3 of 5
 *   min_maxing               ≥ concentrates, <100% — nobody is immortal
 *
 * Measured (300 runs each, v2.6): DPA 0%, random/greedy 27%, average 42%,
 * sometimes 45%, concentrates 61%, min-maxing 66%.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { assessDifficulty, PLAYER_STRATEGIES } from '../scripts/simulate.js';

const RUNS = 300;
const DAYS_TO_ASSESS = 61; // resolves day 60, then allows the normal advance

let assessment;
function results() {
  assessment ??= assessDifficulty({ runs: RUNS, maxDays: DAYS_TO_ASSESS });
  return assessment;
}

test('difficulty assessment exposes the agreed player behaviour models', () => {
  assert.deepEqual(PLAYER_STRATEGIES, [
    'random',
    'doesnt_pay_attention',
    'pays_attention_sometimes',
    'average',
    'greedy',
    'concentrates',
    'min_maxing',
  ]);
  assert.deepEqual(Object.keys(results()), [...PLAYER_STRATEGIES]);
});

test('the average player faces a real coin flip over 60 days', () => {
  const average = results().average;
  assert.ok(
    average.goalRate >= 0.35 && average.goalRate <= 0.5,
    `average goal rate ${average.goalRate.toFixed(3)} is outside the 35–50% band`,
  );
  assert.equal(average.goalRate + average.deathRate, 1, 'runs end at the goal or a loss');
});

test('rotating locations earn at least a quarter of informed choices', () => {
  const founding = new Set(['spiritual_community', 'bar']);
  for (const name of [
    'pays_attention_sometimes',
    'average',
    'greedy',
    'concentrates',
    'min_maxing',
  ]) {
    const rotatingShare = Object.entries(results()[name].pickRates)
      .filter(([id]) => !founding.has(id))
      .reduce((sum, [, share]) => sum + share, 0);
    assert.ok(
      rotatingShare >= 0.25,
      `${name} chose rotating locations only ${(rotatingShare * 100).toFixed(1)}% of the time`,
    );
  }
});

test('attention produces a clear but not binary skill gradient', () => {
  const s = results();
  assert.ok(s.random.goalRate < 0.35, `random players should rarely succeed: ${s.random.goalRate}`);
  assert.ok(
    s.doesnt_pay_attention.goalRate < s.random.goalRate,
    'ignoring previews, rent and energy should be worse than random exploration',
  );
  assert.ok(
    s.greedy.goalRate >= 0.15 && s.greedy.goalRate <= 0.3,
    `naive greedy preview-reading should fail about 3 in 4 runs: ${s.greedy.goalRate.toFixed(3)}`,
  );
  assert.ok(
    s.pays_attention_sometimes.goalRate > s.average.goalRate,
    'occasional informed choices should outperform the average baseline',
  );
  assert.ok(
    s.concentrates.goalRate >= 0.5 && s.concentrates.goalRate > s.greedy.goalRate,
    `consistent concentration must clearly beat naive greed without being safe: ${s.concentrates.goalRate.toFixed(3)}`,
  );
  assert.ok(
    s.min_maxing.goalRate >= s.concentrates.goalRate && s.min_maxing.goalRate < 1,
    `min-maxing should top the gradient without being immortal: ${s.min_maxing.goalRate.toFixed(3)}`,
  );
});
