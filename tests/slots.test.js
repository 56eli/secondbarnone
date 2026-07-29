/**
 * Hub slot tests.
 *
 * The contract: the hub shows six cards. Cards 1 and 2 are the founding pair
 * and never move. Cards 3-6 rotate **through** a fixed slot and never
 * **between** slots — the third card is always somewhere quiet, the sixth is
 * always night work or an errand.
 *
 * The point of the rule is muscle memory, so the tests are written the way a
 * player would notice it breaking: play a run, watch one position, and assert
 * that what appears there always came from the same set.
 *
 * The DOM half boots the real page in jsdom and reads the actual buttons.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  LOCATIONS,
  HUB_SLOTS,
  HUB_FIXED_CHOICES,
  CORE_LOCATION_IDS,
  WELCOME_SLOT,
  WELCOME_SLOT_INDEX,
  WELCOME_LOCATION_ID,
  locationsInSlot,
  locationForSlot,
  dailySlotLineup,
  slotToIndex,
  indexToSlot,
  evaluateUnlock,
  getLocation,
} from '../docs/js/data/locations.js';
import { GameState } from '../docs/js/core/game-state.js';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const DOCS = join(ROOT, 'docs');

let JSDOM;
try {
  ({ JSDOM } = await import('jsdom'));
} catch {
  console.log('# jsdom not installed — skipping slot DOM tests (npm i -D jsdom)');
}
const maybe = JSDOM ? test : test.skip;

const snapshot = (gs) => ({
  journeyDay: gs.journeyDay,
  reputation: gs.reputation,
  weekday: gs.getWeekdayIndex(),
  perks: gs.perks,
  closedTags: gs.getClosedTags(),
});

// ================================================== the assignment itself

test('the hub has four rotating slots, numbered 3 to 6', () => {
  assert.deepEqual([...HUB_SLOTS], [3, 4, 5, 6]);
  assert.equal(HUB_FIXED_CHOICES, 2, 'the founding pair holds slots 1 and 2');
});

test('slot and index conversions are inverses', () => {
  for (const slot of HUB_SLOTS) assert.equal(indexToSlot(slotToIndex(slot)), slot);
  for (let i = 0; i < 6; i += 1) assert.equal(slotToIndex(indexToSlot(i)), i);
});

test('the founding pair own no rotating slot', () => {
  for (const id of CORE_LOCATION_IDS) {
    assert.equal(getLocation(id).slot, null, `${id} should not rotate`);
  }
});

test('every other location is permanently assigned to exactly one slot', () => {
  const rotating = LOCATIONS.filter((l) => !CORE_LOCATION_IDS.includes(l.id));
  for (const l of rotating) {
    assert.ok(HUB_SLOTS.includes(l.slot), `${l.id} has slot ${l.slot}`);
  }
  const placed = HUB_SLOTS.flatMap((s) => locationsInSlot(s));
  assert.equal(placed.length, rotating.length, 'every rotating location is placed');
  assert.equal(new Set(placed.map((l) => l.id)).size, placed.length, 'and placed once');
});

test('the slots carry roughly the same number of locations', () => {
  const counts = HUB_SLOTS.map((s) => locationsInSlot(s).length);
  const lowest = Math.min(...counts);
  const highest = Math.max(...counts);
  assert.ok(lowest >= 4, `a slot has only ${lowest} locations to rotate through`);
  assert.ok(
    highest - lowest <= 1,
    `slot sizes are ${counts.join('/')} — the spread should be at most one`,
  );
});

test('each slot has a coherent character', () => {
  // The whole point of a fixed slot is that the position means something. If
  // slot 3 were a random quarter of the city, the rule would buy nothing.
  const themeOf = (slot) => {
    const places = locationsInSlot(slot);
    return {
      restful: places.filter((l) => l.effects.energy > 0 || l.tags.includes('quiet')).length,
      earning: places.filter((l) => l.effects.money > 0).length,
      total: places.length,
    };
  };

  // Slot 3 is the quiet, restorative corner.
  const three = themeOf(3);
  assert.ok(three.restful * 2 >= three.total, 'slot 3 should read as the quiet one');

  // Slots 5 and 6 are where the money is.
  for (const slot of [5, 6]) {
    const t = themeOf(slot);
    assert.ok(t.earning * 2 >= t.total, `slot ${slot} should read as paid work`);
  }
});

test('every slot can be filled from day one', () => {
  // A slot whose locations are all late-game would show a locked card for
  // weeks. Each needs at least one early option.
  for (const slot of HUB_SLOTS) {
    const earliest = Math.min(...locationsInSlot(slot).map((l) => l.unlock.minDay));
    assert.ok(earliest <= 12, `slot ${slot} opens nothing until day ${earliest}`);
  }
});

// ================================================== rotation, not shuffling

test('a location only ever appears in its own slot', () => {
  const gs = new GameState({ seed: 4242 });
  const seenIn = new Map();

  for (let day = 1; day <= 300; day += 1) {
    gs.journeyDay = day;
    gs.reputation = Math.min(100, day);
    const lineup = dailySlotLineup(snapshot(gs), gs.weatherSeed);
    lineup.forEach((location, offset) => {
      if (!location) return;
      const slot = HUB_SLOTS[offset];
      if (!seenIn.has(location.id)) seenIn.set(location.id, new Set());
      seenIn.get(location.id).add(slot);
    });
  }

  for (const [id, slots] of seenIn) {
    assert.equal(slots.size, 1, `${id} appeared in slots ${[...slots].join(' and ')}`);
    assert.equal([...slots][0], getLocation(id).slot, `${id} appeared outside its own slot`);
  }
});

test('slots do rotate — a slot is not a permanent single location', () => {
  // The other failure mode: a "fixed" slot that never changes is just a
  // sixth fixed card, and the run stops opening up.
  const gs = new GameState({ seed: 99 });
  gs.reputation = 100;
  const perSlot = new Map(HUB_SLOTS.map((s) => [s, new Set()]));

  for (let day = 25; day <= 200; day += 1) {
    gs.journeyDay = day;
    dailySlotLineup(snapshot(gs), gs.weatherSeed).forEach((location, offset) => {
      if (location) perSlot.get(HUB_SLOTS[offset]).add(location.id);
    });
  }

  for (const [slot, ids] of perSlot) {
    assert.ok(ids.size >= 3, `slot ${slot} only ever showed ${ids.size} place(s)`);
  }
});

test('the lineup is stable for a given day, seed and state', () => {
  // The hub rerenders on every stat change; the board must not reshuffle
  // under the player's hand, and a reloaded save must show the same day.
  const gs = new GameState({ seed: 7 });
  gs.journeyDay = 30;
  gs.reputation = 60;
  const first = dailySlotLineup(snapshot(gs), gs.weatherSeed).map((l) => l?.id);
  for (let i = 0; i < 5; i += 1) {
    assert.deepEqual(
      dailySlotLineup(snapshot(gs), gs.weatherSeed).map((l) => l?.id),
      first,
    );
  }
});

test('different days and different runs produce different boards', () => {
  const gs = new GameState({ seed: 7 });
  gs.journeyDay = 30;
  gs.reputation = 60;
  const base = dailySlotLineup(snapshot(gs), gs.weatherSeed).map((l) => l?.id);

  gs.journeyDay = 31;
  const nextDay = dailySlotLineup(snapshot(gs), gs.weatherSeed).map((l) => l?.id);
  assert.notDeepEqual(nextDay, base, 'the board should move day to day');

  gs.journeyDay = 30;
  const otherRun = dailySlotLineup(snapshot(gs), gs.weatherSeed + 1).map((l) => l?.id);
  assert.notDeepEqual(otherRun, base, 'a different run should differ');
});

test('the lineup always offers one location per slot', () => {
  const gs = new GameState({ seed: 11 });
  for (let day = 1; day <= 120; day += 1) {
    gs.journeyDay = day;
    gs.reputation = Math.min(100, day * 0.8);
    const lineup = dailySlotLineup(snapshot(gs), gs.weatherSeed);
    assert.equal(lineup.length, HUB_SLOTS.length);
    for (const location of lineup) assert.ok(location, `a slot was empty on day ${day}`);
  }
});

test('the six hub cards reveal every location, including locked future places', () => {
  const gs = new GameState({ seed: 5 });
  const seen = new Set(['spiritual_community', 'bar']);
  // The largest slot has six places, but use two weeks to make the discovery
  // promise legible and robust to the day-one welcome override.
  for (let day = 1; day <= 14; day += 1) {
    gs.journeyDay = day;
    for (const location of dailySlotLineup(snapshot(gs), gs.weatherSeed)) seen.add(location.id);
  }
  assert.deepEqual(seen, new Set(LOCATIONS.map((location) => location.id)));

  const mines = getLocation('temple_ruins');
  const locked = locationForSlot(4, { journeyDay: 1, reputation: 0, weekday: 3 }, gs.weatherSeed);
  assert.ok(locked, 'slot four always still has a reveal card');
  assert.equal(
    evaluateUnlock(mines, { journeyDay: 12, reputation: 0, weekday: 0 }).unlocked,
    false,
    'the hub must be able to show a place before its reputation gate opens',
  );
});

test('a slot with no locations at all yields null rather than throwing', () => {
  assert.equal(locationForSlot(99, { journeyDay: 1, reputation: 0, weekday: 0 }, 0), null);
});

// ============================================ the day-one welcome, still

test('the welcome location owns the slot it is pinned to', () => {
  assert.equal(WELCOME_SLOT, indexToSlot(WELCOME_SLOT_INDEX));
  assert.equal(
    getLocation(WELCOME_LOCATION_ID).slot,
    WELCOME_SLOT,
    'the chapel must live in the slot it is pinned to, or day two would move it',
  );
});

test('day one pins the welcome into its slot, and day two lets it rotate', () => {
  const gs = new GameState({ seed: 20260101 });
  // Pick a seed whose day one is not stormy, since a storm shuts the woods.
  assert.ok(!gs.getClosedTags().includes('outdoor'), 'seed should open on calm weather');

  const dayOne = dailySlotLineup(snapshot(gs), gs.weatherSeed);
  assert.equal(dayOne[WELCOME_SLOT_INDEX - HUB_FIXED_CHOICES].id, WELCOME_LOCATION_ID);

  gs.journeyDay = 2;
  const dayTwo = dailySlotLineup(snapshot(gs), gs.weatherSeed);
  assert.notEqual(
    dayTwo[WELCOME_SLOT_INDEX - HUB_FIXED_CHOICES].id,
    WELCOME_LOCATION_ID,
    'the chapel goes back behind its ordinary gate on day two',
  );
});

// ==================================================================== DOM

/** Minimal in-memory localStorage stand-in. */
function fakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => {
      map.set(k, String(v));
    },
    removeItem: (k) => {
      map.delete(k);
    },
  };
}

