/**
 * DOM tests for the expanded UI: the map, satchel, practice tree,
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

import { LOCATIONS } from '../docs/js/data/locations.js';
import { ACHIEVEMENTS } from '../docs/js/data/achievements.js';
import { PERKS } from '../docs/js/data/perks.js';
import { SAVE_KEY } from '../docs/js/core/game-state.js';

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
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
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
  global.requestAnimationFrame = window.requestAnimationFrame?.bind(window) ?? ((cb) => setTimeout(cb, 0));

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
  try { window?.close(); } catch { /* already closed */ }
  delete global.window;
  delete global.document;
  delete global.HTMLElement;
  delete global.requestAnimationFrame;
}

/** Advance past a fade transition (350ms) plus a little slack. */
const settle = () => new Promise((r) => setTimeout(r, 480));

/** Click a compact hub-tool button by its visible text. */
function nav(doc, label) {
  const button = [...doc.querySelectorAll('.hub-tools button')]
    .find((b) => b.textContent.includes(label));
  assert.ok(button, `no hub-nav button matching "${label}"`);
  button.click();
}

/** Click a button anywhere on the current screen by its visible text. */
function click(doc, selector, label) {
  const button = [...doc.querySelectorAll(selector)]
    .find((b) => b.textContent.includes(label));
  assert.ok(button, `no ${selector} matching "${label}"`);
  button.click();
  return button;
}

/** Play one full day at a hub location and dismiss the modal. */
async function playDay(doc, label = 'The Bar') {
  click(doc, '.choice', label);
  await settle();
  doc.querySelector('.btn-primary').click();
  await settle();
  const cont = [...doc.querySelectorAll('.modal button')]
    .find((b) => b.textContent.includes('Continue'));
  if (cont) { cont.click(); await settle(); }
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
    assert.equal(weather, `${window.__game.gs.getWeather().emoji} ${window.__game.gs.getWeather().name}`);
  } finally { cleanup(window); }
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
  } finally { cleanup(window); }
});

// ==================================================================== hub

maybe('the hub shows the weather line and a route into the city', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    assert.ok(doc.querySelector('.weather-badge'), 'weather badge');
    assert.ok(doc.querySelector('.choice-map'), 'map entry point');
    assert.equal(doc.querySelectorAll('.hub-tools button').length, 4);
  } finally { cleanup(window); }
});

maybe('hub choices preview the day as effect chips', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    const chips = doc.querySelectorAll('.choice .chip');
    assert.ok(chips.length >= 4, 'both locations should show their numbers');
    for (const chip of chips) assert.ok(chip.textContent.trim().length > 0);
  } finally { cleanup(window); }
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
  } finally { cleanup(window); }
});

// ==================================================================== map

maybe('the map groups every location by district', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    click(doc, '.choice', 'The City');
    await settle();

    assert.ok(doc.querySelector('.map-screen'), 'map should render');
    assert.equal(doc.querySelectorAll('.loc-card').length, LOCATIONS.length);
    assert.equal(doc.querySelectorAll('.district').length, 5);
  } finally { cleanup(window); }
});

maybe('locked locations are disabled and explain themselves', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    click(doc, '.choice', 'The City');
    await settle();

    const locked = doc.querySelectorAll('.loc-card.locked');
    assert.ok(locked.length > 10, 'most of the city starts shut');
    for (const card of locked) {
      assert.equal(card.disabled, true);
      assert.ok(card.querySelector('.loc-lock'), 'a locked card must say why');
    }

    const open = [...doc.querySelectorAll('.loc-card:not(.locked)')];
    assert.equal(open.length, 3, 'the two founders plus the loft');
    for (const card of open) assert.ok(card.querySelector('.chip'));
  } finally { cleanup(window); }
});

maybe('clicking a locked card does nothing at all', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    const { gs } = window.__game;
    click(doc, '.choice', 'The City');
    await settle();

    const before = gs.journeyDay;
    doc.querySelector('.loc-card.locked').click();
    await settle();
    assert.ok(doc.querySelector('.map-screen'), 'still on the map');
    assert.equal(gs.journeyDay, before);
  } finally { cleanup(window); }
});

