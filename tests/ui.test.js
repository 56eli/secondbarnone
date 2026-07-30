/**
 * DOM tests for the six-card hub, practice tree, almanac, toasts,
 * calmer HUD and autosave.
 *
 * Boots the real index.html in jsdom and drives real buttons, same as
 * dom.test.js. jsdom is an optional dev dependency, so these skip rather than
 * fail on a bare checkout.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { LOCATIONS, WELCOME_SLOT_INDEX, locationForSlot } from '../docs/js/data/locations.js';
import { weatherForDay } from '../docs/js/data/weather.js';
import { ACHIEVEMENTS } from '../docs/js/data/achievements.js';
import { PERKS } from '../docs/js/data/perks.js';
import { SAVE_KEY, START_WEEKDAY_OFFSET } from '../docs/js/core/game-state.js';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const DOCS = join(ROOT, 'docs');

let JSDOM;
try {
  ({ JSDOM } = await import('jsdom'));
} catch {
  console.log('# jsdom not installed — skipping UI tests (npm i -D jsdom)');
}

const maybe = JSDOM ? test : test.skip;

/** Minimal in-memory localStorage stand-in. */
function fakeStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => {
      map.set(k, String(v));
    },
    removeItem: (k) => {
      map.delete(k);
    },
    _map: map,
  };
}

/**
 * Boot index.html in jsdom and start a game against it.
 * @param {{reducedMotion?:boolean, seed?:number, storage?:object, autoload?:boolean}} [opts]
 */
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
    matches: Boolean(opts.reducedMotion) && query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener() {},
    removeEventListener() {},
  });

  const { initGame } = await import(pathToFileURL(join(DOCS, 'js', 'app.js')).href);
  window.__game = initGame({
    seed: opts.seed ?? 12345,
    storage: 'storage' in opts ? opts.storage : fakeStorage(),
    autoload: opts.autoload,
    fadeMs: opts.fadeMs ?? 0,
    toastMs: opts.toastMs ?? 50,
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

/** Advance past the swap microtask/cross-dissolve (0ms budget in test) plus slack. */
const settle = () => new Promise((r) => setTimeout(r, 10));

/** Click a compact hub-tool button by its visible text. */
function nav(doc, label) {
  const button = [...doc.querySelectorAll('.hub-tools button')].find((b) =>
    b.textContent.includes(label),
  );
  assert.ok(button, `no hub-nav button matching "${label}"`);
  button.click();
}

/** Click a button anywhere on the current screen by its visible text. */
function click(doc, selector, label) {
  const button = [...doc.querySelectorAll(selector)].find((b) => b.textContent.includes(label));
  assert.ok(button, `no ${selector} matching "${label}"`);
  button.click();
  return button;
}

/** Play one full day at a hub location and dismiss the modal. */
async function playDay(doc, label = 'Le Dernier Verre') {
  click(doc, '.choice', label);
  await settle();
  // Location screen: the primary button is the "do the thing" action.
  doc.querySelector('.btn-primary').click();
  await settle();
  // After the action resolves, the result modal appears; its primary button
  // is "Continue →" which advances the day. Click it once.
  const cont = doc.querySelector('.modal .btn-primary');
  if (cont) {
    cont.click();
    await settle();
  }
}

// ==================================================================== HUD

maybe('the HUD shows four gauges, insight and today’s weather', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    assert.match(doc.getElementById('sanity-num').textContent, /50%/);
    assert.match(doc.getElementById('money-num').textContent, /^50$/);
    assert.match(doc.getElementById('energy-num').textContent, /100%/);
    assert.match(doc.getElementById('rep-num').textContent, /10%/);
    // Léon is always present in the HUD
    assert.equal(doc.getElementById('hud-name').textContent.trim(), 'Léon');
    assert.ok(doc.getElementById('hud-portrait').getAttribute('src').includes('leon'));
    assert.match(doc.getElementById('insight-num').textContent, /🔮 0/);

    const weather = doc.getElementById('hud-weather').textContent;
    assert.ok(weather.length > 2, 'weather badge should be filled in');
    assert.equal(
      weather,
      `${window.__game.gs.getWeather().emoji} ${window.__game.gs.getWeather().name}`,
    );
  } finally {
    cleanup(window);
  }
});

maybe('the settings cog is present and opens a real settings screen', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    const cog = doc.getElementById('settings-button');
    assert.ok(cog, 'persistent HUD cog');
    assert.match(cog.getAttribute('aria-label'), /settings/i);
    cog.click();
    await settle();
    assert.ok(doc.querySelector('.settings-screen'));
  } finally {
    cleanup(window);
  }
});

maybe('the settings screen offers a copyable share-this-seed link', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    doc.getElementById('settings-button').click();
    await settle();
    const input = doc.querySelector('.settings-screen .share-url');
    assert.ok(input, 'share link input');
    const url = new URL(input.value);
    assert.equal(
      url.searchParams.get('seed'),
      String(window.__game.gs.weatherSeed),
      'the link carries this run’s seed',
    );
  } finally {
    cleanup(window);
  }
});