async function boot(opts = {}) {
  const html = readFileSync(join(DOCS, 'index.html'), 'utf8');
  const dom = new JSDOM(html, {
    url: pathToFileURL(join(DOCS, 'index.html')).href,
    pretendToBeVisual: true,
  });
  const { window } = dom;
  global.window = window;
  global.document = window.document;
  global.HTMLElement = window.HTMLElement;
  global.requestAnimationFrame =
    window.requestAnimationFrame?.bind(window) ?? ((cb) => setTimeout(cb, 0));
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  });

  const { initGame } = await import(pathToFileURL(join(DOCS, 'js', 'app.js')).href);
  window.__game = initGame({
    seed: opts.seed ?? 12345,
    storage: fakeStorage(),
    autoload: false,
    fadeMs: 0,
    toastMs: 50,
  });
  return window;
}

function cleanup(window) {
  try {
    window?.close();
  } catch {
    /* already closed */
  }
  delete global.window;
  delete global.document;
  delete global.HTMLElement;
  delete global.requestAnimationFrame;
}

const cards = (doc) => [...doc.querySelectorAll('.choices button')];

maybe('the hub renders six cards, each tagged with its slot', async () => {
  const window = await boot();
  try {
    const shown = cards(window.document);
    assert.equal(shown.length, 6);
    assert.deepEqual(
      shown.map((c) => c.dataset.slot),
      ['1', '2', '3', '4', '5', '6'],
    );
  } finally {
    cleanup(window);
  }
});

