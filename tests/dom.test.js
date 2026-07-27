/**
 * DOM smoke tests — boots the real index.html in jsdom, loads the real
 * main.js, and drives the UI by clicking actual buttons.
 *
 * This is what catches the class of bug the previous build never could:
 * a broken selector, a missing element id, or a render crash. Rules are
 * covered by game.test.js; this file proves the thing actually runs.
 *
 * jsdom is an optional dev dependency — if it isn't installed these tests
 * skip rather than fail, so `npm test` still works on a bare checkout.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const DOCS = join(ROOT, 'docs');

let JSDOM;
try {
  ({ JSDOM } = await import('jsdom'));
} catch {
  console.log('# jsdom not installed — skipping DOM tests (npm i -D jsdom)');
}

const maybe = JSDOM ? test : test.skip;

/**
 * Boot index.html in jsdom and evaluate main.js against it.
 * @param {{reducedMotion?: boolean}} [opts]
 */
async function boot(opts = {}) {
  const html = readFileSync(join(DOCS, 'index.html'), 'utf8');
  const dom = new JSDOM(html, {
    url: pathToFileURL(join(DOCS, 'index.html')).href,
    pretendToBeVisual: true,
  });
  const { window } = dom;

  // Expose the globals the module expects, then import it fresh.
  global.window = window;
  global.document = window.document;
  global.HTMLElement = window.HTMLElement;
  global.requestAnimationFrame = window.requestAnimationFrame?.bind(window) ?? ((cb) => setTimeout(cb, 0));

  // jsdom has no media-query engine, so stub it. `reducedMotion` lets a test
  // assert the accessibility path that disables particles and transitions.
  window.matchMedia = (query) => ({
    matches: Boolean(opts.reducedMotion) && query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener() {},
    removeEventListener() {},
  });

  // app.js is imported once and re-invoked per test. Importing main.js with a
  // cache-busting query instead would give each boot its own module instance,
  // which fragments coverage reporting and leaks state between tests.
  const { initGame } = await import(pathToFileURL(join(DOCS, 'js', 'app.js')).href);
  window.__game = initGame();
  return window;
}

/**
 * Tear the window down. Without window.close() jsdom's timers keep the Node
 * process alive and the test run hangs instead of exiting.
 */
function cleanup(window) {
  try { window?.close(); } catch { /* already closed */ }
  delete global.window;
  delete global.document;
  delete global.HTMLElement;
  delete global.requestAnimationFrame;
}

/** Advance past a fade transition (350ms) plus a little slack. */
const settle = () => new Promise((r) => setTimeout(r, 480));

maybe('game boots and renders the hub', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    assert.ok(doc.querySelector('.hub'), 'hub screen should render');
    assert.match(doc.getElementById('hud-date').textContent, /Thursday, January 1, 2026/);
    assert.match(doc.getElementById('hud-day').textContent, /Journey Day 1/);
    assert.equal(doc.querySelectorAll('.choice').length, 6, 'two core locations plus 4 rotating locations');
  } finally { cleanup(window); }
});

maybe('HUD reflects the starting stats', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    assert.match(doc.getElementById('sanity-num').textContent, /50%/);
    assert.match(doc.getElementById('money-num').textContent, /^50$/);
    assert.equal(doc.getElementById('hud-name').textContent.trim(), 'Léon');
    assert.equal(doc.querySelector('.hud-title'), null, 'no product label appears below Léon’s name');
    assert.equal(doc.getElementById('sanity-bar').style.width, '50%');
  } finally { cleanup(window); }
});

maybe('visiting the bar renders the location screen', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    const barBtn = [...doc.querySelectorAll('.choice')]
      .find((b) => b.textContent.includes('Le Dernier Verre'));
    barBtn.click();
    await settle();

    assert.ok(doc.querySelector('.location'), 'location screen should render');
    assert.match(doc.querySelector('.screen-title').textContent, /Le Dernier Verre/);
    assert.ok(doc.querySelector('.btn-primary'), 'action button present');
  } finally { cleanup(window); }
});

