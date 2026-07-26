/**
 * Application wiring — the behaviour that used to live at the top level of
 * main.js.
 *
 * Exposed as `initGame()` rather than run on import so that:
 *   - tests can start a fresh game against a fresh DOM as many times as they
 *     like without re-importing the module (re-importing with a cache-busting
 *     query string fragments coverage reporting, and leaks module state), and
 *   - the entry point stays a one-liner.
 *
 * Owns the HUD, screen switching with fade transitions, the result modal and
 * the game-over overlay. Game rules live in core/; this file is presentation
 * and wiring only.
 */

import { GameState, MAX_STAT } from './core/game-state.js';
import { EventManager } from './core/event-manager.js';
import { resolveTurn } from './core/turn.js';
import {
  renderHub, renderLocation, renderCharacters, renderGameOver, renderResultModal,
} from './ui/screens.js';

const FADE_MS = 350;

/**
 * Boot a game into the current document.
 * @param {{rng?: object}} [opts] optional seeded RNG, used by tests.
 * @returns {{gs: GameState, events: EventManager}}
 */
export function initGame(opts = {}) {
  const gs = new GameState();
  const events = new EventManager(opts.rng);
  events.initialize(gs.getCharacterNames());

  const content = document.getElementById('content');
  const fade = document.getElementById('fade');
  const hud = document.getElementById('hud');

  const dom = {
    date: document.getElementById('hud-date'),
    day: document.getElementById('hud-day'),
    sanityLabel: document.getElementById('sanity-label'),
    moneyLabel: document.getElementById('money-label'),
    sanityBar: document.getElementById('sanity-bar'),
    moneyBar: document.getElementById('money-bar'),
    sanityNum: document.getElementById('sanity-num'),
    moneyNum: document.getElementById('money-num'),
    sanityDelta: document.getElementById('sanity-delta'),
    moneyDelta: document.getElementById('money-delta'),
  };

  let stopParticles = null;
  let lastGameOverMessage = '';

  // ---------------------------------------------------------------- HUD

  function updateHud() {
    dom.date.textContent = gs.getDateDisplay();
    dom.day.textContent = `Journey Day ${gs.journeyDay}`;

    const s = Math.round(gs.sanity);
    const m = Math.round(gs.money);
    const sLow = gs.sanity < 25;
    const mLow = gs.money < 25;

    dom.sanityBar.style.width = `${(gs.sanity / MAX_STAT) * 100}%`;
    dom.moneyBar.style.width = `${(gs.money / MAX_STAT) * 100}%`;
    dom.sanityBar.classList.toggle('low', sLow);
    dom.moneyBar.classList.toggle('low', mLow);

    dom.sanityLabel.textContent = `🧘 Sanity${sLow ? ' — low!' : ''}`;
    dom.moneyLabel.textContent = `💰 Money${mLow ? ' — low!' : ''}`;
    dom.sanityLabel.classList.toggle('low', sLow);
    dom.moneyLabel.classList.toggle('low', mLow);

    dom.sanityNum.textContent = `${s} / ${MAX_STAT}`;
    dom.moneyNum.textContent = `${m} / ${MAX_STAT}`;
  }

  /** Floating +N / −N indicator. */
  function flashDelta(node, delta) {
    if (!delta) return;
    node.textContent = `${delta > 0 ? '+' : ''}${Math.round(delta)}`;
    node.className = `delta ${delta > 0 ? 'pos' : 'neg'}`;
    void node.offsetWidth; // restart the animation
    node.classList.add('show');
  }

  // ----------------------------------------------------- screen swapping

  /** Fade out, swap, fade in. */
  function transitionTo(buildScreen) {
    fade.classList.add('on');
    setTimeout(() => {
      showScreen(buildScreen());
      fade.classList.remove('on');
    }, FADE_MS);
  }

  function showScreen(node) {
    if (stopParticles) { stopParticles(); stopParticles = null; }
    content.replaceChildren(node);
    if (typeof node._startParticles === 'function') stopParticles = node._startParticles();
  }

  // ------------------------------------------------------------ screens

  function hubScreen() {
    return renderHub(gs, {
      onVisit: (loc) => transitionTo(() => locationScreen(loc)),
      onCharacters: () => transitionTo(charactersScreen),
    });
  }

  function locationScreen(locationId) {
    return renderLocation(locationId, {
      onAction: handleAction,
      onBack: () => transitionTo(hubScreen),
    });
  }

  function charactersScreen() {
    return renderCharacters(gs.getAllCharacters(), {
      onBack: () => transitionTo(hubScreen),
    });
  }

  // --------------------------------------------------------------- turn

  function handleAction(locationId) {
    const result = resolveTurn(gs, events, locationId);

    updateHud();
    flashDelta(dom.sanityDelta, result.sanityDelta);
    flashDelta(dom.moneyDelta, result.moneyDelta);

    if (result.gameOver) {
      showGameOver(lastGameOverMessage);
      return;
    }

    const modal = renderResultModal(result, gs, {
      onContinue: () => {
        modal.remove();
        gs.advanceDay();
        updateHud();
        transitionTo(hubScreen);
      },
    });
    document.body.append(modal);
    modal.querySelector('button')?.focus();
  }

  // ----------------------------------------------------------- game over

  function showGameOver(message) {
    document.querySelector('.modal-backdrop')?.remove();
    hud.hidden = true;
    showScreen(renderGameOver(gs, message, { onRestart: restart }));
  }

  function restart() {
    gs.resetGame();
    events.reset();
    hud.hidden = false;
    updateHud();
    transitionTo(hubScreen);
  }

  // --------------------------------------------------------------- boot

  gs.on('game_over_triggered', (msg) => { lastGameOverMessage = msg; });
  gs.on('stats_changed', updateHud);
  gs.on('day_changed', updateHud);

  updateHud();
  showScreen(hubScreen());

  return { gs, events };
}