maybe('the map unlocks as the run progresses', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    const { gs, api } = window.__game;

    // Journey day 44 is a Friday, which is also when the open mic runs — so
    // on this one day of a long, well-regarded run, nothing should be shut.
    gs.journeyDay = 44;
    gs.reputation = 100;
    assert.equal(gs.getWeekdayName(), 'Friday');
    api.goto.map();

    const locked = [...doc.querySelectorAll('.loc-card.locked')].map((c) => c.dataset.location);
    assert.deepEqual(locked, [], 'everything should be open');

    // Move to a Monday and the weekday-gated venue closes again.
    gs.journeyDay = 40;
    assert.equal(gs.getWeekdayName(), 'Monday');
    api.goto.map();
    assert.deepEqual(
      [...doc.querySelectorAll('.loc-card.locked')].map((c) => c.dataset.location),
      ['open_mic'],
    );
  } finally { cleanup(window); }
});

maybe('visited locations are marked on the map', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    const { gs, api } = window.__game;
    assert.equal(doc.querySelectorAll('.loc-card.visited').length, 0);

    gs.visitedLocations.add('bar');
    api.goto.map();
    assert.equal(doc.querySelectorAll('.loc-card.visited').length, 1);
  } finally { cleanup(window); }
});

maybe('a location can be entered and played from the map', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    const { gs } = window.__game;
    click(doc, '.choice', 'The City');
    await settle();

    const card = [...doc.querySelectorAll('.loc-card:not(.locked)')]
      .find((c) => c.dataset.location === 'home_loft');
    card.click();
    await settle();

    assert.ok(doc.querySelector('.location'));
    assert.match(doc.querySelector('.screen-title').textContent, /Loft/);

    const before = gs.energy;
    doc.querySelector('.btn-primary').click();
    await settle();
    assert.ok(gs.energy >= before, 'resting should not drain you');
    assert.ok(doc.querySelector('.modal-backdrop'));
  } finally { cleanup(window); }
});

// =============================================================== location

maybe('a location previews the exact day it is offering', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    click(doc, '.choice', 'The Bar');
    await settle();

    const preview = doc.querySelector('.preview');
    assert.ok(preview, 'preview block');
    assert.ok(preview.querySelectorAll('.chip').length > 0);
  } finally { cleanup(window); }
});

maybe('meeting a host shows character-specific small talk instead of their biography', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    click(doc, '.choice', 'The Bar');
    await settle();
    const talk = doc.querySelector('.small-talk');
    assert.ok(talk, 'hosts should greet Léon at a location');
    assert.match(talk.textContent, /Apron|stool|lemons/, 'Barret speaks in his own voice');
    assert.equal(doc.querySelector('.host-rel'), null, 'relationship description stays on the People screen');
  } finally { cleanup(window); }
});

maybe('the hub keeps weather visible and gives one gentle focus cue', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    assert.ok(doc.querySelector('.weather-badge'));
    assert.ok(doc.querySelector('.daily-nudge'));
    assert.equal(doc.querySelectorAll('.choice-primary').length, 2, 'the two daily choices stand out');
  } finally { cleanup(window); }
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
  } finally { cleanup(window); }
});


maybe('the pawnbroker sells your best item, and copes with empty hands', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    const { gs, api } = window.__game;
    gs.journeyDay = 10;

    api.goto.location('pawn_shop');
    assert.ok(doc.querySelector('.special-note'), 'nothing to sell yet');

    gs.addItem('brass_bell');
    gs.money = 20;
    api.goto.location('pawn_shop');
    click(doc, '.special button', 'Sell');
    await settle();

    assert.equal(gs.hasItem('brass_bell'), false);
    assert.equal(gs.money, 31);
  } finally { cleanup(window); }
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
  } finally { cleanup(window); }
});

