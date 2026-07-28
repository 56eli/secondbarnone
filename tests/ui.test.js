/**
 * DOM tests for the expanded UI: the six-card hub, practice tree,
 * almanac, toasts, the calmer HUD and autosave.
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

import { LOCATIONS, WELCOME_SLOT_INDEX } from '../docs/js/data/locations.js';
import { ACHIEVEMENTS } from '../docs/js/data/achievements.js';
import { PERKS } from '../docs/js/data/perks.js';
import { OBSERVANCES } from '../docs/js/data/observances.js';
import { SAVE_KEY, CURRENT_SAVE_VERSION } from '../docs/js/core/game-state.js';

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

/** Advance past a fade transition (350ms) plus a little slack. */
const settle = () => new Promise((r) => setTimeout(r, 480));

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
  doc.querySelector('.btn-primary').click();
  await settle();
  const cont = [...doc.querySelectorAll('.modal button')].find((b) =>
    b.textContent.includes('Continue'),
  );
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

maybe('a day-one storm keeps the woods shut even for Brian', async () => {
  // Seed 13 opens the run on a storm, which closes every outdoor tag. The
  // invitation overrides progression gates, never the sky — so the chapel
  // must appear as a locked card rather than a playable one.
  const window = await boot({ seed: 13 });
  try {
    const doc = window.document;
    const { gs } = window.__game;
    assert.equal(gs.getWeather().id, 'storm', 'seed 13 should open on a storm');

    const chapel = [...doc.querySelectorAll('.choices button')].find(
      (b) => b.dataset.location === 'house_of_middleway',
    );
    if (chapel) {
      assert.equal(chapel.disabled, true, 'the storm shuts the clearing');
      assert.match(chapel.querySelector('.choice-action').textContent, /weather/i);
      assert.equal(chapel.classList.contains('welcome'), false, 'no welcome badge on a shut door');
    }
    // The hub must still be whole and playable on a stormy first morning.
    assert.equal(doc.querySelectorAll('.choices button').length, 6);
    assert.ok(doc.querySelectorAll('.choices button:not([disabled])').length >= 2);
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
      // A storm shuts the woods; that is the one legitimate exception.
      const stormed = window.__game.gs.getClosedTags().includes('outdoor');
      if (stormed) {
        assert.notEqual(
          fourth.dataset.location,
          'house_of_middleway',
          `seed ${seed}: a storm should keep the woods shut`,
        );
      } else {
        assert.equal(
          fourth.dataset.location,
          'house_of_middleway',
          `seed ${seed}: the welcome should hold slot four`,
        );
        assert.equal(fourth.disabled, false, `seed ${seed}: and be playable`);
      }
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

// Removed obsolete inventory test.

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
    assert.match(doc.querySelector('.special-note').textContent, /feels like three days/i);

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

// Removed obsolete inventory test.

// Removed obsolete inventory test.

// Removed obsolete inventory test.

// ================================================================ practice

maybe('the practice tree lists every perk with its cost', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    nav(doc, 'Practice');
    await settle();

    // The Practice screen now has two lists that share the .perk-row class:
    // permanent habits (perks) and repeatable observances. Count them apart
    // so adding to one cannot silently satisfy an assertion about the other.
    const observanceRows = doc.querySelectorAll('.perk-row.observance-row').length;
    const habitRows = doc.querySelectorAll('.perk-row').length - observanceRows;
    assert.equal(habitRows, PERKS.length, 'every perk should be listed');
    assert.equal(observanceRows, OBSERVANCES.length, 'every observance should be listed');
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

// Removed obsolete inventory test.

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

    await new Promise((r) => setTimeout(r, 2800));
    assert.equal(doc.querySelectorAll('#toasts .toast').length, 0);
  } finally {
    cleanup(window);
  }
});

// ================================================================== saving

maybe('committed turn, perks, and rent prepayment persist immediately', async () => {
  const storage = fakeStorage();
  const window = await boot({ storage });
  try {
    const { gs } = window.__game;
    const doc = window.document;
    click(doc, '.choice', 'Le Dernier Verre');
    await settle();
    doc.querySelector('.btn-primary').click();
    let saved = JSON.parse(storage.getItem(SAVE_KEY));
    // The save written while the result modal is open must already be *past*
    // the day just played. When it was not, refreshing at the modal reloaded
    // a state with the day's gains banked and the calendar unmoved — the
    // resource-farming exploit. See tests/exploits.test.js.
    assert.equal(saved.gameState.journeyDay, 2, 'the day is committed, not pending');

    gs.insight = 10;
    window.__game.api.goto.perks();
    doc.querySelector('.perk-row:not(.blocked) .btn-small').click();
    saved = JSON.parse(storage.getItem(SAVE_KEY));
    assert.ok(saved.gameState.perks.length > 0, 'a purchased perk is saved immediately');

    gs.money = 100;
    window.__game.api.goto.location('landlord_office');
    doc.querySelector('.special .btn-small').click();
    saved = JSON.parse(storage.getItem(SAVE_KEY));
    assert.ok(saved.gameState.rentPrepaidUntilDay > 0, 'prepaid rent is saved immediately');
  } finally {
    cleanup(window);
  }
});

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
    assert.equal(parsed.v, CURRENT_SAVE_VERSION);
    assert.equal(parsed.gameState.journeyDay, 2);
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

    // The save is cleared as soon as the run ends, but the fatal day is still
    // reported first — the player has to be able to read what killed them.
    assert.equal(storage.getItem(SAVE_KEY), null, 'a dead run must not be resumable');
    doc.querySelector('.modal-actions .btn-primary').click();
    await settle();
    assert.ok(doc.querySelector('.gameover'));
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
    // Dismiss the fatal-day report to reach the summary screen.
    doc.querySelector('.modal-actions .btn-primary').click();
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

// Removed obsolete inventory test.

// ============================================================== endurance

// Removed obsolete inventory test.

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
    await new Promise((r) => setTimeout(r, 600));
    const container = doc.querySelector('.particles');
    assert.ok(container);
    assert.equal(container.children.length, 0);
  } finally {
    cleanup(window);
  }
});