maybe('the energy bar flags exhaustion', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    const { gs } = window.__game;
    assert.equal(doc.getElementById('energy-bar').classList.contains('low'), false);

    gs.energy = 5;
    gs.emit('stats_changed');
    assert.equal(doc.getElementById('energy-bar').classList.contains('low'), true);
    assert.equal(doc.getElementById('energy-bar').style.width, '5%');
  } finally {
    cleanup(window);
  }
});

// ==================================================================== hub

maybe('the hub shows the weather line and 6 location choices in total', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    assert.ok(doc.querySelector('.weather-badge'), 'weather badge');
    assert.equal(doc.querySelectorAll('.choices button').length, 6);
    assert.equal(doc.querySelectorAll('.hub-tools button').length, 3);
  } finally {
    cleanup(window);
  }
});

maybe('the hub has no deprecated City navigation escape hatch', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    assert.equal(window.__game.api.goto.map, undefined);
    assert.equal(
      [...doc.querySelectorAll('button')].some((button) => /City|Map/.test(button.textContent)),
      false,
    );
  } finally {
    cleanup(window);
  }
});

maybe('the hub shows exactly 6 unique location cards including the two core ones', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    const buttons = doc.querySelectorAll('.choices button');
    assert.equal(buttons.length, 6);

    const textContent = [...buttons].map((b) => b.textContent);
    assert.ok(textContent.some((t) => t.includes('La Maison Calme')));
    assert.ok(textContent.some((t) => t.includes('Le Dernier Verre')));
  } finally {
    cleanup(window);
  }
});

maybe('all locations are revealed through the six main hub buttons within a cycle', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    const { gs, api } = window.__game;
    const seen = new Set();
    for (let day = 1; day <= 14; day += 1) {
      gs.journeyDay = day;
      api.goto.hub();
      const buttons = [...doc.querySelectorAll('.choices button')];
      assert.equal(buttons.length, 6, `day ${day} must keep the 2×3 hub`);
      for (const button of buttons) seen.add(button.dataset.location);
    }
    assert.equal(
      seen.size,
      LOCATIONS.length,
      `missing: ${LOCATIONS.filter((l) => !seen.has(l.id)).map((l) => l.id)}`,
    );
  } finally {
    cleanup(window);
  }
});

maybe('locked rotating locations are disabled and explain themselves on the hub', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    const locked = doc.querySelectorAll('.choices .locked');
    assert.ok(locked.length > 0, 'some selected locations should be locked on Day 1');
    for (const card of locked) {
      assert.equal(card.disabled, true);
      assert.ok(
        card.querySelector('.choice-action').textContent.includes('Locked:'),
        'must say why it is locked',
      );
    }
  } finally {
    cleanup(window);
  }
});

maybe('clicking a locked card on the hub does nothing at all', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    const { gs } = window.__game;
    const locked = doc.querySelector('.choices .locked');
    if (locked) {
      const before = gs.journeyDay;
      locked.click();
      await settle();
      assert.ok(doc.querySelector('.hub'), 'still on the hub');
      assert.equal(gs.journeyDay, before);
    }
  } finally {
    cleanup(window);
  }
});

maybe('rotating selections on the hub change deterministically with the day and seed', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    const { gs, api } = window.__game;

    const getVisibleIds = () =>
      [...doc.querySelectorAll('.choices button')].map((b) => b.dataset.location || b.textContent);

    const day1Visible = getVisibleIds();

    // Advance to day 2
    gs.journeyDay = 2;
    api.goto.hub();
    await settle();
    const day2Visible = getVisibleIds();

    // The selection should rotate/change on Day 2!
    assert.notDeepEqual(day1Visible, day2Visible, 'location choices should rotate on a new day');
  } finally {
    cleanup(window);
  }
});

maybe('visited locations are marked on the hub', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    const { gs, api } = window.__game;

    // Find a location that is currently visible on the hub (e.g. home_loft)
    const card = [...doc.querySelectorAll('.choices button')].find(
      (b) => b.dataset.location === 'home_loft',
    );

    if (card) {
      assert.equal(card.classList.contains('visited'), false);
      gs.visitedLocations.add('home_loft');
      api.goto.hub();
      await settle();
      const updatedCard = [...doc.querySelectorAll('.choices button')].find(
        (b) => b.dataset.location === 'home_loft',
      );
      assert.equal(updatedCard.classList.contains('visited'), true);
    }
  } finally {
    cleanup(window);
  }
});

maybe('a location can be entered and played directly from the hub rotating choices', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    const { gs } = window.__game;

    // Click on the first unlocked other location choice on the hub
    const card = [...doc.querySelectorAll('.choices button:not([disabled])')].find(
      (b) => b.dataset.location === 'home_loft',
    );

    if (card) {
      card.click();
      await settle();
      assert.ok(doc.querySelector('.location'));
      assert.match(doc.querySelector('.screen-title').textContent, /Home Loft/);

      const before = gs.energy;
      doc.querySelector('.btn-primary').click();
      await settle();
      assert.ok(gs.energy >= before, 'resting should not drain you');
      assert.ok(doc.querySelector('.modal-backdrop'));
    }
  } finally {
    cleanup(window);
  }
});

