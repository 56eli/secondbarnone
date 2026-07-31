import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { PreferencesService } from '../docs/js/ui/preferences-service.js';
import { ModalController } from '../docs/js/ui/modal-controller.js';

function setupDom() {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: 'http://localhost',
  });
  const win = dom.window;
  global.window = win;
  global.document = win.document;
  global.HTMLElement = win.HTMLElement;
  return win;
}

function fakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

test('PreferencesService defaults music volume to 25% and loads stored settings', () => {
  const win = setupDom();
  const storage = fakeStorage();
  storage.setItem(
    'secondbarnone.settings.v1',
    JSON.stringify({ highContrast: true, volume: 0.8, musicOn: true }),
  );
  const defaults = new PreferencesService(fakeStorage(), win.document);
  assert.equal(defaults.preferences.volume, 0.25);
  const prefs = new PreferencesService(storage, win.document);
  assert.equal(prefs.preferences.highContrast, true);
  assert.equal(prefs.preferences.volume, 0.8);
  assert.equal(prefs.preferences.sound, true);
});

test('PreferencesService clamps malformed persisted values before touching audio', () => {
  const win = setupDom();
  const storage = fakeStorage();
  storage.setItem(
    'secondbarnone.settings.v1',
    JSON.stringify({ highContrast: 'yes', reducedMotion: 1, sound: true, volume: 5 }),
  );
  const prefs = new PreferencesService(storage, win.document);
  assert.equal(prefs.preferences.highContrast, false);
  assert.equal(prefs.preferences.reducedMotion, false);
  assert.equal(prefs.preferences.volume, 1);
  assert.doesNotThrow(() => prefs.applyPreferences());
  assert.equal(prefs.musicEl.volume, 1);
});

test('PreferencesService toggles high contrast, reduced motion, and sound', () => {
  const win = setupDom();
  const storage = fakeStorage();
  const prefs = new PreferencesService(storage, win.document);
  assert.equal(prefs.toggleContrast(), true);
  assert.ok(win.document.documentElement.classList.contains('high-contrast'));

  assert.equal(prefs.toggleMotion(), true);
  assert.ok(win.document.documentElement.classList.contains('reduce-motion'));

  assert.equal(prefs.toggleSound(), true);
  const audio = win.document.querySelector('#bgm');
  assert.ok(audio);
});

test('ModalController contains focus, inerts the page, and restores both cleanly', () => {
  const win = setupDom();
  const doc = win.document;
  const modals = new ModalController(doc);

  const app = doc.createElement('main');
  const trigger = doc.createElement('button');
  app.append(trigger);
  doc.body.append(app);
  trigger.focus();

  const dialog = doc.createElement('div');
  dialog.setAttribute('role', 'dialog');
  const first = doc.createElement('button');
  first.className = 'btn-primary';
  const last = doc.createElement('button');
  dialog.append(first, last);
  const modal = doc.createElement('div');
  modal.append(dialog);

  let cleaned = false;
  modal._cleanup = () => {
    cleaned = true;
  };

  modals.showModal(modal);
  assert.equal(modals.activeModal, modal);
  assert.equal(doc.body.children.length, 2);
  assert.equal(doc.activeElement, first);
  assert.equal(app.hasAttribute('inert'), true);
  assert.equal(app.getAttribute('aria-hidden'), 'true');
  assert.equal(doc.body.style.overflow, 'hidden');

  last.focus();
  doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
  assert.equal(doc.activeElement, first, 'Tab wraps to the first control');

  doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(modals.activeModal, modal, 'a consequential modal ignores Escape');

  modals.dismissActive();
  assert.equal(modals.activeModal, null);
  assert.equal(cleaned, true);
  assert.equal(doc.body.children.length, 1);
  assert.equal(app.hasAttribute('inert'), false);
  assert.equal(app.hasAttribute('aria-hidden'), false);
  assert.equal(doc.body.style.overflow, '');
  assert.equal(doc.activeElement, trigger);
});