maybe('the founding pair hold cards one and two', async () => {
  const window = await boot();
  try {
    const shown = cards(window.document);
    assert.equal(shown[0].dataset.location, 'spiritual_community');
    assert.equal(shown[1].dataset.location, 'bar');
  } finally {
    cleanup(window);
  }
});

maybe('a card\u2019s slot attribute matches its location\u2019s declared slot', async () => {
  const window = await boot();
  try {
    for (const card of cards(window.document)) {
      const location = getLocation(card.dataset.location);
      assert.ok(location, `card has unknown location ${card.dataset.location}`);
      const expected = location.slot ?? indexToSlot([...cards(window.document)].indexOf(card));
      if (location.slot !== null) {
        assert.equal(
          card.dataset.slot,
          String(expected),
          `${location.id} rendered in slot ${card.dataset.slot}`,
        );
      }
    }
  } finally {
    cleanup(window);
  }
});

maybe('positions hold across a played run — card four is always slot four', async () => {
  const window = await boot({ seed: 555 });
  try {
    const { gs, api } = window.__game;
    const doc = window.document;
    const seenAtPosition = new Map(HUB_SLOTS.map((s) => [s, new Set()]));

    for (let day = 1; day <= 40; day += 1) {
      gs.journeyDay = day;
      gs.reputation = Math.min(100, 10 + day * 2);
      api.goto.hub();
      const shown = cards(doc);
      assert.equal(shown.length, 6, `day ${day} did not render six cards`);
      for (let index = HUB_FIXED_CHOICES; index < 6; index += 1) {
        const slot = indexToSlot(index);
        assert.equal(
          shown[index].dataset.slot,
          String(slot),
          `card ${index + 1} claimed slot ${shown[index].dataset.slot} on day ${day}`,
        );
        seenAtPosition.get(slot).add(shown[index].dataset.location);
      }
    }

    // Everything that ever appeared at a position belongs to that slot.
    for (const [slot, ids] of seenAtPosition) {
      for (const id of ids) {
        assert.equal(
          getLocation(id).slot,
          slot,
          `${id} appeared at position ${slot} but belongs to slot ${getLocation(id).slot}`,
        );
      }
      assert.ok(ids.size >= 2, `position ${slot} never rotated across forty days`);
    }
  } finally {
    cleanup(window);
  }
});

maybe('the hub does not reshuffle when it rerenders', async () => {
  const window = await boot({ seed: 31 });
  try {
    const { api } = window.__game;
    const doc = window.document;
    const read = () => cards(doc).map((c) => c.dataset.location);
    const first = read();
    for (let i = 0; i < 4; i += 1) {
      api.goto.hub();
      assert.deepEqual(read(), first, 'the board moved without the day changing');
    }
  } finally {
    cleanup(window);
  }
});

maybe('day one still pins Brian to card four', async () => {
  const window = await boot();
  try {
    const shown = cards(window.document);
    const fourth = shown[WELCOME_SLOT_INDEX];
    assert.equal(fourth.dataset.slot, String(WELCOME_SLOT));
    assert.equal(fourth.dataset.location, WELCOME_LOCATION_ID);
    assert.equal(shown.filter((c) => c.dataset.location === WELCOME_LOCATION_ID).length, 1);
  } finally {
    cleanup(window);
  }
});