maybe('hub choices preview the day as effect chips', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    const chips = doc.querySelectorAll('.choice .chip');
    assert.ok(chips.length >= 4, 'locations should show their numbers');
    for (const chip of chips) assert.ok(chip.textContent.trim().length > 0);
  } finally {
    cleanup(window);
  }
});

maybe('the festival banner appears only on a festival day', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    // Day one is 1 January — the New Year Vigil.
    assert.ok(doc.querySelector('.festival-banner'), 'day one is a festival');
    assert.match(doc.querySelector('.festival-banner').textContent, /Vigil/);

    const { gs, api } = window.__game;
    gs.dayOfMonth = 6;
    api.goto.hub();
    assert.equal(doc.querySelector('.festival-banner'), null, 'no festival on the 6th');
  } finally {
    cleanup(window);
  }
});

// =============================================================== location

maybe('a location previews the exact day it is offering', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    click(doc, '.choice', 'Le Dernier Verre');
    await settle();

    const preview = doc.querySelector('.preview');
    assert.ok(preview, 'preview block');
    assert.ok(preview.querySelectorAll('.chip').length > 0);
  } finally {
    cleanup(window);
  }
});

maybe('meeting a host shows character-specific small talk instead of their biography', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    click(doc, '.choice', 'Le Dernier Verre');
    await settle();
    const talk = doc.querySelector('.small-talk');
    assert.ok(talk, 'hosts should greet Léon at a location');
    assert.match(talk.textContent, /Apron|stool|lemons/, 'Barret speaks in his own voice');
    assert.equal(
      doc.querySelector('.host-rel'),
      null,
      'relationship description stays on the People screen',
    );
  } finally {
    cleanup(window);
  }
});

maybe('the hub keeps weather visible and gives one gentle focus cue', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    assert.ok(doc.querySelector('.weather-badge'));
    assert.ok(doc.querySelector('.daily-nudge'));
    assert.ok(doc.querySelectorAll('.choice-primary').length >= 2, 'the daily choices stand out');
  } finally {
    cleanup(window);
  }
});

// ================================================= the day-one welcome

maybe('day one pins the House of Middleway to the fourth card — row 2, column 1', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    const cards = [...doc.querySelectorAll('.choices button')];
    assert.equal(cards.length, 6, 'the hub still offers six choices');

    const fourth = cards[WELCOME_SLOT_INDEX];
    assert.equal(
      fourth.dataset.location,
      'house_of_middleway',
      'the fourth card is Brian’s chapel on day one',
    );

    // Index 3 of a 3-wide grid is row two, column one.
    assert.equal(Math.floor(WELCOME_SLOT_INDEX / 3) + 1, 2);
    assert.equal((WELCOME_SLOT_INDEX % 3) + 1, 1);

    // It must be the only copy on the board — the splice removes duplicates.
    const copies = cards.filter((c) => c.dataset.location === 'house_of_middleway');
    assert.equal(copies.length, 1, 'the chapel appears exactly once');
  } finally {
    cleanup(window);
  }
});

maybe('the pinned welcome is playable immediately, not locked', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    const card = [...doc.querySelectorAll('.choices button')].find(
      (b) => b.dataset.location === 'house_of_middleway',
    );

    assert.ok(card, 'the chapel is on the hub');
    assert.equal(card.disabled, false, 'day one must not lock Brian away');
    assert.equal(card.classList.contains('locked'), false);
    assert.ok(card.textContent.includes('Sit With Brian'), 'it offers its real action');
    assert.ok(card.querySelectorAll('.chip').length > 0, 'and previews its numbers');
  } finally {
    cleanup(window);
  }
});

maybe('the pinned welcome says Brian is expecting Léon', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    const card = [...doc.querySelectorAll('.choices button')].find(
      (b) => b.dataset.location === 'house_of_middleway',
    );
    assert.ok(card.classList.contains('welcome'), 'the card is badged as a welcome');
    assert.equal(card.dataset.welcome, 'true');
    const badge = card.querySelector('.choice-welcome');
    assert.ok(badge, 'the welcome names who is waiting');
    assert.match(badge.textContent, /Brian/);
  } finally {
    cleanup(window);
  }
});

maybe('Léon can meet Brian on day one — entering and playing the chapel', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    const { gs } = window.__game;
    assert.equal(gs.journeyDay, 1, 'this is the first day of the run');

    [...doc.querySelectorAll('.choices button')]
      .find((b) => b.dataset.location === 'house_of_middleway')
      .click();
    await settle();

    // Brian himself is here, in his own voice.
    assert.ok(doc.querySelector('.location'), 'we are at a location');
    assert.match(doc.querySelector('.screen-title').textContent, /House of Middleway/);
    assert.match(doc.querySelector('.host-name-lg').textContent, /Brian/);
    assert.ok(doc.querySelector('.small-talk'), 'Brian greets Léon');

    const beforeSanity = gs.sanity;
    doc.querySelector('.btn-primary').click();
    await settle();

    assert.ok(gs.sanity > beforeSanity, 'a day with Brian restores sanity');
    assert.ok(gs.visitedLocations.has('house_of_middleway'), 'the visit is recorded');
    assert.ok(doc.querySelector('.modal-backdrop'), 'the day resolves into a result');
  } finally {
    cleanup(window);
  }
});

