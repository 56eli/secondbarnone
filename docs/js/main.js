/**
 * Entry point.
 *
 * All wiring lives in app.js so that tests can boot a game repeatedly against
 * a fresh DOM without re-importing modules. This file just starts it.
 */

import { initGame } from './app.js';
import { createRng } from './core/rng.js';

/**
 * Share-a-city links: `?seed=12345` starts deterministic runs (weather,
 * event timing and day swings all derive from the seed), so players can
 * compare the same Paris on the same mornings. An existing autosave always
 * wins over the URL seed — visiting a shared link never wipes a live run.
 */
function seedFromUrl() {
  const raw = new URLSearchParams(window.location.search).get('seed');
  if (raw === null || raw.trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.floor(Math.abs(n)) : null;
}

// Expose for debugging and for the DOM test-suite. Autoloads the previous run
// from localStorage if there is one.
/** @type {Window & {__game?: ReturnType<typeof initGame>}} */
const gameWindow = window;
const urlSeed = seedFromUrl();
gameWindow.__game = initGame(urlSeed === null ? {} : { seed: urlSeed, rng: createRng(urlSeed) });
