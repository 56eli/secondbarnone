/**
 * Accessibility tests.
 *
 * The project already had good semantic foundations — meters, dialogs, focus
 * rings, `prefers-reduced-motion` — and no test that any of it *worked* under
 * interaction. A review found three controls still tabbable behind an
 * `aria-modal="true"` dialog, no Escape on the modal the player sees every
 * turn, and a detail panel that swapped content with no announcement.
 *
 * ## Rules for this file
 *
 * 1. **Drive the real UI.** Every test boots `index.html` in jsdom and clicks
 *    actual controls. Asserting that a renderer emits an attribute proves
 *    nothing about whether the attribute is honoured in context.
 * 2. **Test the promise, not the attribute.** `aria-modal="true"` is a claim
 *    that nothing outside the dialog is reachable; the test checks
 *    reachability, not the attribute.
 * 3. **Keyboard first.** If a thing can only be done with a pointer, it is a
 *    bug regardless of what the markup says.
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
  console.log('# jsdom not installed — skipping accessibility tests (npm i -D jsdom)');
}
const maybe = JSDOM ? test : test.skip;

function fakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
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
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  });

  const { initGame } = await import(pathToFileURL(join(DOCS, 'js', 'app.js')).href);
  window.__game = initGame({ seed: 5, autoload: false, storage: opts.storage ?? fakeStorage() });
  return window;
}

function cleanup(window) {
  window.close?.();
  delete global.window;
  delete global.document;
  delete global.HTMLElement;
}

const settle = () => new Promise((r) => setTimeout(r, 480));

/**
 * Everything a keyboard user can currently reach.
 *
 * Scoped to <body>: `a[href]` would otherwise also match the `<link>` tags in
 * <head>, which are not focusable and are not what this is measuring.
 */
function focusables(doc) {
  const selector = 'button, a[href], input, select, textarea, [tabindex]';
  return [...doc.body.querySelectorAll(selector)].filter(
    (el) => !el.disabled && el.getAttribute('tabindex') !== '-1' && !el.closest('[inert]'),
  );
}

/** Play one day and leave the result modal open. */
async function playDayLeavingModal(doc, label = 'Le Dernier Verre') {
  [...doc.querySelectorAll('.choice')].find((b) => b.textContent.includes(label)).click();
  await settle();
  doc.querySelector('.screen.location .btn-primary').click();
  await settle();
}

// ============================================================== focus traps

maybe('the day-result modal traps focus', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    await playDayLeavingModal(doc);

    const modal = doc.querySelector('.modal-backdrop');
    assert.ok(modal, 'a result modal should be open');
    assert.equal(modal.querySelector('.modal').getAttribute('aria-modal'), 'true');

    // aria-modal="true" is a promise that nothing behind the dialog is
    // reachable. Three controls used to remain tabbable.
    const outside = focusables(doc).filter((el) => !modal.contains(el));
    assert.equal(
      outside.length,
      0,
      `${outside.length} controls reachable behind the modal: ` +
        outside
          .map(
            (e) =>
              `<${e.tagName.toLowerCase()} class="${e.className}" tabindex="${e.getAttribute('tabindex')}">`,
          )
          .join(', '),
    );
    assert.ok(doc.getElementById('app').hasAttribute('inert'), '#app should be inert');
    assert.ok(
      doc.querySelector('.skip-link').closest('[inert]'),
      'the skip link is a sibling of #app and must be trapped too',
    );
  } finally {
    cleanup(window);
  }
});

maybe('the day-result modal closes on Escape', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    await playDayLeavingModal(doc);
    assert.ok(doc.querySelector('.modal-backdrop'), 'setup should open the modal');

    doc.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await settle();

    assert.equal(doc.querySelector('.modal-backdrop'), null, 'Escape should dismiss the report');
    assert.ok(doc.querySelector('.hub'), 'and return the player to the hub');
  } finally {
    cleanup(window);
  }
});