maybe('the welcome is gone from the hub on day two', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    const { gs, api } = window.__game;

    gs.journeyDay = 2;
    api.goto.hub();
    await settle();

    const cards = [...doc.querySelectorAll('.choices button')];
    const chapel = cards.find((b) => b.dataset.location === 'house_of_middleway');
    // It may still be drawn as a locked filler card, but never as a playable
    // one, and never with the welcome badge.
    if (chapel) {
      assert.equal(chapel.disabled, true, 'day two puts the chapel back behind its gate');
      assert.equal(chapel.classList.contains('welcome'), false);
      assert.equal(chapel.querySelector('.choice-welcome'), null);
    }
    assert.equal(doc.querySelector('.choice.welcome'), null, 'no welcome badge after day one');
  } finally {
    cleanup(window);
  }
});

maybe('the day-one welcome never displaces the two founding locations', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    const cards = [...doc.querySelectorAll('.choices button')];
    assert.equal(cards[0].textContent.includes('La Maison Calme'), true, 'card 1 is the community');
    assert.equal(cards[1].textContent.includes('Le Dernier Verre'), true, 'card 2 is the bar');
    for (const c of [cards[0], cards[1]]) assert.equal(c.disabled, false);
  } finally {
    cleanup(window);
  }
});

maybe('Brian’s day-one invitation overrides a storm as well as progress gates', async () => {
  // This is the one explicit exception to normal weather closures. Brian's
  // opening invitation must be playable on every seed, including storm seed 13.
  const window = await boot({ seed: 13 });
  try {
    const doc = window.document;
    const { gs } = window.__game;
    assert.equal(gs.getWeather().id, 'storm', 'seed 13 should open on a storm');

    const chapel = [...doc.querySelectorAll('.choices button')].find(
      (b) => b.dataset.location === 'house_of_middleway',
    );
    assert.ok(chapel, 'the invitation occupies its fourth hub card');
    assert.equal(chapel.disabled, false, 'Brian’s invitation bypasses the storm closure');
    assert.equal(chapel.classList.contains('welcome'), true);
    assert.match(chapel.textContent, /Brian is expecting you/);
  } finally {
    cleanup(window);
  }
});

maybe('the welcome is pinned for every seed, not just the lucky ones', async () => {
  // The other four cards are a seeded shuffle; the invitation must not be.
  for (const seed of [1, 7, 12345, 90210, 777777]) {
    const window = await boot({ seed });
    try {
      const doc = window.document;
      const cards = [...doc.querySelectorAll('.choices button')];
      const fourth = cards[WELCOME_SLOT_INDEX];
      assert.equal(
        fourth.dataset.location,
        'house_of_middleway',
        `seed ${seed}: the invitation must hold slot four under every sky`,
      );
      assert.equal(fourth.disabled, false, `seed ${seed}: and be playable`);
    } finally {
      cleanup(window);
    }
  }
});

maybe('the preview explains what adjusted the numbers', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    const { gs, api } = window.__game;
    gs.perks.add('steady_breath');
    api.goto.location('bar');

    const why = doc.querySelector('.preview-why');
    assert.ok(why, 'a modified day should say so');
    assert.match(why.textContent, /Perks/);
  } finally {
    cleanup(window);
  }
});

maybe('the letting office takes rent a week early', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    const { gs, api } = window.__game;
    gs.journeyDay = 6;
    gs.money = 90;

    api.goto.location('landlord_office');
    click(doc, '.special button', 'Pay a week ahead');
    await settle();

    assert.equal(gs.money, 72);
    assert.ok(gs.rentPrepaidUntilDay > gs.journeyDay);

    // Revisiting now reports the cover.
    api.goto.location('landlord_office');
    assert.match(doc.querySelector('.special').textContent, /paid up to/i);
  } finally {
    cleanup(window);
  }
});

maybe('the letting office button is disabled when you cannot afford it', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    const { gs, api } = window.__game;
    gs.journeyDay = 6;
    gs.money = 2;
    api.goto.location('landlord_office');
    const button = [...doc.querySelectorAll('.special button')].find((b) =>
      b.textContent.includes('Pay a week ahead'),
    );
    assert.equal(button.disabled, true);
  } finally {
    cleanup(window);
  }
});

maybe('the flavour-only specials render without a button', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    const { gs, api } = window.__game;
    gs.journeyDay = 30;
    gs.reputation = 100;

    api.goto.location('mountain_retreat');
    assert.match(doc.querySelector('.special-note').textContent, /Three days/);

    api.goto.location('farmers_market');
    assert.equal(
      doc.querySelector('.special-note'),
      null,
      'market has no retired inventory prompt',
    );
  } finally {
    cleanup(window);
  }
});

