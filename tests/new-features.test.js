/** Tests for new gameplay loop improvements. */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { GameState, migrateSave } from '../docs/js/core/game-state.js';
import { EventManager } from '../docs/js/core/event-manager.js';

describe('new gameplay loop improvements', () => {
  it('migrates v3 saves to v6 (current)', () => {
    const v3 = { v: 3, sanity: 50, money: 50, journeyDay: 5 };
    const migrated = migrateSave(v3);
    assert.strictEqual(migrated.v, 6);
    assert.strictEqual(migrated.reputation, 10);
    assert.strictEqual(migrated.energy, 100);
    assert.strictEqual(migrated.masteryWon, false);
  });

  it('migrates v4 saves forward to v6', () => {
    const v4 = { v: 4, sanity: 70, money: 20, journeyDay: 9 };
    const migrated = migrateSave(v4);
    assert.strictEqual(migrated.v, 6);
    assert.strictEqual(migrated.masteryWon, false);
  });

  it('checks enlightenment requires day 150 and every House of Middleway renovation', () => {
    const gs = new GameState();
    gs.journeyDay = 150;
    gs.renovations = new Set(['roof_repair', 'community_kitchen', 'meditation_garden', 'sanctuary_library']);
    assert.strictEqual(gs.checkSecondWin(), true);
  });

  it('enlightenment fails before day 150 or with an unfinished House', () => {
    const gs = new GameState();
    gs.journeyDay = 149;
    gs.renovations = new Set(['roof_repair', 'community_kitchen', 'meditation_garden', 'sanctuary_library']);
    assert.strictEqual(gs.checkSecondWin(), false);
    gs.journeyDay = 150;
    gs.renovations.delete('sanctuary_library');
    assert.strictEqual(gs.checkSecondWin(), false);
  });

  it('enlightenment only fires once (idempotent)', () => {
    const gs = new GameState();
    gs.journeyDay = 150;
    gs.renovations = new Set(['roof_repair', 'community_kitchen', 'meditation_garden', 'sanctuary_library']);
    assert.strictEqual(gs.checkSecondWin(), true);
    assert.strictEqual(gs.masteryWon, true);
    assert.strictEqual(gs.checkSecondWin(), false);
  });

  it('Kaden starts the run with goodwill then smears Léon on day two exactly once', () => {
    const gs = new GameState();
    assert.strictEqual(gs.reputation, 80);
    assert.strictEqual(gs.advanceDay(), true);
    assert.strictEqual(gs.journeyDay, 2);
    assert.strictEqual(gs.reputation, 15);
    assert.strictEqual(gs.kadenSmearSeen, true);
    assert.strictEqual(gs.advanceDay(), false);
    assert.strictEqual(gs.reputation, 15);
  });

  it('prepaying rent on a Sunday does NOT skip today\u2019s rent (exploit fixed)', () => {
    const gs = new GameState();
    // Advance to first Sunday
    while (gs.getWeekdayIndex() !== 6) gs.advanceDay();
    gs.money = 200;
    const sunday = gs.journeyDay;
    assert.ok(gs.isRentDue(), 'rent should be due on Sunday');
    // Prepay while rent is due today: must not erase today's rent
    const prepaid = gs.prepayRent(1);
    assert.strictEqual(prepaid, true, 'prepay should succeed');
    // After prepaying today is still due
    assert.ok(gs.isRentDue(), 'today\u2019s rent must still be due after prepay');
    const charged = gs.applyRentIfSunday();
    assert.ok(charged > 0, 'today\u2019s rent must actually be charged');
    // Next Sunday (7 days on) should be covered
    for (let i = 0; i < 7; i++) gs.advanceDay();
    assert.strictEqual(gs.getWeekdayIndex(), 6);
    assert.strictEqual(gs.isRentDue(), false, 'next Sunday should be prepaid');
  });

  it('reputation discount reduces rent', () => {
    const gs = new GameState();
    gs.reputation = 80;
    gs.money = 100;
    gs.journeyDay = 7; // Sunday
    gs.consecutiveBarDays = 0;
    // Force a Sunday where rent is due
    const rent = gs.rentDue();
    assert.strictEqual(rent, 16); // 18 - 2 (high-reputation discount)
  });

  it('energy forecast returns a string', () => {
    const gs = new GameState();
    gs.energy = 20;
    const nudge = gs.getDailyNudge();
    assert.ok(typeof nudge.text === 'string');
    assert.ok(
      nudge.text.includes('Pace') || nudge.text.includes('empty') || nudge.text.includes('rest'),
    );
  });
});

it('settles a long trip atomically: travel rent can end the run and deltas include every travel day', async () => {
  const { resolveTurn } = await import('../docs/js/core/turn.js');
  const { createRng } = await import('../docs/js/core/rng.js');
  const gs = new GameState({ seed: 1 });
  // Day 2 is Friday, so the retreat's two additional silent nights include Sunday.
  gs.journeyDay = 2;
  gs.dayOfMonth = 2;
  gs.money = 32;
  gs.sanity = 50;
  gs.energy = 100;
  gs.reputation = 100;
  const events = new EventManager(createRng(9));
  events.initialize(gs.getCharacterNames());
  // This test is about trip accounting, not a random event payout.
  events._nextEventDay = 999;

  const result = resolveTurn(gs, events, 'mountain_retreat');

  assert.equal(result.longTrip, true);
  assert.equal(result.extraDays, 2);
  assert.ok(result.extraRent > 0, 'Sunday rent should be charged during travel');
  assert.equal(gs.journeyDay, 4, 'the trip should finish on Sunday');
  assert.equal(gs.money, 0, 'travel rent should be reflected in the final state');
  assert.equal(result.gameOver, true, 'zero money during travel must end the run');
  assert.equal(gs.gameOver, true);
  assert.equal(result.deltas.money, gs.money - 32, 'displayed deltas include travel rent');
  assert.equal(result.deltas.energy, gs.energy - 100, 'displayed deltas include recovery nights');
});
