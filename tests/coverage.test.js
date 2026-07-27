/**
 * Coverage-completion tests.
 *
 * game.test.js covers the game rules and dom.test.js covers the main user
 * journeys. This file deliberately targets the paths those two miss: the
 * unseeded RNG branch, small exported helpers, the signal-unsubscribe path,
 * and defensive branches that normal play never reaches.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { createRng, defaultRng } from '../docs/js/core/rng.js';
import { GameState, MAX_STAT, RENT_AMOUNT } from '../docs/js/core/game-state.js';
import { EventManager } from '../docs/js/core/event-manager.js';
import { resolveTurn, LOCATION_COPY } from '../docs/js/core/turn.js';
import { resourceBarClass } from '../docs/js/core/resource-bar.js';
import {
  buildEventPool, rarityName, Rarity, Category,
  WEIGHT_STANDARD, WEIGHT_RARE_HELPFUL, WEIGHT_RARE_HURTFUL,
} from '../docs/js/data/events.js';
import { createAllProfiles, getInitials, roleLabel, Role } from '../docs/js/data/characters.js';

// ------------------------------------------------------------------- rng

test('createRng() with no seed uses Math.random and still respects bounds', () => {
  const rng = createRng();
  for (let i = 0; i < 400; i++) {
    const r = rng.random();
    assert.ok(r >= 0 && r < 1, `random() out of range: ${r}`);

    const n = rng.randInt(3, 7);
    assert.ok(Number.isInteger(n) && n >= 3 && n <= 7, `randInt out of range: ${n}`);

    const f = rng.randFloat(2, 5);
    assert.ok(f >= 2 && f < 5, `randFloat out of range: ${f}`);

    const picked = rng.pick(['a', 'b', 'c']);
    assert.ok(['a', 'b', 'c'].includes(picked));
  }
});

test('createRng(null) also falls back to the unseeded path', () => {
  const rng = createRng(null);
  assert.ok(rng.random() >= 0 && rng.random() < 1);
  assert.ok(['x'].includes(rng.pick(['x'])));
});

test('the seeded rng exposes the same interface as the unseeded one', () => {
  const seeded = createRng(1);
  const unseeded = createRng();
  assert.deepEqual(Object.keys(seeded).sort(), Object.keys(unseeded).sort());
});

test('seeded randFloat and pick are deterministic', () => {
  const a = createRng(4242);
  const b = createRng(4242);
  for (let i = 0; i < 30; i++) {
    assert.equal(a.randFloat(0, 10), b.randFloat(0, 10));
    assert.equal(a.pick([1, 2, 3, 4, 5]), b.pick([1, 2, 3, 4, 5]));
  }
});

test('different seeds produce different sequences', () => {
  const a = createRng(1);
  const b = createRng(2);
  const seqA = Array.from({ length: 12 }, () => a.random());
  const seqB = Array.from({ length: 12 }, () => b.random());
  assert.notDeepEqual(seqA, seqB);
});

test('defaultRng is usable out of the box', () => {
  assert.ok(defaultRng.random() >= 0);
  assert.ok(Number.isInteger(defaultRng.randInt(1, 2)));
});

// --------------------------------------------------------------- helpers

test('rarityName covers every rarity and unknown input', () => {
  assert.equal(rarityName(Rarity.STANDARD), 'Common');
  assert.equal(rarityName(Rarity.RARE_HELPFUL), 'Rare (Helpful)');
  assert.equal(rarityName(Rarity.RARE_HURTFUL), 'Rare (Hurtful)');
  assert.equal(rarityName('nonsense'), '');
  assert.equal(rarityName(undefined), '');
});

test('roleLabel falls back to Side Character for unknown roles', () => {
  assert.equal(roleLabel(Role.PROTAGONIST), 'Protagonist');
  assert.equal(roleLabel('not_a_real_role'), 'Side Character');
  assert.equal(roleLabel(undefined), 'Side Character');
});

test('getInitials handles multi-word, unicode and empty names', () => {
  assert.equal(getInitials('Brock Lee'), 'BL');
  assert.equal(getInitials('Andre Watson'), 'AW');
  assert.equal(getInitials('Oh'), 'O');
  assert.equal(getInitials(''), '?');
  assert.equal(getInitials(undefined), '?');
  assert.equal(getInitials('  '), '?');
});

test('the exported event weights match the values used in the pool', () => {
  const pool = buildEventPool();
  for (const e of pool) {
    const expected = e.rarity === Rarity.STANDARD ? WEIGHT_STANDARD
      : e.rarity === Rarity.RARE_HELPFUL ? WEIGHT_RARE_HELPFUL
        : WEIGHT_RARE_HURTFUL;
    assert.equal(e.weight, expected, `${e.id} weight mismatch`);
  }
});

test('LOCATION_COPY describes both playable locations', () => {
  for (const key of ['spiritual_community', 'bar']) {
    const copy = LOCATION_COPY[key];
    assert.ok(copy, `missing copy for ${key}`);
    assert.ok(copy.name.length > 0);
    assert.ok(copy.actionDesc.length > 20);
    assert.ok(copy.historyLabel.length > 0);
  }
});

// ------------------------------------------------------- signal plumbing

test('on() returns an unsubscribe function that works', () => {
  const gs = new GameState();
  let calls = 0;
  const unsubscribe = gs.on('stats_changed', () => { calls += 1; });

  gs.applyEventDeltas(1, 0);
  assert.equal(calls, 1);

  unsubscribe();
  gs.applyEventDeltas(1, 0);
  assert.equal(calls, 1, 'handler should not fire after unsubscribe');
});

test('off() removes a specific handler and ignores unknown ones', () => {
  const gs = new GameState();
  let a = 0;
  let b = 0;
  const handlerA = () => { a += 1; };
  const handlerB = () => { b += 1; };

  gs.on('stats_changed', handlerA);
  gs.on('stats_changed', handlerB);
  gs.applyEventDeltas(1, 0);
  assert.equal(a, 1);
  assert.equal(b, 1);

  gs.off('stats_changed', handlerA);
  gs.applyEventDeltas(1, 0);
  assert.equal(a, 1, 'removed handler must not fire');
  assert.equal(b, 2, 'remaining handler must still fire');

  // Removing something never registered, or from an unknown signal, is a no-op.
  gs.off('stats_changed', () => {});
  gs.off('no_such_signal', handlerB);
  gs.emit('no_such_signal');
});

test('emit tolerates a handler unsubscribing mid-dispatch', () => {
  const gs = new GameState();
  const seen = [];
  const first = () => { seen.push('first'); gs.off('day_changed', second); };
  const second = () => { seen.push('second'); };

  gs.on('day_changed', first);
  gs.on('day_changed', second);
  gs.advanceDay();

  // The listener list is copied before dispatch, so both still run this round.
  assert.deepEqual(seen, ['first', 'second']);

  seen.length = 0;
  gs.advanceDay();
  assert.deepEqual(seen, ['first'], 'second should be gone on the next emit');
});

test('multiple listeners on the same signal all fire', () => {
  const gs = new GameState();
  let count = 0;
  for (let i = 0; i < 5; i++) gs.on('history_updated', () => { count += 1; });
  gs.addHistory('something happened');
  assert.equal(count, 5);
});

// ------------------------------------------------- defensive game paths

test('an unknown location id leaves stats untouched', () => {
  const gs = new GameState();
  const { sanity, money } = gs;
  gs.applyLocationAction('not_a_place');
  assert.equal(gs.sanity, sanity);
  assert.equal(gs.money, money);
  assert.equal(gs.lastLocationVisited, 'not_a_place');
});

test('resolveTurn on an unknown location produces empty copy and no location label', () => {
  const gs = new GameState({ seed: 77 });
  const em = new EventManager(createRng(3));
  em.initialize(gs.getCharacterNames());
  // Push the next event well out of reach so the history line is only ever
  // built from the location part, which is what this test is about.
  em._nextEventDay = 9999;

  const result = resolveTurn(gs, em, 'nowhere');
  assert.equal(result.actionDesc, '');
  assert.equal(result.sanityDelta, 0);
  assert.equal(result.moneyDelta, 0);
  assert.equal(gs.recentHistory[0], '', 'no label for an unknown location');
});

test('getSeason returns Unknown for an out-of-range month', () => {
  const gs = new GameState();
  gs.monthIndex = 99;
  assert.equal(gs.getSeason(), 'Unknown');
});


test('checkGameOver returns early once the game is already over', () => {
  const gs = new GameState();
  let fired = 0;
  gs.on('game_over_triggered', () => { fired += 1; });

  gs.money = 0;
  assert.equal(gs.checkGameOver(), true);
  assert.equal(fired, 1);

  // Now break sanity too — still no second signal.
  gs.sanity = 0;
  assert.equal(gs.checkGameOver(), true);
  assert.equal(fired, 1);
});

test('resolveTurn skips event selection when the game is already over', () => {
  const gs = new GameState();
  const em = new EventManager(createRng(9));
  em.initialize(gs.getCharacterNames());

  gs.gameOver = true;
  const result = resolveTurn(gs, em, 'bar');
  assert.equal(result.event, null, 'no event should fire after game over');
});

test('an empty eligible pool schedules the next event without firing', () => {
  const em = new EventManager(createRng(11));
  em.initialize([]);
  // Force every event to require a location that does not exist, so the pool
  // is guaranteed empty and the "nothing eligible" branch is the one taken.
  em._allEvents = buildEventPool().map((e) => ({ ...e, requiredLocation: 'void' }));
  for (let day = 1; day <= 60; day++) {
    assert.equal(em.selectEvent(day, day % 7, 'nowhere', 0), null);
  }
});

test('a single-event pool still selects without the repeat filter', () => {
  const em = new EventManager(createRng(5));
  em.initialize(['Geo']);
  // Replace the pool with one event so the `pool.length > 1` branch is skipped.
  em._allEvents = buildEventPool().filter((e) => e.id === 'slow_night');

  let fired = null;
  for (let day = 1; day <= 40 && !fired; day++) {
    fired = em.selectEvent(day, day % 7, 'bar', 0);
  }
  assert.ok(fired);
  assert.equal(fired.id, 'slow_night');
});

test('weighted selection terminates even when every weight is zero', () => {
  const em = new EventManager(createRng(6));
  em.initialize(['Geo']);
  em._allEvents = buildEventPool()
    .filter((e) => e.requiredLocation === 'bar')
    .map((e) => ({ ...e, weight: 0 }));

  let fired = null;
  for (let day = 1; day <= 40 && !fired; day++) {
    fired = em.selectEvent(day, day % 7, 'bar', 0);
  }
  assert.ok(fired, 'should fall through to the last pool entry');
});

test('friend events are filtered out when no character names are supplied', () => {
  const em = new EventManager(createRng(8));
  em.initialize([]);
  for (let day = 1; day <= 400; day++) {
    const e = em.selectEvent(day, day % 7, 'bar', 0);
    if (e) assert.notEqual(e.category, Category.FRIEND);
  }
});

test('an event with a weekday restriction only fires on that weekday', () => {
  const em = new EventManager(createRng(21));
  em.initialize(['Geo']);
  em._allEvents = buildEventPool()
    .filter((e) => e.requiredLocation === 'bar')
    .map((e) => (e.id === 'slow_night' ? { ...e, allowedWeekdays: [2] } : e));

  for (let day = 1; day <= 300; day++) {
    const weekday = day % 7;
    const e = em.selectEvent(day, weekday, 'bar', 0);
    if (e?.id === 'slow_night') assert.equal(weekday, 2);
  }
});

test('an event with a minimumDay does not fire before it', () => {
  const em = new EventManager(createRng(22));
  em.initialize(['Geo']);
  em._allEvents = buildEventPool()
    .filter((e) => e.requiredLocation === 'bar')
    .map((e) => (e.id === 'slow_night' ? { ...e, minimumDay: 100 } : e));

  for (let day = 1; day < 100; day++) {
    const e = em.selectEvent(day, day % 7, 'bar', 0);
    if (e) assert.notEqual(e.id, 'slow_night');
  }
});

test('rent is skipped when the calendar has already charged that day', () => {
  const gs = new GameState();
  for (let i = 0; i < 3; i++) gs.advanceDay();   // Sunday
  assert.equal(gs.applyRentIfSunday(), RENT_AMOUNT);

  // Same Sunday, second attempt.
  assert.equal(gs.applyRentIfSunday(), 0);

  // Next Sunday charges again.
  for (let i = 0; i < 7; i++) gs.advanceDay();
  assert.equal(gs.getWeekdayName(), 'Sunday');
  const before = gs.money;
  assert.equal(gs.applyRentIfSunday(), RENT_AMOUNT);
  assert.equal(gs.money, Math.max(before - RENT_AMOUNT, 0));
});

test('resetGame clears the rent guard so Sunday charges again', () => {
  const gs = new GameState();
  for (let i = 0; i < 3; i++) gs.advanceDay();
  gs.applyRentIfSunday();
  gs.resetGame();
  for (let i = 0; i < 3; i++) gs.advanceDay();
  assert.equal(gs.applyRentIfSunday(), RENT_AMOUNT);
});

test('stats stay clamped through a long adversarial event sequence', () => {
  const gs = new GameState();
  const swings = [999, -999, 50, -50, 0, MAX_STAT, -MAX_STAT];
  for (const s of swings) {
    for (const m of swings) {
      gs.applyEventDeltas(s, m);
      assert.ok(gs.sanity >= 0 && gs.sanity <= MAX_STAT);
      assert.ok(gs.money >= 0 && gs.money <= 99999);
    }
  }
});

// ------------------------------------------------------------ characters

test('portrait extensions match the painted / generated split', () => {
  const painted = new Set([
    'leon', 'geo', 'lakshay', 'arian', 'simon', 'kaj', 'dorian', 'barret',
    'kaden', 'sato', 'alex', 'ethan', 'matt', 'artem', 'klaudia', 'brian',
    'susan', 'hawkinstv', 'ricolewis', 'emily', 'kate',
    'yun', 'marlies', 'mateo', 'luca', 'cheezl', 'yume', 'joar', 'susan',
    'brock_lee', 'ahyeon', 'renata', 'siekamcebule', 'lou',
    'baris', 'stephen', 'iulian',
    'tarrasqu', 'friend', 'nestomalt', 'self', 'daniela', 'crveni',
    'gordon', 'oh', 'ricardoea', 'speedfire', 'scatmandu', 'cat',
    'hanans', 'kaschem', 'vanna', 'sir_cruds',
    'qustoge', 'groovyphoenix', 'cary', 'aril_stellar', 'alvigunilla', 'fraghis',
    'mrone', 'raul', 'marlene_xoxo', 'diamndsdancin',
    'seth', 'kopung', 'isra', 'kobideh', 'stijn12d', 'andre_watson',
  ]);
  for (const c of createAllProfiles()) {
    const expected = ['yume', 'joar', 'susan'].includes(c.id) ? 'png' : painted.has(c.id) ? 'webp' : 'svg';
    assert.ok(
      c.portrait.endsWith(`.${expected}`),
      `${c.id} should use .${expected}, got ${c.portrait}`,
    );
  }
});

test('getAllCharacters returns a copy that cannot corrupt the source', () => {
  const gs = new GameState();
  const first = gs.getAllCharacters();
  first.push({ id: 'intruder' });
  assert.equal(gs.getAllCharacters().length, first.length - 1);
});

test('every character biography is distinct', () => {
  const bios = createAllProfiles().map((c) => c.bio);
  assert.equal(new Set(bios).size, bios.length, 'duplicate biography text found');
});

test('every character has a distinct display name', () => {
  const names = createAllProfiles().map((c) => c.name);
  assert.equal(new Set(names).size, names.length, 'duplicate display name found');
});

// ----------------------------------------------------------- HUD resources
test('resource bars use percentage-proportional status bands', () => {
  assert.equal(resourceBarClass(0, 100), 'bar-critical');
  assert.equal(resourceBarClass(10, 100), 'bar-critical');
  assert.equal(resourceBarClass(25, 100), 'bar-warning');
  assert.equal(resourceBarClass(50, 100), 'bar-fair');
  assert.equal(resourceBarClass(75, 100), 'bar-full');
  assert.equal(resourceBarClass(100, 100), 'bar-full');
  assert.equal(resourceBarClass(500, 100), 'bar-full');
});