// ============================================================ retired inventory

// ================================================================ practice

maybe('the practice tree lists every perk with its cost', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    nav(doc, 'Practice');
    await settle();

    assert.equal(doc.querySelectorAll('.perk-row').length, PERKS.length);
    assert.ok(
      doc.querySelectorAll('.perk-row.blocked').length > 0,
      'with no insight, everything should be out of reach',
    );
  } finally {
    cleanup(window);
  }
});

maybe('a perk can be bought once there is insight for it', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    const { gs, api } = window.__game;
    gs.insight = 20;
    api.goto.perks();

    const buyable = [...doc.querySelectorAll('.perk-row button')].filter((b) => !b.disabled);
    assert.ok(buyable.length > 0, 'something should be affordable with 20 insight');
    buyable[0].click();
    await settle();

    assert.equal(gs.perks.size, 1);
    assert.ok(gs.insight < 20, 'insight should have been spent');
    assert.ok(doc.querySelector('.perk-row.owned'), 'the perk should now read as learned');
    assert.match(doc.querySelector('.perk-owned').textContent, /learned/);
  } finally {
    cleanup(window);
  }
});

maybe('a blocked perk explains itself through its title attribute', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    const { gs, api } = window.__game;
    gs.insight = 200;
    api.goto.perks();

    const blocked = [...doc.querySelectorAll('.perk-row')].find((row) =>
      row.classList.contains('blocked'),
    );
    assert.ok(blocked, 'the deeper tree should still be gated by prerequisites');
    assert.ok(blocked.querySelector('button').getAttribute('title').length > 0);
  } finally {
    cleanup(window);
  }
});

// ================================================================ almanac

maybe('the almanac forecasts ahead and matches the model', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    const { gs } = window.__game;
    nav(doc, 'Weather');
    await settle();

    const cards = doc.querySelectorAll('.fc');
    assert.equal(cards.length, 4);
    assert.match(cards[0].textContent, /Today/);
    assert.match(cards[0].textContent, new RegExp(gs.getWeather().name));
    assert.ok(cards[0].classList.contains('today'));
    assert.match(cards[1].textContent, /Day 2/);
  } finally {
    cleanup(window);
  }
});

maybe('the almanac lists upcoming festivals and every achievement', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    const { gs, api } = window.__game;
    api.goto.almanac();

    assert.equal(doc.querySelectorAll('.fest-list li').length, 3);
    assert.equal(doc.querySelectorAll('.ach').length, ACHIEVEMENTS.length);
    assert.equal(doc.querySelectorAll('.ach.earned').length, 0);

    gs.achievements.add('first_week');
    api.goto.almanac();
    assert.equal(doc.querySelectorAll('.ach.earned').length, 1);
  } finally {
    cleanup(window);
  }
});

maybe('the forecast warns when weather will close places', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    const { gs, api } = window.__game;

    // Walk forward until a storm or snow appears in the four-day window.
    let found = false;
    for (let day = 1; day <= 400 && !found; day++) {
      gs.journeyDay = day;
      api.goto.almanac();
      found = doc.querySelectorAll('.fc-closes').length > 0;
    }
    assert.ok(found, 'closing weather should show up within a year of forecasts');
  } finally {
    cleanup(window);
  }
});

// ============================================================ result modal

maybe('the modal reports weather, deltas and running totals', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    click(doc, '.choice', 'Le Dernier Verre');
    await settle();
    doc.querySelector('.btn-primary').click();
    await settle();

    const modal = doc.querySelector('.modal');
    assert.ok(modal);
    assert.ok(modal.querySelector('.modal-weather'), 'weather line');
    assert.ok(modal.querySelectorAll('.modal-stats .chip').length > 0, 'delta chips');
    assert.match(modal.querySelector('.modal-totals').textContent, /Energy/);
    assert.match(modal.querySelector('.modal-totals').textContent, /Insight/);
  } finally {
    cleanup(window);
  }
});

maybe('achievements raise a toast when earned', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    const { gs } = window.__game;
    gs.journeyDay = 7; // one turn from "One Week Down" being true

    click(doc, '.choice', 'Le Dernier Verre');
    await settle();
    doc.querySelector('.btn-primary').click();
    await settle();

    assert.ok(gs.achievements.has('first_week'));
    const toasts = [...doc.querySelectorAll('#toasts .toast')].map((t) => t.textContent);
    assert.ok(
      toasts.some((t) => /One Week Down/.test(t)),
      `toasts were ${JSON.stringify(toasts)}`,
    );
  } finally {
    cleanup(window);
  }
});

// ================================================================== toasts

maybe('toasts appear and clear themselves', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    window.__game.api.toast('hello');
    assert.equal(doc.querySelectorAll('#toasts .toast').length, 1);
    assert.match(doc.querySelector('.toast').textContent, /hello/);

    await new Promise((r) => setTimeout(r, 70));
    assert.equal(doc.querySelectorAll('#toasts .toast').length, 0);
  } finally {
    cleanup(window);
  }
});

// ================================================================== saving