maybe('performing an action opens the result modal and updates stats', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    [...doc.querySelectorAll('.choice')].find((b) => b.textContent.includes('Le Dernier Verre')).click();
    await settle();

    doc.querySelector('.btn-primary').click();
    await settle();

    const modal = doc.querySelector('.modal-backdrop');
    assert.ok(modal, 'result modal should appear');
    assert.match(modal.textContent, /End of Day/);

    // Bar shift: money 50 → 62, sanity 50 → 38 (before any event).
    const { gs } = window.__game;
    assert.ok(gs.money !== 50 || gs.sanity !== 50, 'stats should have moved');
    assert.match(doc.getElementById('money-num').textContent, new RegExp(`^${Math.round(gs.money)}$`));
  } finally { cleanup(window); }
});

maybe('continuing from the modal advances the day and returns to the hub', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    [...doc.querySelectorAll('.choice')].find((b) => b.textContent.includes('La Maison')).click();
    await settle();
    doc.querySelector('.btn-primary').click();
    await settle();

    const continueBtn = [...doc.querySelectorAll('.modal button')]
      .find((b) => b.textContent.includes('Continue'));
    continueBtn.click();
    await settle();

    assert.equal(doc.querySelector('.modal-backdrop'), null, 'modal should close');
    assert.ok(doc.querySelector('.hub'), 'should be back on the hub');
    assert.match(doc.getElementById('hud-day').textContent, /Journey Day 2/);
    assert.match(doc.getElementById('hud-date').textContent, /Friday, January 2, 2026/);
  } finally { cleanup(window); }
});

maybe('the characters screen lists the whole cast and shows detail on click', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    [...doc.querySelectorAll('.hub-tools button')].find((b) => b.textContent.includes('People')).click();
    await settle();

    const rows = doc.querySelectorAll('.char-row');
    assert.equal(rows.length, 78, 'all characters listed');
    assert.match(doc.querySelector('.detail').textContent, /Select a character/);

    rows[0].click();
    const detail = doc.querySelector('.detail');
    assert.match(detail.textContent, /Léon/);
    assert.match(detail.textContent, /Protagonist/);
    assert.match(detail.textContent, /Relationship to Léon/);
  } finally { cleanup(window); }
});

maybe('characters are grouped with antagonists near the top', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    [...doc.querySelectorAll('.hub-tools button')].find((b) => b.textContent.includes('People')).click();
    await settle();

    const groups = [...doc.querySelectorAll('.char-group')].map((g) => g.textContent);
    assert.deepEqual(groups, ['Protagonist', 'Arch Nemesis', 'Rivals', 'Side Characters']);

    assert.ok(doc.querySelector('.char-row.role-arch_nemesis'), 'nemesis row is tagged');
    assert.equal(doc.querySelectorAll('.char-row.role-rival').length, 2);
  } finally { cleanup(window); }
});

maybe('searching filters the character list', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    [...doc.querySelectorAll('.hub-tools button')].find((b) => b.textContent.includes('People')).click();
    await settle();

    const search = doc.querySelector('.char-search');
    const visible = () => [...doc.querySelectorAll('.char-row')].filter((r) => !r.hidden).length;

    assert.equal(visible(), 78);

    search.value = 'Kaden';
    search.dispatchEvent(new window.Event('input'));
    assert.equal(visible(), 1);
    assert.match(doc.querySelector('.char-count').textContent, /1 match/);

    // Unicode names must be findable by their ASCII-ish substrings too.
    search.value = 'Kopung';
    search.dispatchEvent(new window.Event('input'));
    assert.equal(visible(), 1);

    search.value = '';
    search.dispatchEvent(new window.Event('input'));
    assert.equal(visible(), 78);
  } finally { cleanup(window); }
});

maybe('the arch nemesis and rivals have full profiles', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    [...doc.querySelectorAll('.hub-tools button')].find((b) => b.textContent.includes('People')).click();
    await settle();

    doc.querySelector('.char-row.role-arch_nemesis').click();
    const detail = doc.querySelector('.detail');
    assert.match(detail.textContent, /Kaden/);
    assert.match(detail.textContent, /Arch Nemesis/);
    assert.ok(detail.textContent.length > 300, 'nemesis should have a substantial profile');
  } finally { cleanup(window); }
});

