/**
 * Rule-parity tests for the JS port.
 *
 * These assert the behaviour described by the original GDScript, so a
 * regression in the port shows up as a failing test rather than a subtly
 * different game. Run with: npm test
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GameState, MAX_STAT, MONEY_HARD_CEILING, START_SANITY, START_MONEY, RENT_AMOUNT,
  ENDURANCE_GOAL_DAYS,
} from '../docs/js/core/game-state.js';
import { EventManager, MIN_EVENT_GAP_DAYS, MAX_EVENT_GAP_DAYS, BURNOUT_THRESHOLD } from '../docs/js/core/event-manager.js';
import { resolveTurn, computeDayEffects } from '../docs/js/core/turn.js';
import { LOCATIONS, locationIds, getLocation } from '../docs/js/data/locations.js';
import { getWeather } from '../docs/js/data/weather.js';
import { buildEventPool, Rarity, Category } from '../docs/js/data/events.js';
import { createAllProfiles, getInitials, Role, roleLabel } from '../docs/js/data/characters.js';
import { createRng } from '../docs/js/core/rng.js';

const seeded = () => createRng(12345);

// ----------------------------------------------------------- calendar

test('calendar starts Thursday, January 1, 2026', () => {
  const gs = new GameState();
  assert.equal(gs.getDateDisplay(), 'Thursday, January 1, 2026');
  assert.equal(gs.journeyDay, 1);
});

test('weekday advances correctly across a full week', () => {
  const gs = new GameState();
  const expected = ['Thursday', 'Friday', 'Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday'];
  for (const name of expected) {
    assert.equal(gs.getWeekdayName(), name);
    gs.advanceDay();
  }
});

test('month rolls over after January 31', () => {
  const gs = new GameState();
  for (let i = 0; i < 31; i++) gs.advanceDay();
  assert.equal(gs.dayOfMonth, 1);
  assert.equal(gs.getMonthName(), 'February');
});

test('leap year: 2028 has February 29', () => {
  const gs = new GameState();
  gs.year = 2028;
  gs.monthIndex = 1;
  gs.dayOfMonth = 28;
  gs.advanceDay();
  assert.equal(gs.dayOfMonth, 29);
  assert.equal(gs.getMonthName(), 'February');
});

test('non-leap year: 2026 February ends at 28', () => {
  const gs = new GameState();
  gs.monthIndex = 1;
  gs.dayOfMonth = 28;
  gs.advanceDay();
  assert.equal(gs.dayOfMonth, 1);
  assert.equal(gs.getMonthName(), 'March');
});

test('year rolls over after December 31', () => {
  const gs = new GameState();
  gs.monthIndex = 11;
  gs.dayOfMonth = 31;
  gs.advanceDay();
  assert.equal(gs.year, 2027);
  assert.equal(gs.getMonthName(), 'January');
  assert.equal(gs.dayOfMonth, 1);
});

// -------------------------------------------------------------- stats

test('starting stats are 50/50', () => {
  const gs = new GameState();
  assert.equal(gs.sanity, START_SANITY);
  assert.equal(gs.money, START_MONEY);
});

test('spiritual community trades money for sanity', () => {
  const gs = new GameState();
  const before = { sanity: gs.sanity, money: gs.money };
  gs.applyDeltas(getLocation('spiritual_community').effects);
  gs.noteVisit('spiritual_community');
  assert.ok(gs.sanity > before.sanity, 'community restores sanity');
  assert.ok(gs.money < before.money, 'community costs money');
  assert.equal(gs.consecutiveBarDays, 0);
});

test('bar trades sanity for money and counts consecutive days', () => {
  const gs = new GameState();
  const before = { sanity: gs.sanity, money: gs.money };
  gs.applyDeltas(getLocation('bar').effects);
  gs.noteVisit('bar');
  assert.ok(gs.money > before.money, 'the bar pays');
  assert.ok(gs.sanity < before.sanity, 'the bar costs spirit');
  assert.equal(gs.consecutiveBarDays, 1);
  gs.noteVisit('bar');
  assert.equal(gs.consecutiveBarDays, 2);
});

test('visiting the community resets the consecutive bar counter', () => {
  const gs = new GameState();
  gs.noteVisit('bar');
  gs.noteVisit('bar');
  assert.equal(gs.consecutiveBarDays, 2);
  gs.noteVisit('spiritual_community');
  assert.equal(gs.consecutiveBarDays, 0);
});

test('sanity is capped; money is uncapped but floors at zero', () => {
  const gs = new GameState();
  gs.applyDeltas({ sanity: 999, money: 999 });
  assert.equal(gs.sanity, MAX_STAT);
  assert.equal(gs.money, 999 + START_MONEY); // wallet has no soft ceiling
  assert.ok(gs.money > MAX_STAT);
  gs.applyDeltas({ sanity: -99999, money: -99999 });
  assert.equal(gs.sanity, 0);
  assert.equal(gs.money, 0);
});

test('money can grow well past 100 without being clamped', () => {
  const gs = new GameState();
  gs.money = 95;
  gs.applyDeltas({ money: getLocation('bar').effects.money });
  assert.ok(gs.money > 100, `expected >100, got ${gs.money}`);
  gs.applyDeltas({ money: 500 });
  assert.ok(gs.money >= 500);
  assert.ok(gs.money <= MONEY_HARD_CEILING);
});

// --------------------------------------------------------------- rent

test('rent is charged on Sunday only', () => {
  const gs = new GameState();               // Thursday
  assert.equal(gs.applyRentIfSunday(), 0);
  gs.advanceDay();                          // Friday
  assert.equal(gs.applyRentIfSunday(), 0);
  gs.advanceDay();                          // Saturday
  assert.equal(gs.applyRentIfSunday(), 0);
  gs.advanceDay();                          // Sunday
  const before = gs.money;
  assert.equal(gs.applyRentIfSunday(), RENT_AMOUNT);
  assert.equal(gs.money, before - RENT_AMOUNT);
});

test('rent is charged at most once per Sunday', () => {
  const gs = new GameState();
  for (let i = 0; i < 3; i++) gs.advanceDay();  // Sunday
  assert.equal(gs.applyRentIfSunday(), RENT_AMOUNT);
  assert.equal(gs.applyRentIfSunday(), 0);
  assert.equal(gs.applyRentIfSunday(), 0);
});

test('rent cannot push money below zero', () => {
  const gs = new GameState();
  for (let i = 0; i < 3; i++) gs.advanceDay();
  gs.money = 5;
  gs.applyRentIfSunday();
  assert.equal(gs.money, 0);
});

// ---------------------------------------------------------- game over

test('sanity reaching zero ends the game', () => {
  const gs = new GameState();
  let msg = null;
  gs.on('game_over_triggered', (m) => { msg = m; });
  gs.sanity = 0;
  assert.equal(gs.checkGameOver(), true);
  assert.match(msg, /sanity/i);
});

test('money reaching zero ends the game', () => {
  const gs = new GameState();
  let msg = null;
  gs.on('game_over_triggered', (m) => { msg = m; });
  gs.money = 0;
  assert.equal(gs.checkGameOver(), true);
  assert.match(msg, /broke/i);
});

test('game over fires only once', () => {
  const gs = new GameState();
  let count = 0;
  gs.on('game_over_triggered', () => { count += 1; });
  gs.sanity = 0;
  gs.checkGameOver();
  gs.checkGameOver();
  assert.equal(count, 1);
});

// ------------------------------------------------------------ history

test('history keeps only the five most recent entries, newest first', () => {
  const gs = new GameState();
  for (let i = 1; i <= 7; i++) gs.addHistory(`entry ${i}`);
  assert.equal(gs.recentHistory.length, 5);
  assert.equal(gs.recentHistory[0], 'entry 7');
  assert.equal(gs.recentHistory[4], 'entry 3');
});

// ------------------------------------------------------ season / focus

test('season maps from month index', () => {
  const gs = new GameState();
  const cases = [[0, 'Winter'], [3, 'Spring'], [6, 'Summer'], [9, 'Autumn'], [11, 'Winter']];
  for (const [monthIndex, season] of cases) {
    gs.monthIndex = monthIndex;
    assert.equal(gs.getSeason(), season);
  }
});

test('daily focus cue reflects combined stat pressure without prescribing a destination', () => {
  const gs = new GameState();
  gs.sanity = 10; gs.money = 10;
  assert.match(gs.getDailyNudge().label, /gently/i);
  gs.sanity = 10; gs.money = 50;
  assert.match(gs.getDailyNudge().label, /room/i);
  gs.sanity = 50; gs.money = 10;
  assert.match(gs.getDailyNudge().label, /wallet/i);
  gs.sanity = 90; gs.money = 90;
  assert.match(gs.getDailyNudge().label, /No rush/i);
});

// ------------------------------------------------------------- events

test('event pool has the expected size and rarity split', () => {
  const pool = buildEventPool();
  assert.equal(pool.length, 64);
  const std = pool.filter((e) => e.rarity === Rarity.STANDARD).length;
  const helpful = pool.filter((e) => e.rarity === Rarity.RARE_HELPFUL).length;
  const hurtful = pool.filter((e) => e.rarity === Rarity.RARE_HURTFUL).length;
  assert.equal(std + helpful + hurtful, pool.length);
  assert.equal(std, 42);
  assert.equal(helpful, 14);
  assert.equal(hurtful, 8);
});

test('every event has a unique id', () => {
  const pool = buildEventPool();
  assert.equal(new Set(pool.map((e) => e.id)).size, pool.length);
});

test('every event is gated by location, tag, weather or a minimum day', () => {
  // An event with no gate at all would fire anywhere, at any time, which is
  // how a pool ends up feeling like noise. Every entry must earn its place.
  for (const e of buildEventPool()) {
    const gated = e.requiredLocation !== ''
      || e.requiredTag !== ''
      || e.requiredWeather !== ''
      || e.minimumDay > 1;
    assert.ok(gated, `${e.id} has no gate of any kind`);
  }
});

test('location-gated events still name a real playable location', () => {
  const ids = new Set(locationIds());
  for (const e of buildEventPool()) {
    if (e.requiredLocation === '') continue;
    assert.ok(ids.has(e.requiredLocation), `${e.id} points at ${e.requiredLocation}`);
  }
});

test('tag-gated events use tags that some location actually has', () => {
  const known = new Set(LOCATIONS.flatMap((l) => l.tags));
  for (const e of buildEventPool()) {
    if (!e.requiredTag) continue;
    assert.ok(known.has(e.requiredTag), `${e.id} requires unknown tag ${e.requiredTag}`);
  }
});

test('weather-gated events name a real weather type', () => {
  for (const e of buildEventPool()) {
    if (!e.requiredWeather) continue;
    assert.ok(getWeather(e.requiredWeather), `${e.id} requires unknown weather ${e.requiredWeather}`);
  }
});


test('rarity weights follow the 10 / 2 / 2 rule', () => {
  for (const e of buildEventPool()) {
    const expected = e.rarity === Rarity.STANDARD ? 10 : 2;
    assert.equal(e.weight, expected, `${e.id} weight`);
  }
});

test('no event fires before its scheduled day', () => {
  const em = new EventManager(seeded());
  em.initialize(['Geo']);
  // First scheduled day is at least 1 + MIN_EVENT_GAP_DAYS.
  const e = em.selectEvent(1, 3, 'bar', 0);
  assert.equal(e, null);
});

test('events only fire for the matching location', () => {
  const em = new EventManager(seeded());
  em.initialize(['Geo']);
  const bar = getLocation('bar');
  for (let day = 1; day <= 200; day++) {
    const e = em.selectEvent(day, day % 7, 'bar', 0, { tags: bar.tags, weatherId: 'clear' });
    if (e && e.requiredLocation !== '') assert.equal(e.requiredLocation, 'bar');
  }
});

test('tag-gated events only fire where the tag applies', () => {
  const em = new EventManager(seeded());
  em.initialize(['Geo']);
  const library = getLocation('public_library');
  for (let day = 1; day <= 300; day++) {
    const e = em.selectEvent(day, day % 7, 'public_library', 0,
      { tags: library.tags, weatherId: 'overcast' });
    if (e?.requiredTag) assert.ok(library.tags.includes(e.requiredTag), `${e.id} fired at the library`);
  }
});

test('weather-gated events never fire under the wrong sky', () => {
  const em = new EventManager(seeded());
  em.initialize(['Geo']);
  const bar = getLocation('bar');
  for (let day = 1; day <= 300; day++) {
    const e = em.selectEvent(day, day % 7, 'bar', 0, { tags: bar.tags, weatherId: 'fog' });
    if (e?.requiredWeather) assert.equal(e.requiredWeather, 'fog');
  }
});

test('burnout stays locked until the consecutive-bar threshold', () => {
  const em = new EventManager(seeded());
  em.initialize(['Geo']);
  for (let day = 1; day <= 400; day++) {
    const e = em.selectEvent(day, day % 7, 'bar', BURNOUT_THRESHOLD - 1);
    if (e) assert.notEqual(e.id, 'burnout');
  }
});

test('burnout becomes reachable at the threshold', () => {
  let seen = false;
  for (let seed = 0; seed < 40 && !seen; seed++) {
    const em = new EventManager(createRng(seed));
    em.initialize(['Geo']);
    for (let day = 1; day <= 300; day++) {
      const e = em.selectEvent(day, day % 7, 'bar', BURNOUT_THRESHOLD);
      if (e?.id === 'burnout') { seen = true; break; }
    }
  }
  assert.ok(seen, 'burnout should be selectable once the threshold is met');
});

test('the event gap always falls within 2-5 days', () => {
  const em = new EventManager(seeded());
  em.initialize(['Geo']);
  const firedOn = [];
  for (let day = 1; day <= 400; day++) {
    if (em.selectEvent(day, day % 7, 'bar', 0)) firedOn.push(day);
  }
  assert.ok(firedOn.length > 50, 'expected many events over 400 days');
  for (let i = 1; i < firedOn.length; i++) {
    const gap = firedOn[i] - firedOn[i - 1];
    assert.ok(gap >= MIN_EVENT_GAP_DAYS && gap <= MAX_EVENT_GAP_DAYS, `gap ${gap} out of range`);
  }
});

test('the same event never fires twice in a row', () => {
  const em = new EventManager(seeded());
  em.initialize(['Geo']);
  let prev = null;
  for (let day = 1; day <= 400; day++) {
    const e = em.selectEvent(day, day % 7, 'bar', 0);
    if (e) {
      assert.notEqual(e.id, prev, `event ${e.id} repeated back-to-back`);
      prev = e.id;
    }
  }
});

test('selecting an event does not mutate the shared pool', () => {
  // Guards the {friend} substitution bug present in the GDScript original.
  const em = new EventManager(seeded());
  em.initialize(['Geo', 'Susan']);
  const pristine = buildEventPool().find((e) => e.category === Category.FRIEND).description;
  for (let day = 1; day <= 400; day++) em.selectEvent(day, day % 7, 'bar', 0);
  const after = em._allEvents.find((e) => e.category === Category.FRIEND).description;
  assert.equal(after, pristine, 'friend event description was mutated in place');
});

test('the {friend} placeholder is substituted with a real character name', () => {
  const gs = new GameState();
  const names = gs.getCharacterNames();
  let sawFriendEvent = false;

  for (let seed = 0; seed < 60 && !sawFriendEvent; seed++) {
    const em = new EventManager(createRng(seed));
    em.initialize(names);
    for (let day = 1; day <= 300; day++) {
      const e = em.selectEvent(day, day % 7, 'bar', 0);
      if (e?.category === Category.FRIEND) {
        sawFriendEvent = true;
        assert.ok(!e.description.includes('{friend}'), 'placeholder left unsubstituted');
        assert.ok(
          names.some((n) => e.description.includes(n)),
          `no known character name found in: ${e.description}`,
        );
        break;
      }
    }
  }
  assert.ok(sawFriendEvent, 'expected to encounter the friend event');
});

test('reset clears the schedule and repeat guard', () => {
  const em = new EventManager(seeded());
  em.initialize(['Geo']);
  for (let day = 1; day <= 50; day++) em.selectEvent(day, day % 7, 'bar', 0);
  em.reset();
  assert.deepEqual(em._recentIds, [], 'recent-event memory is cleared');
  assert.ok(em._nextEventDay >= MIN_EVENT_GAP_DAYS);
});

// --------------------------------------------------------------- turn

test('a full turn applies action, rent and event in order', () => {
  const gs = new GameState({ seed: 4242 });
  const em = new EventManager(seeded());
  em.initialize(gs.getCharacterNames());
  for (let i = 0; i < 3; i++) gs.advanceDay();   // land on Sunday
  const before = gs.money;
  const { total } = computeDayEffects(gs, 'bar');
  const r = resolveTurn(gs, em, 'bar');
  assert.equal(r.rentCharged, RENT_AMOUNT);
  // The day's money effect, minus rent, plus any event delta.
  const expected = before + total.money - RENT_AMOUNT + (r.event?.moneyDelta ?? 0);
  assert.equal(gs.money, Math.max(expected, 0));
});

test('a turn writes exactly one history line', () => {
  const gs = new GameState();
  const em = new EventManager(seeded());
  em.initialize(gs.getCharacterNames());
  resolveTurn(gs, em, 'bar');
  assert.equal(gs.recentHistory.length, 1);
  assert.match(gs.recentHistory[0], /Worked at Le Dernier Verre/);
});

test('reported deltas match the actual stat change', () => {
  const gs = new GameState();
  const em = new EventManager(seeded());
  em.initialize(gs.getCharacterNames());
  for (let i = 0; i < 12; i++) {
    if (gs.gameOver) break;
    const before = { s: gs.sanity, m: gs.money };
    const r = resolveTurn(gs, em, i % 2 ? 'bar' : 'spiritual_community');
    assert.equal(r.sanityDelta, gs.sanity - before.s);
    assert.equal(r.moneyDelta, gs.money - before.m);
    gs.advanceDay();
  }
});

// --------------------------------------------------- simulation sanity

test('a long random playthrough never produces invalid state', () => {
  for (let seed = 0; seed < 25; seed++) {
    const rng = createRng(seed);
    const gs = new GameState();
    const em = new EventManager(rng);
    em.initialize(gs.getCharacterNames());

    for (let turn = 0; turn < 300 && !gs.gameOver; turn++) {
      resolveTurn(gs, em, rng.random() < 0.5 ? 'bar' : 'spiritual_community');
      assert.ok(gs.sanity >= 0 && gs.sanity <= MAX_STAT, `sanity ${gs.sanity} out of range`);
      assert.ok(gs.money >= 0 && gs.money <= MONEY_HARD_CEILING, `money ${gs.money} out of range`);
      assert.ok(Number.isFinite(gs.sanity) && Number.isFinite(gs.money));
      assert.ok(gs.recentHistory.length <= 5);
      if (!gs.gameOver) gs.advanceDay();
    }
  }
});

test('always alternating locations is a survivable strategy', () => {
  // Sanity check on balance: alternating should not die almost immediately.
  const gs = new GameState();
  const em = new EventManager(seeded());
  em.initialize(gs.getCharacterNames());
  let turns = 0;
  while (!gs.gameOver && turns < 100) {
    resolveTurn(gs, em, turns % 2 ? 'bar' : 'spiritual_community');
    if (!gs.gameOver) gs.advanceDay();
    turns += 1;
  }
  assert.ok(turns > 10, `alternating died after only ${turns} turns`);
});

test('only ever visiting the bar eventually breaks you', () => {
  const gs = new GameState();
  const em = new EventManager(seeded());
  em.initialize(gs.getCharacterNames());
  let turns = 0;
  while (!gs.gameOver && turns < 200) {
    resolveTurn(gs, em, 'bar');
    if (!gs.gameOver) gs.advanceDay();
    turns += 1;
  }
  assert.ok(gs.gameOver, 'bar-only play should eventually end the game');
});

test('reset restores a clean starting state', () => {
  const gs = new GameState();
  const em = new EventManager(seeded());
  em.initialize(gs.getCharacterNames());
  for (let i = 0; i < 8; i++) { resolveTurn(gs, em, 'bar'); gs.advanceDay(); }
  gs.resetGame();
  assert.equal(gs.sanity, START_SANITY);
  assert.equal(gs.money, START_MONEY);
  assert.equal(gs.journeyDay, 1);
  assert.equal(gs.gameOver, false);
  assert.equal(gs.recentHistory.length, 0);
  assert.equal(gs.getDateDisplay(), 'Thursday, January 1, 2026');
});

// ---------------------------------------------------------- characters

test('the cast has one protagonist, one arch nemesis and two rivals', () => {
  const chars = createAllProfiles();
  assert.equal(chars.length, 78);
  assert.equal(chars.filter((c) => c.role === Role.PROTAGONIST).length, 1);
  assert.equal(chars.find((c) => c.role === Role.PROTAGONIST).id, 'leon');

  const nemeses = chars.filter((c) => c.role === Role.ARCH_NEMESIS);
  assert.equal(nemeses.length, 1);
  assert.equal(nemeses[0].id, 'kaden');

  const rivals = chars.filter((c) => c.role === Role.RIVAL).map((c) => c.id).sort();
  assert.deepEqual(rivals, ['alex', 'sato']);
});

test('every character id is unique', () => {
  const ids = createAllProfiles().map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('character ids are filesystem-safe slugs', () => {
  // Names include Cyrillic, fraktur, Korean and emoji; ids must stay ASCII
  // because they map directly onto portrait filenames.
  for (const c of createAllProfiles()) {
    assert.match(c.id, /^[a-z0-9_]+$/, `${c.name} -> ${c.id}`);
  }
});

test('roleLabel covers every role in use', () => {
  for (const c of createAllProfiles()) {
    const label = roleLabel(c.role);
    assert.ok(label && label !== '', `${c.id} has no role label`);
  }
  assert.equal(roleLabel(Role.ARCH_NEMESIS), 'Arch Nemesis');
  assert.equal(roleLabel(Role.RIVAL), 'Rival');
});

test('unicode display names are preserved exactly', () => {
  const byId = Object.fromEntries(createAllProfiles().map((c) => [c.id, c.name]));
  assert.equal(byId.raul, '𝕽𝖆𝖚𝖑');
  assert.equal(byId.kopung, 'Kopung (고풍)');
  assert.equal(byId.renata, 'Renata 🦥');
  assert.equal(byId.aril_stellar, 'Aril Stellar☯');
  assert.equal(byId.siekamcebule, 'SiekamCebulę');
  assert.equal(byId.qustoge, 'Qusтoge');
});

test('every character has full biography text', () => {
  for (const c of createAllProfiles()) {
    assert.ok(c.name.length > 0, `${c.id} name`);
    assert.ok(c.bio.length > 40, `${c.id} bio too short`);
    // Léon's entry is deliberately just "Self." — he has no relationship to himself.
    const minRel = c.role === Role.PROTAGONIST ? 4 : 10;
    assert.ok(c.relationship.length >= minRel, `${c.id} relationship too short`);
    assert.ok(c.location.length > 0, `${c.id} location`);
    assert.match(c.portrait, /^assets\/portraits\/.+\.(webp|svg|png)$/, `${c.id} portrait path`);
  }
});

test('the friend-name pool excludes the protagonist', () => {
  const gs = new GameState();
  const names = gs.getCharacterNames();
  assert.equal(names.length, 77);
  assert.ok(!names.includes('Léon'));
});

test('initials fall back sensibly', () => {
  assert.equal(getInitials('Geo'), 'G');
  assert.equal(getInitials('Mary Jane'), 'MJ');
  assert.equal(getInitials(''), '?');
});

// ----------------------------------------------------------------- rng

test('a seeded rng is reproducible', () => {
  const a = createRng(999);
  const b = createRng(999);
  for (let i = 0; i < 50; i++) assert.equal(a.random(), b.random());
});

test('randInt stays within its inclusive bounds', () => {
  const rng = createRng(7);
  for (let i = 0; i < 1000; i++) {
    const v = rng.randInt(2, 5);
    assert.ok(v >= 2 && v <= 5 && Number.isInteger(v));
  }
});