maybe('a completed day is written to storage', async () => {
  const storage = fakeStorage();
  const window = await boot({ storage });
  try {
    const doc = window.document;
    assert.equal(storage.getItem(SAVE_KEY), null, 'nothing saved before a day is played');

    await playDay(doc, 'Le Dernier Verre');

    const raw = storage.getItem(SAVE_KEY);
    assert.ok(raw, 'the run should be saved after continuing');
    const parsed = JSON.parse(raw);
    assert.equal(parsed.v, 5);
    assert.equal(parsed.journeyDay, 2);
    assert.ok(parsed.events, 'event scheduler state is persisted');
  } finally {
    cleanup(window);
  }
});

maybe('an existing save is resumed on boot', async () => {
  const storage = fakeStorage();
  {
    const first = await boot({ storage });
    try {
      await playDay(first.document, 'Le Dernier Verre');
      await playDay(first.document, 'La Maison Calme');
    } finally {
      cleanup(first);
    }
  }

  const window = await boot({ storage });
  try {
    const { gs } = window.__game;
    assert.equal(gs.journeyDay, 3, 'the run should pick up where it left off');
    assert.match(window.document.getElementById('hud-day').textContent, /Journey Day 3/);
  } finally {
    cleanup(window);
  }
});

maybe('autoload can be switched off', async () => {
  const storage = fakeStorage();
  {
    const first = await boot({ storage });
    try {
      await playDay(first.document, 'Le Dernier Verre');
    } finally {
      cleanup(first);
    }
  }

  const window = await boot({ storage, autoload: false });
  try {
    assert.equal(window.__game.gs.journeyDay, 1, 'a fresh run was requested');
  } finally {
    cleanup(window);
  }
});

maybe('the game runs with no storage at all', async () => {
  const window = await boot({ storage: null });
  try {
    const doc = window.document;
    await playDay(doc, 'Le Dernier Verre');
    assert.ok(doc.querySelector('.hub'), 'a storageless browser must still play');
    assert.equal(window.__game.gs.journeyDay, 2);
  } finally {
    cleanup(window);
  }
});

maybe('a corrupt save is ignored rather than fatal', async () => {
  const storage = fakeStorage({ [SAVE_KEY]: '{{{not json' });
  const window = await boot({ storage });
  try {
    assert.equal(window.__game.gs.journeyDay, 1);
    assert.ok(window.document.querySelector('.hub'));
  } finally {
    cleanup(window);
  }
});

maybe('game over wipes the save so a restart is clean', async () => {
  const storage = fakeStorage();
  const window = await boot({ storage });
  try {
    const doc = window.document;
    await playDay(doc, 'Le Dernier Verre');
    assert.ok(storage.getItem(SAVE_KEY));

    window.__game.gs.sanity = 1;
    click(doc, '.choice', 'Le Dernier Verre');
    await settle();
    doc.querySelector('.btn-primary').click();
    await settle();

    assert.ok(doc.querySelector('.gameover'));
    assert.equal(storage.getItem(SAVE_KEY), null, 'a dead run must not be resumable');
  } finally {
    cleanup(window);
  }
});

// ============================================================== game over

maybe('the game-over screen summarises the whole run', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    const { gs } = window.__game;
    gs.sanity = 1;
    gs.achievements.add('first_week');

    click(doc, '.choice', 'Le Dernier Verre');
    await settle();
    doc.querySelector('.btn-primary').click();
    await settle();

    const summary = doc.querySelector('.run-stats');
    assert.ok(summary, 'a run summary should render');
    const labels = [...summary.querySelectorAll('dt')].map((d) => d.textContent);
    assert.ok(labels.includes('Places visited'));
    assert.ok(labels.includes('Achievements'));
    assert.match(summary.textContent, new RegExp(`/ ${LOCATIONS.length}`));
  } finally {
    cleanup(window);
  }
});

// ============================================================== endurance

maybe('a twelve-day playthrough across the city never throws', async () => {
  const window = await boot({ seed: 7 });
  try {
    const doc = window.document;
    const { gs } = window.__game;
    // Open the city up so the hub has plenty of open choices.
    gs.reputation = 80;

    for (let i = 0; i < 12; i++) {
      if (doc.querySelector('.gameover')) break;

      const open = [...doc.querySelectorAll('.choices button:not([disabled])')];
      assert.ok(open.length > 0, 'there should always be somewhere to go');
      open[i % open.length].click();
      await settle();

      doc.querySelector('.btn-primary')?.click();
      await settle();

      const cont = [...doc.querySelectorAll('.modal button')].find((b) =>
        b.textContent.includes('Continue'),
      );
      if (cont) {
        cont.click();
        await settle();
      }
    }
    assert.ok(true, 'reaching here without an exception is the assertion');
  } finally {
    cleanup(window);
  }
});

maybe('reduced motion still suppresses the particles on new locations', async () => {
  const window = await boot({ reducedMotion: true });
  try {
    const doc = window.document;
    window.__game.api.goto.location('home_loft');
    await new Promise((r) => setTimeout(r, 50));
    const container = doc.querySelector('.particles');
    assert.ok(container);
    assert.equal(container.children.length, 0);
  } finally {
    cleanup(window);
  }
});

