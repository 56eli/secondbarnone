/**
 * Share-a-city seed links.
 *
 * main.js reads `?seed=N` from the URL and boots deterministic runs from it.
 * This file boots the *real* main.js (not just app.js) in a jsdom whose URL
 * carries a seed, so it must own its module instance — node --test isolates
 * each file in its own process, which is exactly what that needs.
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
  console.log('# jsdom not installed — skipping share-seed tests (npm i -D jsdom)');
}

const maybe = JSDOM ? test : test.skip;

async function bootMain(url) {
  const html = readFileSync(join(DOCS, 'index.html'), 'utf8');
  const dom = new JSDOM(html, { url, pretendToBeVisual: true });
  const { window } = dom;
  global.window = window;
  global.document = window.document;
  global.HTMLElement = window.HTMLElement;
  global.requestAnimationFrame = window.requestAnimationFrame?.bind(window) ?? ((cb) => setTimeout(cb, 0));
  window.matchMedia = () => ({
    matches: true, // parallax/particles off; matches the reduced-motion path
    media: 'prefers-reduced-motion',
    addEventListener() {},
    removeEventListener() {},
  });
  // Cache-bust so each boot gets a fresh main.js module instance (and a fresh
  // game) instead of the first call's cached module.
  const nonce = Math.random().toString(36).slice(2);
  await import(`${pathToFileURL(join(DOCS, 'js', 'main.js')).href}?nonce=${nonce}`);
  return window;
}

function cleanup(window) {
  try { window?.close(); } catch { /* already closed */ }
  delete global.window;
  delete global.document;
  delete global.HTMLElement;
  delete global.requestAnimationFrame;
}

maybe('?seed= boots a deterministic run from the URL', async () => {
  const a = await bootMain('http://localhost/?seed=4242');
  const b = await bootMain('http://localhost/?seed=4242');
  try {
    assert.equal(a.__game.gs.weatherSeed, 4242, 'the run seed comes from the URL');
    assert.equal(b.__game.gs.weatherSeed, 4242);
    // Same city, same mornings: weather must match day-for-day.
    for (let day = 1; day <= 12; day += 1) {
      a.__game.gs.journeyDay = day;
      b.__game.gs.journeyDay = day;
      assert.equal(a.__game.gs.getWeather().id, b.__game.gs.getWeather().id, `day ${day}`);
    }
  } finally {
    cleanup(a);
    cleanup(b);
  }
});

maybe('a missing or malformed seed falls back to a normal run', async () => {
  const window = await bootMain('http://localhost/?seed=not-a-number');
  try {
    assert.ok(window.__game?.gs, 'game still boots');
    assert.ok(window.__game.gs.weatherSeed >= 0, 'a run seed exists anyway');
  } finally {
    cleanup(window);
  }
});