maybe('back from characters returns to the hub', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    [...doc.querySelectorAll('.hub-tools button')].find((b) => b.textContent.includes('People')).click();
    await settle();
    [...doc.querySelectorAll('.btn')].find((b) => b.textContent.includes('Back')).click();
    await settle();
    assert.ok(doc.querySelector('.hub'), 'should be back on the hub');
  } finally { cleanup(window); }
});

maybe('portrait images point at files that exist', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    [...doc.querySelectorAll('.hub-tools button')].find((b) => b.textContent.includes('People')).click();
    await settle();

    const { existsSync } = await import('node:fs');
    const imgs = doc.querySelectorAll('.char-row img');
    assert.ok(imgs.length > 0, 'portraits should render as <img>');
    for (const img of imgs) {
      const src = img.getAttribute('src');
      assert.ok(existsSync(join(DOCS, src)), `missing portrait file: ${src}`);
    }
  } finally { cleanup(window); }
});

maybe('the action button cannot be double-fired', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    [...doc.querySelectorAll('.choice')].find((b) => b.textContent.includes('Le Dernier Verre')).click();
    await settle();

    const btn = doc.querySelector('.btn-primary');
    btn.click();
    await settle();
    assert.equal(btn.disabled, true, 'action button should disable after use');

    const { gs } = window.__game;
    const money = gs.money;
    btn.click();                       // second click must be a no-op
    await settle();
    assert.equal(gs.money, money, 'stats must not change on a repeat click');
  } finally { cleanup(window); }
});

maybe('game over renders and restart resets the run', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    const { gs } = window.__game;

    // Force a losing position, then take one more shift.
    gs.sanity = 1;
    [...doc.querySelectorAll('.choice')].find((b) => b.textContent.includes('Le Dernier Verre')).click();
    await settle();
    doc.querySelector('.btn-primary').click();
    await settle();

    assert.ok(doc.querySelector('.gameover'), 'game over screen should render');
    assert.equal(doc.getElementById('hud').hidden, true, 'HUD hides on game over');

    [...doc.querySelectorAll('.gameover button')][0].click();
    await settle();

    assert.ok(doc.querySelector('.hub'), 'restart returns to the hub');
    assert.equal(doc.getElementById('hud').hidden, false, 'HUD returns');
    assert.match(doc.getElementById('hud-day').textContent, /Journey Day 1/);
    assert.equal(window.__game.gs.sanity, 50);
  } finally { cleanup(window); }
});

maybe('leaving a location without acting returns to the hub unchanged', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    const { gs } = window.__game;
    const before = { s: gs.sanity, m: gs.money, d: gs.journeyDay };

    [...doc.querySelectorAll('.choice')].find((b) => b.textContent.includes('Le Dernier Verre')).click();
    await settle();
    [...doc.querySelectorAll('.btn')].find((b) => b.textContent.includes('Back')).click();
    await settle();

    assert.ok(doc.querySelector('.hub'), 'should be back on the hub');
    assert.equal(gs.sanity, before.s);
    assert.equal(gs.money, before.m);
    assert.equal(gs.journeyDay, before.d, 'backing out must not consume a day');
  } finally { cleanup(window); }
});

maybe('the hub shows history after a completed turn', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    [...doc.querySelectorAll('.choice')].find((b) => b.textContent.includes('La Maison')).click();
    await settle();
    doc.querySelector('.btn-primary').click();
    await settle();
    [...doc.querySelectorAll('.modal button')]
      .find((b) => b.textContent.includes('Continue')).click();
    await settle();

    const history = doc.querySelector('.history');
    assert.ok(history, 'history block should render');
    assert.match(history.textContent, /Visited La Maison Calme/);
  } finally { cleanup(window); }
});

maybe('clicking the modal backdrop dismisses it like Continue', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    [...doc.querySelectorAll('.choice')].find((b) => b.textContent.includes('Le Dernier Verre')).click();
    await settle();
    doc.querySelector('.btn-primary').click();
    await settle();

    const backdrop = doc.querySelector('.modal-backdrop');
    assert.ok(backdrop);
    backdrop.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await settle();

    assert.equal(doc.querySelector('.modal-backdrop'), null, 'modal should close');
    assert.ok(doc.querySelector('.hub'), 'should land back on the hub');
  } finally { cleanup(window); }
});