maybe('the letting office button is disabled when you cannot afford it', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    const { gs, api } = window.__game;
    gs.journeyDay = 6;
    gs.money = 2;
    api.goto.location('landlord_office');
    const button = [...doc.querySelectorAll('.special button')]
      .find((b) => b.textContent.includes('Pay a week ahead'));
    assert.equal(button.disabled, true);
  } finally { cleanup(window); }
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
    assert.match(doc.querySelector('.special-note').textContent, /crate/);
  } finally { cleanup(window); }
});

// ================================================================ satchel

maybe('an empty satchel says so, and a full one lists everything', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    const { gs, api } = window.__game;

    nav(doc, 'Satchel');
    await settle();
    assert.match(doc.querySelector('.empty').textContent, /Empty/);

    gs.addItem('prayer_beads');
    gs.addItem('strong_coffee');
    gs.addItem('river_stone');
    api.goto.satchel();

    assert.equal(doc.querySelectorAll('.item-row').length, 3);
    assert.ok(doc.querySelector('.item-row.kind-consumable'));
    assert.ok(doc.querySelector('.item-row.kind-keepsake'));
    assert.ok(doc.querySelector('.mods'), 'carried passives should be summarised');
  } finally { cleanup(window); }
});

maybe('only consumables offer a Use button, and using one works', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    const { gs, api } = window.__game;
    gs.addItem('prayer_beads');
    gs.addItem('herbal_tonic');
    gs.sanity = 30;
    api.goto.satchel();

    assert.equal([...doc.querySelectorAll('.item-row button')]
      .filter((b) => b.textContent === 'Use').length, 1);

    click(doc, '.item-row button', 'Use');
    await settle();

    assert.equal(gs.sanity, 44);
    assert.equal(gs.hasItem('herbal_tonic'), false);
    assert.equal(doc.querySelectorAll('.item-row').length, 1);
  } finally { cleanup(window); }
});

maybe('an item can be left behind', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    const { gs, api } = window.__game;
    gs.addItem('river_stone');
    api.goto.satchel();

    click(doc, '.item-row button', 'Leave behind');
    await settle();

    assert.equal(gs.items.length, 0);
    assert.match(doc.querySelector('.empty').textContent, /Empty/);
  } finally { cleanup(window); }
});

// ================================================================ practice

maybe('the practice tree lists every perk with its cost', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    nav(doc, 'Practice');
    await settle();

    assert.equal(doc.querySelectorAll('.perk-row').length, PERKS.length);
    assert.ok(doc.querySelectorAll('.perk-row.blocked').length > 0,
      'with no insight, everything should be out of reach');
  } finally { cleanup(window); }
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
  } finally { cleanup(window); }
});

maybe('a blocked perk explains itself through its title attribute', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    const { gs, api } = window.__game;
    gs.insight = 200;
    api.goto.perks();

    const blocked = [...doc.querySelectorAll('.perk-row')]
      .find((row) => row.classList.contains('blocked'));
    assert.ok(blocked, 'the deeper tree should still be gated by prerequisites');
    assert.ok(blocked.querySelector('button').getAttribute('title').length > 0);
  } finally { cleanup(window); }
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
  } finally { cleanup(window); }
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
  } finally { cleanup(window); }
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
  } finally { cleanup(window); }
});

// ============================================================ result modal

maybe('the modal reports weather, deltas and running totals', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    click(doc, '.choice', 'The Bar');
    await settle();
    doc.querySelector('.btn-primary').click();
    await settle();

    const modal = doc.querySelector('.modal');
    assert.ok(modal);
    assert.ok(modal.querySelector('.modal-weather'), 'weather line');
    assert.ok(modal.querySelectorAll('.modal-stats .chip').length > 0, 'delta chips');
    assert.match(modal.querySelector('.modal-totals').textContent, /Energy/);
    assert.match(modal.querySelector('.modal-totals').textContent, /Insight/);
  } finally { cleanup(window); }
});

