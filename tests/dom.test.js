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

/** Boot index.html in jsdom and evaluate main.js against it. */
async function boot() {
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

  if (!window.matchMedia) {
    window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  }

  // Cache-bust so each boot gets a clean module instance.
  await import(`${pathToFileURL(join(DOCS, 'js', 'main.js')).href}?t=${Date.now()}${Math.random()}`);
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
    assert.equal(doc.querySelectorAll('.choice').length, 3, 'three hub choices');
  } finally { cleanup(window); }
});

maybe('HUD reflects the starting stats', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    assert.match(doc.getElementById('sanity-num').textContent, /50 \/ 100/);
    assert.match(doc.getElementById('money-num').textContent, /50 \/ 100/);
    assert.equal(doc.getElementById('sanity-bar').style.width, '50%');
  } finally { cleanup(window); }
});

maybe('visiting the bar renders the location screen', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    const barBtn = [...doc.querySelectorAll('.choice')]
      .find((b) => b.textContent.includes('The Bar'));
    barBtn.click();
    await settle();

    assert.ok(doc.querySelector('.location'), 'location screen should render');
    assert.match(doc.querySelector('.screen-title').textContent, /The Bar/);
    assert.ok(doc.querySelector('.btn-primary'), 'action button present');
  } finally { cleanup(window); }
});

maybe('performing an action opens the result modal and updates stats', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    [...doc.querySelectorAll('.choice')].find((b) => b.textContent.includes('The Bar')).click();
    await settle();

    doc.querySelector('.btn-primary').click();
    await settle();

    const modal = doc.querySelector('.modal-backdrop');
    assert.ok(modal, 'result modal should appear');
    assert.match(modal.textContent, /End of Day/);

    // Bar shift: money 50 → 62, sanity 50 → 38 (before any event).
    const { gs } = window.__game;
    assert.ok(gs.money !== 50 || gs.sanity !== 50, 'stats should have moved');
    assert.match(doc.getElementById('money-num').textContent, new RegExp(`${Math.round(gs.money)} / 100`));
  } finally { cleanup(window); }
});

maybe('continuing from the modal advances the day and returns to the hub', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    [...doc.querySelectorAll('.choice')].find((b) => b.textContent.includes('Spiritual')).click();
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

maybe('the characters screen lists all 14 people and shows detail on click', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    [...doc.querySelectorAll('.choice')].find((b) => b.textContent.includes('Characters')).click();
    await settle();

    const rows = doc.querySelectorAll('.char-row');
    assert.equal(rows.length, 14, 'all characters listed');
    assert.match(doc.querySelector('.detail').textContent, /Select a character/);

    rows[0].click();
    const detail = doc.querySelector('.detail');
    assert.match(detail.textContent, /Léon/);
    assert.match(detail.textContent, /Protagonist/);
    assert.match(detail.textContent, /Relationship to Léon/);
  } finally { cleanup(window); }
});

maybe('back from characters returns to the hub', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    [...doc.querySelectorAll('.choice')].find((b) => b.textContent.includes('Characters')).click();
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
    [...doc.querySelectorAll('.choice')].find((b) => b.textContent.includes('Characters')).click();
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
    [...doc.querySelectorAll('.choice')].find((b) => b.textContent.includes('The Bar')).click();
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
    [...doc.querySelectorAll('.choice')].find((b) => b.textContent.includes('The Bar')).click();
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

maybe('a ten-turn playthrough never throws', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    for (let i = 0; i < 10; i++) {
      if (doc.querySelector('.gameover')) break;

      const choice = [...doc.querySelectorAll('.choice')]
        .find((b) => b.textContent.includes(i % 2 ? 'The Bar' : 'Spiritual'));
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
