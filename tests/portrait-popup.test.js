/**
 * DOM tests for clickable/tappable character portraits.
 *
 * Every portrait in the game (HUD, location host banner, map host chips,
 * People rows/detail, event modal) should surface a small read-only popup
 * with the character's bio when clicked or tapped, without touching game
 * state or navigating away from the current screen.
 *
 * Boots the real index.html in jsdom and drives real buttons/clicks, same
 * approach as dom.test.js and ui.test.js. jsdom is an optional dev
 * dependency, so these skip rather than fail on a bare checkout.
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
  console.log('# jsdom not installed — skipping portrait popup tests (npm i -D jsdom)');
}

const maybe = JSDOM ? test : test.skip;

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
  window.__game = initGame(opts);
  return window;
}

function cleanup(window) {
  try { window?.close(); } catch { /* already closed */ }
  delete global.window;
  delete global.document;
  delete global.HTMLElement;
  delete global.requestAnimationFrame;
}

const settle = () => new Promise((r) => setTimeout(r, 480));

maybe('clicking the HUD portrait opens a popup with Léon\u2019s bio', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    assert.equal(doc.querySelector('.portrait-popup-backdrop'), null, 'no popup at boot');

    doc.getElementById('hud-portrait-btn').click();

    const popup = doc.querySelector('.portrait-popup-backdrop');
    assert.ok(popup, 'popup should appear');
    assert.match(popup.textContent, /Léon/);
    assert.match(popup.textContent, /Protagonist/);
    assert.match(popup.textContent, /Relationship to Léon/);

    // Closing it removes it and does not touch game state.
    const { gs } = window.__game;
    const dayBefore = gs.journeyDay;
    [...popup.querySelectorAll('button')].find((b) => b.textContent.includes('Close')).click();
    assert.equal(doc.querySelector('.portrait-popup-backdrop'), null, 'popup should close');
    assert.equal(gs.journeyDay, dayBefore, 'closing the popup must not advance the day');
  } finally { cleanup(window); }
});

maybe('clicking the backdrop dismisses the portrait popup, same as Close', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    doc.getElementById('hud-portrait-btn').click();
    const popup = doc.querySelector('.portrait-popup-backdrop');
    assert.ok(popup);

    // Dispatching directly on the backdrop element (not a bubbled child
    // click) makes event.target === backdrop, which is what the "close on
    // backdrop click, not on modal content click" handler checks for.
    popup.dispatchEvent(new window.Event('click', { bubbles: true }));
    assert.equal(doc.querySelector('.portrait-popup-backdrop'), null);
  } finally { cleanup(window); }
});

maybe('pressing Escape closes the portrait popup', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    doc.getElementById('hud-portrait-btn').click();
    assert.ok(doc.querySelector('.portrait-popup-backdrop'));

    doc.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
    assert.equal(doc.querySelector('.portrait-popup-backdrop'), null);
  } finally { cleanup(window); }
});

maybe('the location host banner portrait opens that host\u2019s popup', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    [...doc.querySelectorAll('.choice')].find((b) => b.textContent.includes('Le Dernier Verre')).click();
    await settle();

    const hostAvatarBtn = doc.querySelector('.host-banner .avatar-btn');
    assert.ok(hostAvatarBtn, 'host banner should render a clickable avatar');
    hostAvatarBtn.click();

    const popup = doc.querySelector('.portrait-popup-backdrop');
    assert.ok(popup, 'popup should appear for the host');
    assert.match(popup.textContent, /Barret/);
  } finally { cleanup(window); }
});

maybe('People rows open the popup instead of double-nesting a button', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    [...doc.querySelectorAll('.hub-tools button')].find((b) => b.textContent.includes('People')).click();
    await settle();

    // Rows themselves are buttons; the avatar inside must not also be one
    // (a <button> cannot legally contain another <button>).
    const row = doc.querySelector('.char-row');
    assert.ok(row, 'a character row should render');
    assert.equal(row.querySelector('button.avatar-btn'), null, 'no nested button inside a row');

    row.click();
    const detail = doc.querySelector('.detail');
    const detailAvatarBtn = detail.querySelector('.avatar-btn');
    assert.ok(detailAvatarBtn, 'the detail pane avatar should be clickable');

    detailAvatarBtn.click();
    const popup = doc.querySelector('.portrait-popup-backdrop');
    assert.ok(popup, 'clicking the detail avatar should open the popup');
  } finally { cleanup(window); }
});

maybe('the map\u2019s host chip does not nest a button inside the location card', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    window.__game.api.goto.map();

    const card = doc.querySelector('.loc-card');
    assert.ok(card, 'the map should render location cards');
    assert.equal(card.querySelector('button.avatar-btn'), null, 'no nested button inside a location card');
    // The host mini-avatar is still present, just not independently clickable.
    assert.ok(card.querySelector('.host-avatar'), 'the host mini-avatar should still render');
  } finally { cleanup(window); }
});

maybe('opening a second portrait popup replaces the first rather than stacking', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    doc.getElementById('hud-portrait-btn').click();
    assert.equal(doc.querySelectorAll('.portrait-popup-backdrop').length, 1);

    doc.getElementById('hud-portrait-btn').click();
    assert.equal(doc.querySelectorAll('.portrait-popup-backdrop').length, 1, 'still exactly one popup');
  } finally { cleanup(window); }
});

maybe('every clickable avatar button has an accessible label', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    [...doc.querySelectorAll('.hub-tools button')].find((b) => b.textContent.includes('People')).click();
    await settle();
    doc.querySelector('.char-row').click();

    const buttons = doc.querySelectorAll('.avatar-btn, #hud-portrait-btn');
    assert.ok(buttons.length > 0);
    for (const b of buttons) {
      assert.ok(b.getAttribute('aria-label'), 'avatar button should have an aria-label');
    }
  } finally { cleanup(window); }
});
