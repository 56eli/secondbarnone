/**
 * Player-difficulty assessment.
 *
 * Unlike the historic economy smoke test, this suite models seven explicit
 * behaviours against the real six-card hub. It is a calibration contract, not
 * a claim that a utility function is a human being: it gives balancing changes
 * a stable, reviewable definition of "average player" and makes the intended
 * 50% 60-day completion rate measurable.
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

test('the average player reaches the 60-day goal about half the time', () => {
  const average = results().average;
  assert.ok(
    average.goalRate >= 0.43 && average.goalRate <= 0.57,
    `average goal rate ${average.goalRate.toFixed(3)} is outside the 50% ±7% band`,
  );
  assert.equal(average.goalRate + average.deathRate, 1, 'runs end at the goal or a loss');
});

test('attention produces a clear but not binary skill gradient', () => {
  const s = results();
  assert.ok(s.random.goalRate < 0.3, `random players win too often: ${s.random.goalRate}`);
  assert.ok(
    s.doesnt_pay_attention.goalRate < s.random.goalRate,
    'ignoring previews, rent and energy should be worse than random exploration',
  );
  assert.ok(
    s.pays_attention_sometimes.goalRate > s.average.goalRate,
    'occasional informed choices should outperform the average baseline',
  );
  assert.ok(
    s.greedy.goalRate >= 0.95,
    `greedy players should read as skilled: ${s.greedy.goalRate}`,
  );
  assert.ok(
    s.concentrates.goalRate >= s.greedy.goalRate,
    'consistent concentration should not underperform a greedy preview reader',
  );
  assert.ok(
    s.min_maxing.goalRate >= s.concentrates.goalRate,
    'min-maxing should not underperform concentration',
  );
});