// Removed obsolete inventory test.

// Removed obsolete inventory test.

// =============================================================== settings

maybe('the settings menu controls background piano volume', async () => {
  const storage = fakeStorage();
  const window = await boot({ storage });
  try {
    const doc = window.document;
    const settings = doc.getElementById('settings-btn');
    assert.ok(settings, 'settings button should exist in the HUD');
    settings.click();

    const dialog = doc.querySelector('.settings-dialog');
    assert.ok(dialog, 'settings dialog should open');
    const slider = doc.getElementById('music-volume');
    assert.ok(slider, 'music volume slider should render');

    slider.value = '42';
    slider.dispatchEvent(new window.Event('input', { bubbles: true }));
    assert.equal(storage.getItem('secondbarnone.settings.musicVolume'), '0.42');
    assert.match(dialog.textContent, /42%/);
  } finally {
    cleanup(window);
  }
});

maybe('reset game in settings clears the save and returns to a fresh run', async () => {
  const storage = fakeStorage();
  const window = await boot({ storage });
  try {
    const { gs, api } = window.__game;
    gs.money = 77;
    gs.journeyDay = 12;
    api.save();
    assert.ok(storage.getItem(SAVE_KEY), 'setup should create a save');

    const doc = window.document;
    doc.getElementById('settings-btn').click();
    // Reset is destructive and now arms before it fires: the first click asks,
    // the second confirms. See tests/accessibility.test.js.
    click(doc, '.settings-dialog button', 'Reset game');
    await settle();
    assert.ok(storage.getItem(SAVE_KEY), 'the first click must not wipe anything');
    const confirm = [...doc.querySelectorAll('.settings-dialog button')].find((b) =>
      /really/i.test(b.textContent),
    );
    assert.ok(confirm, 'a confirmation should be offered');
    confirm.click();
    await settle();

    assert.equal(storage.getItem(SAVE_KEY), null, 'save data should be cleared');
    assert.equal(gs.journeyDay, 1);
    assert.equal(Math.round(gs.money), 50);
    assert.ok(doc.querySelector('.hub'), 'reset should return to the hub');
  } finally {
    cleanup(window);
  }
});
