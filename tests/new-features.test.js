/** Tests for new gameplay loop improvements. */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { GameState, migrateSave, CURRENT_SAVE_VERSION } from '../docs/js/core/game-state.js';
import { EventManager } from '../docs/js/core/event-manager.js';

describe('new gameplay loop improvements', () => {
  it('migrates a v3 save all the way to the current schema', () => {
    const v3 = { v: 3, sanity: 50, money: 50, journeyDay: 5 };
    const migrated = migrateSave(v3);
    // Assert against the constant so a schema bump is a deliberate change to
    // the migration chain rather than a failure in every test that mentions
    // a version number.
    assert.strictEqual(migrated.v, CURRENT_SAVE_VERSION);
    assert.strictEqual(migrated.reputation, 10);
    assert.strictEqual(migrated.energy, 100);
    // v5 -> v6 defaults must also be applied on the way through.
    assert.strictEqual(migrated.pendingObservance, null);
    assert.deepStrictEqual(migrated.affinity, {});
  });

  it('checks second win requires reputation and exploration', () => {
    const gs = new GameState();
    gs.journeyDay = 100;
    gs.reputation = 85;
    gs.money = 250;
    gs.visitedLocations = new Set([
      'spiritual_community',
      'bar',
      'home_loft',
      'rooftop',
      'free_clinic',
      'river_walk',
      'community_garden',
      'farmers_market',
      'bathhouse',
      'night_market',
      'flea_market',
      'public_library',
      'pawn_shop',
      'radio_station',
      'open_mic',
      'landlord_office',
      'sato_studio',
      'alex_cocktail_bar',
    ]);
    gs.consecutiveBarDays = 2;
    gs.maxConsecutiveBarDays = 5;
    assert.strictEqual(gs.checkSecondWin(), true);
  });

  it('checks second win fails with low reputation', () => {
    const gs = new GameState();
    gs.journeyDay = 100;
    gs.reputation = 40;
    gs.money = 250;
    gs.visitedLocations = new Set(new Array(18).fill('bar'));
    assert.strictEqual(gs.checkSecondWin(), false);
  });

  it('reputation discount reduces rent', () => {
    const gs = new GameState();
    gs.reputation = 80;
    gs.money = 100;
    gs.journeyDay = 7; // Sunday
    gs.consecutiveBarDays = 0;
    // Force a Sunday where rent is due
    const rent = gs.rentDue();
    assert.strictEqual(rent, 14); // 18 - 4 (high rep discount)
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

describe('mastery bar-streak memory', () => {
  it('tracks the highest consecutive bar streak and uses it for mastery', () => {
    const gs = new GameState();
    for (let i = 0; i < 6; i += 1) gs.noteVisit('bar');
    assert.strictEqual(gs.consecutiveBarDays, 6);
    assert.strictEqual(gs.maxConsecutiveBarDays, 6);
    gs.noteVisit('home_loft');
    assert.strictEqual(gs.consecutiveBarDays, 0);
    assert.strictEqual(gs.maxConsecutiveBarDays, 6);

    gs.journeyDay = 100;
    gs.reputation = 85;
    gs.money = 250;
    gs.visitedLocations = new Set([
      'spiritual_community',
      'bar',
      'home_loft',
      'rooftop',
      'free_clinic',
      'river_walk',
      'community_garden',
      'farmers_market',
      'bathhouse',
      'night_market',
      'flea_market',
      'public_library',
      'pawn_shop',
      'radio_station',
      'open_mic',
      'landlord_office',
      'sato_studio',
      'alex_cocktail_bar',
    ]);
    assert.strictEqual(gs.checkSecondWin(), false);
  });
});

describe('tier one systems pass', () => {
  it('relationship-gated events stay locked until affinity is earned', () => {
    const em = new EventManager({ random: () => 0, randInt: () => 1, pick: (xs) => xs[0] });
    em.initialize(['Geo']);
    const locked = em._buildPool(80, 1, 'bar', { tags: ['work', 'night'], affinity: {} });
    assert.ok(!locked.some((e) => e.id === 'barret_counts_you_in'));
    const open = em._buildPool(80, 1, 'bar', { tags: ['work', 'night'], affinity: { barret: 3 } });
    assert.ok(open.some((e) => e.id === 'barret_counts_you_in'));
  });

  it('community resilience only cushions event losses', () => {
    const gs = new GameState();
    gs.resilience = 5;
    const shielded = gs.absorbEventLosses({ sanity: -7, money: -3 });
    assert.strictEqual(shielded.used, 5);
    assert.strictEqual(shielded.deltas.sanity, -2);
    assert.strictEqual(shielded.deltas.money, -3);
    assert.strictEqual(gs.resilience, 0);
  });

  it('retiring after the endurance goal produces a real ending', () => {
    const gs = new GameState();
    gs.journeyDay = 60;
    gs.won = true;
    gs.noteVisit('spiritual_community');
    assert.strictEqual(gs.retireRun(), true);
    assert.strictEqual(gs.gameOver, true);
    assert.strictEqual(gs.endingOutcome, 'retired');
    assert.ok(gs.getEnding().title.length > 0);
  });

  it('cross-run event memory is separate from one-run recent memory', () => {
    const em = new EventManager({ random: () => 0, randInt: () => 1, pick: (xs) => xs[0] });
    em.initialize(['Geo']);
    em.setGlobalSeenIds(['unexpected_tips']);
    em.selectEvent(2, 2, 'bar', 0, { tags: ['work', 'night'] });
    assert.ok(em.seenEventIds().includes('unexpected_tips'));
    em.reset();
    assert.ok(em.seenEventIds().includes('unexpected_tips'));
  });
});
