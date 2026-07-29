/**
 * Entry point.
 *
 * All wiring lives in app.js so that tests can boot a game repeatedly against
 * a fresh DOM without re-importing modules. This file just starts it.
 */

import { initGame } from './app.js';

// Expose for debugging and for the DOM test-suite. Autoloads the previous run
// from localStorage if there is one.
/** @type {Window & {__game?: ReturnType<typeof initGame>}} */
const gameWindow = window;
gameWindow.__game = initGame();