// ----------------------------------------------------- weather-bound previews

/** First seed that puts the given weather on the run's first (January) day. */
function seedForWeather(id) {
  for (let s = 1; s < 8000; s += 1) {
    if (weatherForDay(1, s, 'Winter', 0).id === id) return s;
  }
  throw new Error(`no seed produces "${id}" on a winter day one`);
}

const chipText = (doc) =>
  [...doc.querySelectorAll('.choices .chip')].map((c) => c.textContent).join(' ');

/** Every preview chip container currently on the hub cards shows the same mode. */
function assertAllCardsShow(doc, mode) {
  const all = [...doc.querySelectorAll('.choices [data-preview-mode]')];
  assert.ok(all.length >= 2, 'at least the founding pair has previews');
  for (const node of all) {
    assert.equal(
      node.dataset.previewMode,
      mode,
      `a card shows ${node.dataset.previewMode}, expected ${mode}`,
    );
  }
}

maybe('fog shows only each location’s positive focus icon', async () => {
  const window = await boot({ seed: seedForWeather('fog') });
  try {
    const { document: doc } = window;
    assertAllCardsShow(doc, 'veiled');
    assert.ok(!/\d/.test(chipText(doc)), 'no numbers leak through the fog');
    assert.doesNotMatch(chipText(doc), /[+−-]|no telling/i, 'no sign or old fog label leaks');

    const community = doc.querySelector('[data-location="spiritual_community"] .focus-chips');
    const bar = doc.querySelector('[data-location="bar"] .focus-chips');
    assert.equal(community?.dataset.focus, 'sanity');
    assert.equal(community?.textContent, '🧘');
    assert.equal(bar?.dataset.focus, 'money');
    assert.equal(bar?.textContent, '💰');

    window.__game.api.goto.location('bar');
    const preview = doc.querySelector('.preview');
    assert.equal(preview?.dataset.previewMode, 'veiled');
    assert.equal(preview.querySelector('.focus-chips')?.dataset.focus, 'money');
    assert.equal(preview.querySelector('.focus-chips')?.textContent, '💰');
    assert.ok(!preview.querySelector('.preview-why'), 'fog hides the reasons too');
    assert.ok(!/\d/.test(preview.textContent), 'no numbers on the location screen either');
  } finally {
    cleanup(window);
  }
});

maybe('rain and snow blur the preview into ++ / -- bands, reasons stay', async () => {
  for (const weatherId of ['rain', 'snow']) {
    const window = await boot({ seed: seedForWeather(weatherId) });
    try {
      const { document: doc } = window;
      assertAllCardsShow(doc, 'banded');
      assert.ok(!/\d/.test(chipText(doc)), `${weatherId}: no exact numbers`);
      // Direction and rough scale survive: the bar's big preview swings
      // (+money / -sanity / -energy) must read as ++ and -- bands.
      const barCard = doc.querySelector('[data-location="bar"]');
      assert.ok(barCard, 'the bar is on the hub');
      const bands = [...barCard.querySelectorAll('.chip')].map((c) =>
        c.textContent.replace(/[^+\-]/g, ''),
      );
      assert.ok(bands.includes('++'), `${weatherId}: a strong gain reads ++ (${bands})`);
      assert.ok(bands.includes('--'), `${weatherId}: a strong drain reads -- (${bands})`);

      window.__game.api.goto.location('river_walk');
      const preview = doc.querySelector('.preview');
      assert.equal(preview?.dataset.previewMode, 'banded');
      assert.ok(
        preview.querySelector('.preview-why'),
        `${weatherId}: banded days keep the qualitative reasons`,
      );
    } finally {
      cleanup(window);
    }
  }
});

maybe('clear weather shows the full exact preview with numbers', async () => {
  const window = await boot({ seed: seedForWeather('clear') });
  try {
    const { document: doc } = window;
    assertAllCardsShow(doc, 'exact');
    assert.ok(/\d/.test(chipText(doc)), 'exact days show real numbers');
    assert.ok(!/\+\+|--/.test(chipText(doc)), 'exact days never degrade to bands');
  } finally {
    cleanup(window);
  }
});

// ----------------------------------------------------- seamless swaps

maybe('navigation never passes through black: no overlay, one dissolve, no leaks', async () => {
  const window = await boot({ fadeMs: 30 });
  try {
    const { document: doc } = window;
    assert.equal(doc.getElementById('fade'), null, 'the black fade overlay is gone');

    const content = doc.getElementById('content');
    const card = [...doc.querySelectorAll('.choice')].find((b) => b.dataset.location === 'bar');
    assert.ok(card, 'a bar card is on the hub');
    card.click();

    await settle();
    assert.equal(content.querySelectorAll('.screen.location').length, 1, 'new screen is in');
    const leaving = [...content.children].filter((n) => n.classList.contains('swap-out'));
    assert.equal(leaving.length, 1, 'exactly one outgoing screen dissolves on top');
    assert.ok(leaving[0].classList.contains('hub'), 'it is the hub we came from');

    await new Promise((r) => setTimeout(r, 60));
    assert.equal(content.children.length, 1, 'the outgoing screen is removed afterwards');
    assert.ok(content.querySelector('.screen.location'), 'and the location stayed');
    assert.ok(
      content.querySelector('.screen').dataset.bg,
      'background screens carry data-bg for the preloader',
    );
  } finally {
    cleanup(window);
  }
});

