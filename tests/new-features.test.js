/** Tests for new gameplay loop improvements. */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { GameState, migrateSave } from '../docs/js/core/game-state.js';
import { EventManager } from '../docs/js/core/event-manager.js';

describe('new gameplay loop improvements', () => {
  it('migrates v3 saves to v4', () => {
    const v3 = { v: 3, sanity: 50, money: 50, journeyDay: 5 };
    const migrated = migrateSave(v3);
    assert.strictEqual(migrated.v, 4);
    assert.strictEqual(migrated.reputation, 10);
    assert.strictEqual(migrated.energy, 100);
  });

  it('checks second win requires reputation and exploration', () => {
    const gs = new GameState();
    gs.journeyDay = 100;
    gs.reputation = 85;
    gs.money = 250;
    gs.visitedLocations = new Set(['spiritual_community', 'bar', 'home_loft', 'rooftop', 'free_clinic', 'river_walk', 'community_garden', 'farmers_market', 'bathhouse', 'night_market', 'flea_market', 'public_library', 'pawn_shop', 'radio_station', 'open_mic', 'landlord_office', 'sato_studio', 'alex_cocktail_bar']);
    gs.consecutiveBarDays = 2;
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
    assert.strictEqual(rent, 16); // 18 - 2 (high-reputation discount)
  });

  it('energy forecast returns a string', () => {
    const gs = new GameState();
    gs.energy = 20;
    const nudge = gs.getDailyNudge();
    assert.ok(typeof nudge.text === 'string');
    assert.ok(nudge.text.includes('Pace') || nudge.text.includes('empty') || nudge.text.includes('rest'));
  });
});