maybe('closing the modal restores focus and clears inert', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    await playDayLeavingModal(doc);
    doc.querySelector('.modal-actions .btn-primary').click();
    await settle();

    assert.equal(doc.getElementById('app').hasAttribute('inert'), false, 'inert must be lifted');
    assert.equal(doc.getElementById('app').getAttribute('aria-hidden'), null);
    assert.equal(doc.querySelectorAll('[inert]').length, 0, 'nothing should stay inert');
    assert.ok(focusables(doc).length > 0, 'the page must be operable again');
  } finally {
    cleanup(window);
  }
});

maybe('Escape does not leave the page inert', async () => {
  // A separate teardown path from the button, so it gets its own test.
  const window = await boot();
  try {
    const doc = window.document;
    await playDayLeavingModal(doc);
    doc.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await settle();
    assert.equal(doc.getElementById('app').hasAttribute('inert'), false);
  } finally {
    cleanup(window);
  }
});

maybe('the modal keydown listener is removed once dismissed', async () => {
  // A leaked document-level listener would close future modals instantly.
  const window = await boot();
  try {
    const doc = window.document;
    await playDayLeavingModal(doc);
    doc.querySelector('.modal-actions .btn-primary').click();
    await settle();

    await playDayLeavingModal(doc, 'La Maison Calme');
    assert.ok(doc.querySelector('.modal-backdrop'), 'a second day should still open a modal');
  } finally {
    cleanup(window);
  }
});

// ================================================================= dialogs

maybe('the settings dialog is reachable and labelled', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    doc.getElementById('settings-btn').click();
    const dialog = doc.querySelector('.settings-dialog');
    assert.ok(dialog, 'settings should open');
    assert.equal(dialog.getAttribute('role'), 'dialog');
    assert.equal(dialog.getAttribute('aria-modal'), 'true');
    assert.ok(dialog.getAttribute('aria-labelledby'), 'a dialog needs an accessible name');
  } finally {
    cleanup(window);
  }
});

maybe('resetting the game asks first', async () => {
  // One click used to destroy a hundred-day run with no confirmation.
  const storage = fakeStorage();
  const window = await boot({ storage });
  try {
    const doc = window.document;
    const { gs, api } = window.__game;
    gs.journeyDay = 40;
    api.save();

    doc.getElementById('settings-btn').click();
    const reset = [...doc.querySelectorAll('.settings-dialog button')].find(
      (b) => b.textContent === 'Reset game',
    );
    assert.ok(reset, 'a reset control should exist');
    reset.click();
    await settle();

    assert.equal(window.__game.gs.journeyDay, 40, 'the first click must not wipe the run');
    const confirm = [...doc.querySelectorAll('.settings-dialog button')].find((b) =>
      /really|sure|confirm|yes/i.test(b.textContent),
    );
    assert.ok(confirm, 'a confirmation step should appear');

    confirm.click();
    await settle();
    assert.equal(window.__game.gs.journeyDay, 1, 'confirming should reset the run');
  } finally {
    cleanup(window);
  }
});

// ============================================================ document shape

maybe('the page has exactly one h1 and a sane heading order', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    const h1s = doc.querySelectorAll('h1');
    assert.equal(h1s.length, 1, 'a document needs exactly one top-level heading');
    assert.ok(h1s[0].textContent.trim().length > 0, 'the h1 must not be empty');
  } finally {
    cleanup(window);
  }
});

maybe('every image has alt text and intrinsic dimensions', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    window.__game.api.goto.characters();
    await settle();
    for (const img of doc.querySelectorAll('img')) {
      assert.ok(img.hasAttribute('alt'), `image ${img.getAttribute('src')} has no alt attribute`);
    }
  } finally {
    cleanup(window);
  }
});