// ----------------------------------------------------- weekday-gated market

maybe('the Saturday Market card says Only on Saturdays and refuses clicks midweek', async () => {
  const window = await boot({}); // default seed
  try {
    const { document: doc } = window;
    const { gs, api } = window.__game;

    // Find a midweek day and a Saturday where the market is today's slot-5 card.
    let midweekDay = 0;
    let saturdayDay = 0;
    for (let d = 3; d <= 45 && (!midweekDay || !saturdayDay); d += 1) {
      const weekday = (d - 1 + START_WEEKDAY_OFFSET) % 7;
      const inSlot = locationForSlot(5, { journeyDay: d, reputation: 0, weekday }, gs.weatherSeed);
      if (inSlot?.id !== 'farmers_market') continue;
      if (weekday === 5) saturdayDay = d;
      else midweekDay = d;
    }
    assert.ok(midweekDay && saturdayDay, 'test days found in the rotation');

    gs.journeyDay = midweekDay;
    api.goto.hub();
    const locked = doc.querySelector('[data-location="farmers_market"].locked');
    assert.ok(locked, 'midweek card is locked');
    assert.equal(locked.disabled, true, 'a locked card cannot be clicked');
    assert.match(locked.textContent, /Only on Saturdays/);

    gs.journeyDay = saturdayDay;
    api.goto.hub();
    const open = doc.querySelector('[data-location="farmers_market"]');
    assert.ok(open && !open.classList.contains('locked'), 'Saturday card is open');
    assert.equal(open.disabled ?? false, false, 'and it can be clicked');
  } finally {
    cleanup(window);
  }
});

maybe(
  'the in-game Reduced Motion setting stops particle timers, not only CSS animation',
  async () => {
    const window = await boot();
    try {
      const doc = window.document;
      window.__game.api.goto.settings();
      click(doc, '.settings-choice', 'Reduced motion');
      assert.ok(doc.documentElement.classList.contains('reduce-motion'));

      window.__game.api.goto.location('home_loft');
      await new Promise((resolve) => setTimeout(resolve, 80));
      assert.equal(doc.querySelector('.particles')?.children.length, 0);
    } finally {
      cleanup(window);
    }
  },
);

maybe(
  'a result reload restores the resolved modal instead of rolling back the choice',
  async () => {
    const storage = fakeStorage();
    let resolved;
    {
      const first = await boot({ storage });
      try {
        const doc = first.document;
        first.__game.api.goto.location('bar');
        click(doc, '.location button', 'Work a Shift');
        await settle();
        assert.ok(doc.querySelector('.modal'));
        resolved = {
          day: first.__game.gs.journeyDay,
          money: first.__game.gs.money,
          sanity: first.__game.gs.sanity,
        };
        const blob = JSON.parse(storage.getItem(SAVE_KEY));
        assert.ok(blob.pendingResult, 'resolved result is persisted before Continue');
        assert.equal(blob.turnResolvedOnDay, resolved.day);
      } finally {
        cleanup(first);
      }
    }

    const resumed = await boot({ storage });
    try {
      const doc = resumed.document;
      assert.ok(doc.querySelector('.modal'), 'the unresolved result modal returns after reload');
      assert.equal(resumed.__game.gs.journeyDay, resolved.day);
      assert.equal(resumed.__game.gs.money, resolved.money);
      assert.equal(resumed.__game.gs.sanity, resolved.sanity);
      click(doc, '.modal button', 'Continue');
      await settle();
      assert.equal(resumed.__game.gs.journeyDay, resolved.day + 1);
      assert.ok(doc.querySelector('.hub'));
      assert.equal(JSON.parse(storage.getItem(SAVE_KEY)).pendingResult, undefined);
    } finally {
      cleanup(resumed);
    }
  },
);

maybe('a three-day retreat returns to the next playable morning', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    const { gs, events, api } = window.__game;
    gs.journeyDay = 20;
    gs.dayOfMonth = 20;
    gs.money = 300;
    gs.sanity = 70;
    gs.energy = 100;
    gs.reputation = 100;
    events._nextEventDay = 999;

    api.goto.location('mountain_retreat');
    click(doc, '.location button', 'Go on Retreat');
    await settle();
    assert.equal(gs.journeyDay, 22, 'two silent interior days resolve before the result');
    click(doc, '.modal button', 'Continue');
    await settle();
    assert.equal(gs.journeyDay, 23, 'the next choice is the morning after the three-day trip');
    assert.equal(gs.isTurnResolved, false);
    assert.ok(doc.querySelector('.hub'));
  } finally {
    cleanup(window);
  }
});