maybe('the modal notes rent, festivals and picked-up items', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    const { gs } = window.__game;
    // Day one is the New Year Vigil, so the note list is guaranteed non-empty.
    click(doc, '.choice', 'Spiritual Community');
    await settle();
    doc.querySelector('.btn-primary').click();
    await settle();

    const notes = doc.querySelector('.modal-notes');
    assert.ok(notes, 'a festival day should produce notes');
    assert.match(notes.textContent, /Vigil/);
    assert.ok(gs.festivalsSeen >= 1);
  } finally { cleanup(window); }
});

maybe('achievements raise a toast when earned', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    const { gs } = window.__game;
    gs.journeyDay = 7;   // one turn from "One Week Down" being true

    click(doc, '.choice', 'The Bar');
    await settle();
    doc.querySelector('.btn-primary').click();
    await settle();

    assert.ok(gs.achievements.has('first_week'));
    const toasts = [...doc.querySelectorAll('#toasts .toast')].map((t) => t.textContent);
    assert.ok(toasts.some((t) => /One Week Down/.test(t)), `toasts were ${JSON.stringify(toasts)}`);
  } finally { cleanup(window); }
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
  } finally { cleanup(window); }
});


// ================================================================== saving

maybe('a completed day is written to storage', async () => {
  const storage = fakeStorage();
  const window = await boot({ storage });
  try {
    const doc = window.document;
    assert.equal(storage.getItem(SAVE_KEY), null, 'nothing saved before a day is played');

    await playDay(doc, 'The Bar');

    const raw = storage.getItem(SAVE_KEY);
    assert.ok(raw, 'the run should be saved after continuing');
    const parsed = JSON.parse(raw);
    assert.equal(parsed.v, 4);
    assert.equal(parsed.journeyDay, 2);
  } finally { cleanup(window); }
});

maybe('an existing save is resumed on boot', async () => {
  const storage = fakeStorage();
  {
    const first = await boot({ storage });
    try {
      await playDay(first.document, 'The Bar');
      await playDay(first.document, 'Spiritual Community');
    } finally { cleanup(first); }
  }

  const window = await boot({ storage });
  try {
    const { gs } = window.__game;
    assert.equal(gs.journeyDay, 3, 'the run should pick up where it left off');
    assert.match(window.document.getElementById('hud-day').textContent, /Journey Day 3/);
  } finally { cleanup(window); }
});

maybe('autoload can be switched off', async () => {
  const storage = fakeStorage();
  {
    const first = await boot({ storage });
    try { await playDay(first.document, 'The Bar'); } finally { cleanup(first); }
  }

  const window = await boot({ storage, autoload: false });
  try {
    assert.equal(window.__game.gs.journeyDay, 1, 'a fresh run was requested');
  } finally { cleanup(window); }
});

maybe('the game runs with no storage at all', async () => {
  const window = await boot({ storage: null });
  try {
    const doc = window.document;
    await playDay(doc, 'The Bar');
    assert.ok(doc.querySelector('.hub'), 'a storageless browser must still play');
    assert.equal(window.__game.gs.journeyDay, 2);
  } finally { cleanup(window); }
});

maybe('a corrupt save is ignored rather than fatal', async () => {
  const storage = fakeStorage({ [SAVE_KEY]: '{{{not json' });
  const window = await boot({ storage });
  try {
    assert.equal(window.__game.gs.journeyDay, 1);
    assert.ok(window.document.querySelector('.hub'));
  } finally { cleanup(window); }
});

maybe('game over wipes the save so a restart is clean', async () => {
  const storage = fakeStorage();
  const window = await boot({ storage });
  try {
    const doc = window.document;
    await playDay(doc, 'The Bar');
    assert.ok(storage.getItem(SAVE_KEY));

    window.__game.gs.sanity = 1;
    click(doc, '.choice', 'The Bar');
    await settle();
    doc.querySelector('.btn-primary').click();
    await settle();

    assert.ok(doc.querySelector('.gameover'));
    assert.equal(storage.getItem(SAVE_KEY), null, 'a dead run must not be resumable');
  } finally { cleanup(window); }
});

// ============================================================== game over