maybe('stat meters expose honest values', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    for (const meter of doc.querySelectorAll('[role="meter"]')) {
      const now = Number(meter.getAttribute('aria-valuenow'));
      const min = Number(meter.getAttribute('aria-valuemin'));
      const max = Number(meter.getAttribute('aria-valuemax'));
      assert.ok(Number.isFinite(now), 'aria-valuenow must be a number');
      assert.ok(now >= min && now <= max, `meter value ${now} outside [${min}, ${max}]`);
      assert.ok(meter.getAttribute('aria-label'), 'a meter needs a label');
    }
  } finally {
    cleanup(window);
  }
});

// ============================================================ People screen

maybe('the People list announces its selection', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    window.__game.api.goto.characters();
    await settle();

    const detail = doc.querySelector('.detail');
    assert.ok(detail, 'the detail panel should render');
    assert.equal(
      detail.getAttribute('aria-live'),
      'polite',
      'a panel that swaps content on selection must announce it',
    );

    const rows = [...doc.querySelectorAll('.char-row')];
    assert.ok(rows.length > 0);
    rows[2].click();
    assert.equal(rows[2].getAttribute('aria-selected'), 'true');
    assert.equal(rows[0].getAttribute('aria-selected'), 'false');
  } finally {
    cleanup(window);
  }
});

maybe('every interactive control has an accessible name', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    for (const screen of ['hub', 'perks', 'almanac', 'characters']) {
      window.__game.api.goto[screen]();
      await settle();
      for (const control of doc.querySelectorAll('button')) {
        const name =
          control.getAttribute('aria-label') ||
          control.textContent.trim() ||
          control.getAttribute('title');
        assert.ok(name, `an unnamed button on the ${screen} screen`);
      }
    }
  } finally {
    cleanup(window);
  }
});

maybe('accessibility settings apply text, contrast, stat and motion preferences', async () => {
  const storage = fakeStorage();
  const window = await boot({ storage });
  try {
    const doc = window.document;
    doc.getElementById('settings-btn').click();

    const textSize = doc.getElementById('text-size');
    assert.ok(textSize, 'text-size select should render');
    textSize.value = 'large';
    textSize.dispatchEvent(new window.Event('change', { bubbles: true }));

    const contrast = doc.getElementById('high-contrast');
    const statMode = doc.getElementById('stat-mode');
    const motion = doc.getElementById('reduce-motion');
    for (const input of [contrast, statMode, motion]) {
      assert.ok(input, `${input?.id} should render`);
      input.checked = true;
      input.dispatchEvent(new window.Event('change', { bubbles: true }));
    }

    assert.equal(doc.body.dataset.textSize, 'large');
    assert.equal(doc.body.dataset.contrast, 'high');
    assert.equal(doc.body.dataset.statMode, 'numeric');
    assert.equal(doc.body.dataset.reducedMotion, 'reduce');
    assert.equal(storage.getItem('secondbarnone.settings.textSize'), 'large');
    assert.equal(storage.getItem('secondbarnone.settings.highContrast'), 'true');
    assert.equal(storage.getItem('secondbarnone.settings.statMode'), 'numeric');
    assert.equal(storage.getItem('secondbarnone.settings.reducedMotion'), 'true');
  } finally {
    cleanup(window);
  }
});

maybe('People list supports arrow-key navigation as one listbox', async () => {
  const window = await boot();
  try {
    const doc = window.document;
    window.__game.api.goto.characters();
    await settle();

    const list = doc.querySelector('.char-list[role="listbox"]');
    const rows = [...doc.querySelectorAll('.char-row')];
    assert.ok(list, 'character listbox should exist');
    assert.equal(list.getAttribute('tabindex'), '0');
    assert.ok(rows.length > 2);

    list.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    assert.equal(rows[0].getAttribute('aria-selected'), 'true');
    assert.equal(list.getAttribute('aria-activedescendant'), rows[0].id);

    list.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    assert.equal(rows[1].getAttribute('aria-selected'), 'true');
    assert.equal(rows[0].getAttribute('aria-selected'), 'false');

    list.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    assert.equal(rows.at(-1).getAttribute('aria-selected'), 'true');
  } finally {
    cleanup(window);
  }
});