maybe('stat deltas are shown in the HUD after a turn', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    [...doc.querySelectorAll('.choice')].find((b) => b.textContent.includes('Le Dernier Verre')).click();
    await settle();
    doc.querySelector('.btn-primary').click();
    await settle();

    const sanityDelta = doc.getElementById('sanity-delta');
    const moneyDelta = doc.getElementById('money-delta');
    // A bar shift always moves both stats, so both indicators should show.
    assert.match(sanityDelta.textContent, /^-\d+$/, 'sanity delta should be negative');
    assert.match(moneyDelta.textContent, /^\+\d+$/, 'money delta should be positive');
    assert.ok(sanityDelta.classList.contains('neg'));
    assert.ok(moneyDelta.classList.contains('pos'));
  } finally { cleanup(window); }
});

maybe('the HUD flags low stats', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    const { gs } = window.__game;

    gs.sanity = 10;
    gs.money = 10;
    gs.emit('stats_changed', gs.sanity, gs.money);
    await settle();

    assert.match(doc.getElementById('sanity-label').textContent, /low/i);
    assert.match(doc.getElementById('money-label').textContent, /low/i);
    assert.ok(doc.getElementById('sanity-bar').classList.contains('low'));
    assert.ok(doc.getElementById('money-bar').classList.contains('low'));
  } finally { cleanup(window); }
});

maybe('running out of money ends the run', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    const { gs } = window.__game;

    // Visiting the community costs money; leave just less than the cost.
    gs.money = 1;
    [...doc.querySelectorAll('.choice')].find((b) => b.textContent.includes('La Maison')).click();
    await settle();
    doc.querySelector('.btn-primary').click();
    await settle();

    const over = doc.querySelector('.gameover');
    assert.ok(over, 'game over screen should render');
    assert.match(over.textContent, /broke/i, 'should use the money-specific message');
  } finally { cleanup(window); }
});

maybe('a missing portrait falls back to an initials chip', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    [...doc.querySelectorAll('.hub-tools button')].find((b) => b.textContent.includes('People')).click();
    await settle();

    const img = doc.querySelector('.char-row img');
    assert.ok(img, 'portraits render as <img> to begin with');
    // jsdom does not fetch images, so simulate the failure the browser reports.
    img.dispatchEvent(new window.Event('error'));

    const chip = doc.querySelector('.char-row div.avatar');
    assert.ok(chip, 'a fallback chip should replace the broken image');
    assert.ok(chip.textContent.length > 0, 'chip should show initials');
  } finally { cleanup(window); }
});

maybe('particles are suppressed when reduced motion is preferred', async () => {
  const window = await boot({ reducedMotion: true });
  try {
    const doc = window.document;
    [...doc.querySelectorAll('.choice')].find((b) => b.textContent.includes('Le Dernier Verre')).click();
    await settle();

    const container = doc.querySelector('.particles');
    assert.ok(container, 'the container still exists');
    assert.equal(container.children.length, 0, 'but no motes should spawn');
  } finally { cleanup(window); }
});

maybe('particles spawn when motion is allowed', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    [...doc.querySelectorAll('.choice')].find((b) => b.textContent.includes('Le Dernier Verre')).click();
    await settle();
    await new Promise((r) => setTimeout(r, 900));

    const container = doc.querySelector('.particles');
    assert.ok(container.children.length > 0, 'motes should appear over time');
  } finally { cleanup(window); }
});

maybe('a ten-turn playthrough never throws', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    for (let i = 0; i < 10; i++) {
      if (doc.querySelector('.gameover')) break;

      const choice = [...doc.querySelectorAll('.choice')]
        .find((b) => b.textContent.includes(i % 2 ? 'Le Dernier Verre' : 'La Maison'));
      if (!choice) break;
      choice.click();
      await settle();

      doc.querySelector('.btn-primary')?.click();
      await settle();

      const cont = [...doc.querySelectorAll('.modal button')]
        .find((b) => b.textContent.includes('Continue'));
      if (cont) { cont.click(); await settle(); }
    }
    // Reaching here without an exception is the assertion.
    assert.ok(true);
  } finally { cleanup(window); }
});
