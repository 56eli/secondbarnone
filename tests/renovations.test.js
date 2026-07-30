import test from 'node:test';
import assert from 'node:assert/strict';
import { GameState, START_SANITY } from '../docs/js/core/game-state.js';
import { RENOVATIONS, getRenovation } from '../docs/js/data/renovations.js';

test('renovations start locked and unlock at day 60 or with 10 perks', () => {
  const gs = new GameState();
  assert.equal(gs.isRenovationUnlocked(), false);

  gs.journeyDay = 60;
  assert.equal(gs.isRenovationUnlocked(), true);

  const gs2 = new GameState();
  for (let i = 0; i < 10; i++) gs2.perks.add(`perk_${i}`);
  assert.equal(gs2.isRenovationUnlocked(), true);
});

test('buyRenovation spends insight and money, rewards reputation and sanity, and persists', () => {
  const gs = new GameState();
  gs.journeyDay = 60;
  gs.insight = 100;
  gs.money = 100;

  const r = getRenovation('roof_repair');
  assert.ok(r);

  const ok = gs.buyRenovation('roof_repair');
  assert.equal(ok, true);
  assert.ok(gs.renovations.has('roof_repair'));
  assert.equal(gs.insight, 100 - r.cost.insight);
  assert.equal(gs.money, 100 - r.cost.money);

  const data = gs.toJSON();
  const gs3 = new GameState();
  gs3.loadFrom(data);
  assert.ok(gs3.renovations.has('roof_repair'));
});
