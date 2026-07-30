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
  window.__game = initGame({ fadeMs: 0, toastMs: 50, ...opts });
  return window;
}

function cleanup(window) {
  try { window?.close(); } catch { /* already closed */ }
  delete global.window;
  delete global.document;
  delete global.HTMLElement;
  delete global.requestAnimationFrame;
}

const settle = () => new Promise((r) => setTimeout(r, 10));

maybe('clicking the HUD portrait enlarges the picture and nothing else', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    assert.equal(doc.querySelector('.portrait-popup-backdrop'), null, 'no popup at boot');

    doc.getElementById('hud-portrait-btn').click();

    const popup = doc.querySelector('.portrait-popup-backdrop');
    assert.ok(popup, 'popup should appear');

    const img = popup.querySelector('img.portrait-full');
    assert.ok(img, 'the popup should contain the enlarged portrait');
    assert.match(img.getAttribute('src'), /leon/);

    // Closing it removes it and does not touch game state.
    const { gs } = window.__game;
    const dayBefore = gs.journeyDay;
    popup.querySelector('.portrait-close').click();
    assert.equal(doc.querySelector('.portrait-popup-backdrop'), null, 'popup should close');
    assert.equal(gs.journeyDay, dayBefore, 'closing the popup must not advance the day');
  } finally { cleanup(window); }
});

maybe('the portrait popup shows no name, role, bio or relationship text', async () => {
  // The whole point of the popup is that the little avatar is a preview of a
  // picture. Any prose here would make it a character sheet again.
  const window = await boot();
  try {
    const doc = window.document;
    doc.getElementById('hud-portrait-btn').click();
    const popup = doc.querySelector('.portrait-popup-backdrop');

    const visible = popup.textContent.replace(/[×\s]/g, '');
    assert.equal(visible, '', `popup should render no text, got ${JSON.stringify(popup.textContent)}`);

    const leon = window.__game.gs.getAllCharacters().find((c) => c.id === 'leon');
    assert.ok(!popup.textContent.includes(leon.bio), 'bio must not be shown');
    assert.ok(!popup.textContent.includes(leon.relationship), 'relationship must not be shown');
    assert.ok(!popup.textContent.includes('Protagonist'), 'role must not be shown');
    assert.equal(popup.querySelector('h3'), null, 'no heading in the popup');
    assert.equal(popup.querySelector('dl'), null, 'no definition list in the popup');
    assert.equal(popup.querySelector('p'), null, 'no paragraph in the popup');
  } finally { cleanup(window); }
});

maybe('the popup loads the hi-res sheet, not the inline thumbnail', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    const inlineSrc = doc.getElementById('hud-portrait').getAttribute('src');

    doc.getElementById('hud-portrait-btn').click();
    const img = doc.querySelector('.portrait-full');

    assert.match(img.getAttribute('src'), /portraits\/hi\//, 'should use the hi tier');
    assert.notEqual(img.getAttribute('src'), inlineSrc, 'must not just reuse the thumbnail');
  } finally { cleanup(window); }
});

maybe('a missing hi-res sheet falls back to the thumbnail once', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    doc.getElementById('hud-portrait-btn').click();
    const img = doc.querySelector('.portrait-full');
    const hiSrc = img.getAttribute('src');

    // jsdom never actually loads images, so drive the error path directly.
    img.dispatchEvent(new window.Event('error'));
    const after = img.getAttribute('src');
    assert.notEqual(after, hiSrc, 'should swap away from the missing hi sheet');
    assert.match(after, /assets\/portraits\/leon\.webp$/, 'falls back to the thumbnail');

    // A second failure must not loop back round to the hi sheet.
    img.dispatchEvent(new window.Event('error'));
    assert.equal(img.getAttribute('src'), after, 'fallback should not re-trigger');
  } finally { cleanup(window); }
});

maybe('tapping the enlarged picture itself dismisses it', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    doc.getElementById('hud-portrait-btn').click();
    const img = doc.querySelector('.portrait-full');
    assert.ok(img);

    img.dispatchEvent(new window.Event('click', { bubbles: true }));
    assert.equal(doc.querySelector('.portrait-popup-backdrop'), null, 'tapping the art closes it');
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

maybe('the location host banner portrait enlarges that host\u2019s picture', async () => {
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
    // Identity is carried by the image, not by any visible caption.
    const img = popup.querySelector('.portrait-full');
    assert.match(img.getAttribute('src'), /barret/);
    assert.match(img.getAttribute('alt'), /Barret/);
    assert.equal(popup.textContent.replace(/[×\s]/g, ''), '', 'still image-only');
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

maybe('re-opening the popup does not accumulate document keydown listeners', async () => {
  const window = await boot();
  const { profileFor } = await import(
    pathToFileURL(join(DOCS, 'js', 'data', 'characters.js')).href
  ).then((m) => ({ profileFor: (id) => m.createAllProfiles().find((p) => p.id === id) }));
  const { openCharacterPopup } = await import(
    pathToFileURL(join(DOCS, 'js', 'ui', 'screens.js')).href
  );

  const doc = window.document;
  let added = 0;
  let removed = 0;
  const origAdd = doc.addEventListener.bind(doc);
  const origRemove = doc.removeEventListener.bind(doc);
  doc.addEventListener = (type, ...rest) => {
    if (type === 'keydown') added += 1;
    return origAdd(type, ...rest);
  };
  doc.removeEventListener = (type, ...rest) => {
    if (type === 'keydown') removed += 1;
    return origRemove(type, ...rest);
  };

  const leon = profileFor('leon');
  // Normalise module state first: another test may have left a popup (and its
  // tracked close handler) behind; flush it so the counts below are exact.
  openCharacterPopup(leon);
  doc.querySelector('.portrait-popup-backdrop .portrait-close')?.click();
  added = 0;
  removed = 0;

  for (let i = 0; i < 5; i += 1) openCharacterPopup(leon);
  doc.querySelector('.portrait-popup-backdrop .portrait-close')?.click();
  doc.addEventListener = origAdd;
  doc.removeEventListener = origRemove;

  assert.equal(doc.querySelectorAll('.portrait-popup-backdrop').length, 0, 'popup closed');
  assert.ok(added >= 5, `each open registers one keydown listener (saw ${added})`);
  assert.equal(removed, added, 'every keydown listener must be removed on close — no leak');
  cleanup(window);
});