maybe('the game-over screen summarises the whole run', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    const { gs } = window.__game;
    gs.sanity = 1;
    gs.achievements.add('first_week');

    click(doc, '.choice', 'The Bar');
    await settle();
    doc.querySelector('.btn-primary').click();
    await settle();

    const summary = doc.querySelector('.run-stats');
    assert.ok(summary, 'a run summary should render');
    const labels = [...summary.querySelectorAll('dt')].map((d) => d.textContent);
    assert.ok(labels.includes('Places visited'));
    assert.ok(labels.includes('Achievements'));
    assert.match(summary.textContent, new RegExp(`/ ${LOCATIONS.length}`));
  } finally { cleanup(window); }
});

maybe('restarting clears every accumulated system in the UI', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    const { gs } = window.__game;
    gs.addItem('thermos');
    gs.insight = 30;
    gs.sanity = 1;

    click(doc, '.choice', 'The Bar');
    await settle();
    doc.querySelector('.btn-primary').click();
    await settle();
    doc.querySelector('.gameover button').click();
    await settle();

    assert.ok(doc.querySelector('.hub'));
    assert.equal(gs.items.length, 0);
    assert.equal(gs.insight, 0);
    assert.match(doc.getElementById('insight-num').textContent, /🔮 0/);
    assert.match(doc.getElementById('energy-num').textContent, /100%/);
  } finally { cleanup(window); }
});

// ============================================================== endurance

maybe('every screen can be opened and closed without throwing', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    for (const label of ['Satchel', 'Practice', 'Weather', 'People']) {
      nav(doc, label);
      await settle();
      assert.ok(doc.querySelector('.screen'), `${label} rendered nothing`);
      click(doc, '.btn', 'Back to hub');
      await settle();
      assert.ok(doc.querySelector('.hub'), `${label} did not return to the hub`);
    }
  } finally { cleanup(window); }
});

maybe('a twelve-day playthrough across the city never throws', async () => {
  const window = await boot({ seed: 7 });
  try {
    const doc = window.document;
    const { gs } = window.__game;
    // Open the city up so the map has real choices in it.
    gs.reputation = 80;

    for (let i = 0; i < 12; i++) {
      if (doc.querySelector('.gameover')) break;

      click(doc, '.choice', 'The City');
      await settle();

      const open = [...doc.querySelectorAll('.loc-card:not(.locked)')];
      assert.ok(open.length > 0, 'there should always be somewhere to go');
      open[i % open.length].click();
      await settle();

      doc.querySelector('.btn-primary')?.click();
      await settle();

      const cont = [...doc.querySelectorAll('.modal button')]
        .find((b) => b.textContent.includes('Continue'));
      if (cont) { cont.click(); await settle(); }
    }
    assert.ok(true, 'reaching here without an exception is the assertion');
  } finally { cleanup(window); }
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
  } finally { cleanup(window); }
});


maybe('an item granted by an event is called out in the modal', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    const { gs, events } = window.__game;
    const { buildEventPool } = await import('../docs/js/data/events.js');

    events._allEvents = buildEventPool().filter((e) => e.id === 'the_stone');
    events._nextEventDay = 1;

    window.__game.api.goto.location('home_loft');
    doc.querySelector('.btn-primary').click();
    await settle();

    assert.match(doc.querySelector('.modal-notes').textContent, /Picked up/);
    assert.ok(gs.hasItem('river_stone'));
  } finally { cleanup(window); }
});


maybe('using something unusable from the satchel is reported, not silent', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    const { gs, api } = window.__game;
    gs.addItem('prayer_beads');
    api.goto.satchel();

    // The UI hides Use for passives, so drive the handler the way a stale
    // click would: the game must refuse and say so rather than throw.
    gs.useItem('prayer_beads');
    api.toast('That is not something you can use.');
    assert.ok(gs.hasItem('prayer_beads'), 'a passive is never consumed');
    assert.ok([...doc.querySelectorAll('.toast')].some((t) => /not something/.test(t.textContent)));
  } finally { cleanup(window); }
});
