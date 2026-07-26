/**
 * Application wiring.
 *
 * Exposed as `initGame()` rather than run on import so that tests can start a
 * fresh game against a fresh DOM as many times as they like without
 * re-importing the module.
 *
 * Owns the HUD, screen switching with fade transitions, the result modal,
 * toasts, autosave and the game-over overlay. Game rules live in core/; this
 * file is presentation and wiring only.
 */

import {
  GameState, MAX_STAT, MAX_ENERGY, MAX_REPUTATION, saveStore,
} from './core/game-state.js';
import { EventManager } from './core/event-manager.js';
import { resolveTurn } from './core/turn.js';
import {
  renderHub, renderMap, renderLocation, renderCharacters, renderGameOver,
  renderResultModal, renderSatchel, renderPerks, renderContracts,
  renderAlmanac, renderJournal, renderToast,
} from './ui/screens.js';

const FADE_MS = 350;
const TOAST_MS = 2600;

/**
 * Boot a game into the current document.
 * @param {{rng?: object, seed?: number, storage?: object, autoload?: boolean}} [opts]
 * @returns {{gs: GameState, events: EventManager, api: object}}
 */
export function initGame(opts = {}) {
  const gs = new GameState({ seed: opts.seed });
  const events = new EventManager(opts.rng);
  events.initialize(gs.getCharacterNames());

  const storage = 'storage' in opts ? opts.storage : globalThis.localStorage;

  const content = document.getElementById('content');
  const fade = document.getElementById('fade');
  const hud = document.getElementById('hud');
  const toastHost = document.getElementById('toasts');

  const dom = {
    date: document.getElementById('hud-date'),
    day: document.getElementById('hud-day'),
    weather: document.getElementById('hud-weather'),
    sanityLabel: document.getElementById('sanity-label'),
    moneyLabel: document.getElementById('money-label'),
    sanityBar: document.getElementById('sanity-bar'),
    moneyBar: document.getElementById('money-bar'),
    energyBar: document.getElementById('energy-bar'),
    repBar: document.getElementById('rep-bar'),
    sanityNum: document.getElementById('sanity-num'),
    moneyNum: document.getElementById('money-num'),
    energyNum: document.getElementById('energy-num'),
    repNum: document.getElementById('rep-num'),
    insight: document.getElementById('insight-num'),
    sanityDelta: document.getElementById('sanity-delta'),
    moneyDelta: document.getElementById('money-delta'),
  };

  let stopParticles = null;
  let lastGameOverMessage = '';

  // ---------------------------------------------------------------- HUD

  const setBar = (node, value, max) => {
    if (node) node.style.width = `${(value / max) * 100}%`;
  };
  const setText = (node, text) => { if (node) node.textContent = text; };

  function updateHud() {
    setText(dom.date, gs.getDateDisplay());
    setText(dom.day, `Journey Day ${gs.journeyDay}`);

    const weather = gs.getWeather();
    setText(dom.weather, `${weather.emoji} ${weather.name}`);

    const sLow = gs.sanity < 25;
    const mLow = gs.money < 25;

    setBar(dom.sanityBar, gs.sanity, MAX_STAT);
    setBar(dom.moneyBar, gs.money, MAX_STAT);
    setBar(dom.energyBar, gs.energy, MAX_ENERGY);
    setBar(dom.repBar, gs.reputation, MAX_REPUTATION);

    dom.sanityBar?.classList.toggle('low', sLow);
    dom.moneyBar?.classList.toggle('low', mLow);
    dom.energyBar?.classList.toggle('low', gs.isExhausted);

    setText(dom.sanityLabel, `🧘 Sanity${sLow ? ' — low!' : ''}`);
    setText(dom.moneyLabel, `💰 Money${mLow ? ' — low!' : ''}`);
    dom.sanityLabel?.classList.toggle('low', sLow);
    dom.moneyLabel?.classList.toggle('low', mLow);

    setText(dom.sanityNum, `${Math.round(gs.sanity)} / ${MAX_STAT}`);
    setText(dom.moneyNum, `${Math.round(gs.money)} / ${MAX_STAT}`);
    setText(dom.energyNum, `${Math.round(gs.energy)} / ${MAX_ENERGY}`);
    setText(dom.repNum, `${Math.round(gs.reputation)} / ${MAX_REPUTATION}`);
    setText(dom.insight, `🔮 ${gs.insight}`);
  }

  /** Floating +N / −N indicator. */
  function flashDelta(node, delta) {
    if (!node || !delta) return;
    node.textContent = `${delta > 0 ? '+' : ''}${Math.round(delta)}`;
    node.className = `delta ${delta > 0 ? 'pos' : 'neg'}`;
    void node.offsetWidth; // restart the animation
    node.classList.add('show');
  }

  function toast(text) {
    if (!toastHost) return null;
    const node = renderToast(text);
    toastHost.append(node);
    setTimeout(() => node.remove(), TOAST_MS);
    return node;
  }

  // ----------------------------------------------------- screen swapping

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
      onMap: () => transitionTo(mapScreen),
      onCharacters: () => transitionTo(charactersScreen),
      onSatchel: () => transitionTo(satchelScreen),
      onPerks: () => transitionTo(perksScreen),
      onContracts: () => transitionTo(contractsScreen),
      onAlmanac: () => transitionTo(almanacScreen),
      onJournal: () => transitionTo(journalScreen),
    });
  }

  function mapScreen() {
    return renderMap(gs, {
      onVisit: (loc) => transitionTo(() => locationScreen(loc)),
      onBack: () => transitionTo(hubScreen),
    });
  }

  function locationScreen(locationId) {
    return renderLocation(gs, locationId, {
      onAction: handleAction,
      onBack: () => transitionTo(hubScreen),
      onAcceptContract: (id) => {
        if (gs.acceptContract(id)) toast('Commitment accepted.');
        else toast('You cannot take that on right now.');
        showScreen(locationScreen(locationId));
      },
      onSpecial: (kind, arg) => handleSpecial(kind, arg, locationId),
    });
  }

  function charactersScreen() {
    return renderCharacters(gs.getAllCharacters(), {
      onBack: () => transitionTo(hubScreen),
    });
  }

  function satchelScreen() {
    return renderSatchel(gs, {
      onBack: () => transitionTo(hubScreen),
      onUse: (id) => {
        const used = gs.useItem(id);
        toast(used ? 'Used.' : 'That is not something you can use.');
        updateHud();
        showScreen(satchelScreen());
      },
      onDrop: (id) => {
        gs.removeItem(id);
        showScreen(satchelScreen());
      },
    });
  }

  function perksScreen() {
    return renderPerks(gs, {
      onBack: () => transitionTo(hubScreen),
      onBuy: (id) => {
        if (gs.buyPerk(id)) toast('Learned.');
        updateHud();
        showScreen(perksScreen());
      },
    });
  }

  function contractsScreen() {
    return renderContracts(gs, { onBack: () => transitionTo(hubScreen) });
  }

  function almanacScreen() {
    return renderAlmanac(gs, { onBack: () => transitionTo(hubScreen) });
  }

  function journalScreen() {
    return renderJournal(gs, { onBack: () => transitionTo(hubScreen) });
  }

  // -------------------------------------------------------------- extras

  function handleSpecial(kind, arg, locationId) {
    if (kind === 'sell_item') {
      const got = gs.sellItem(arg);
      toast(got > 0 ? `Sold for ${got}.` : 'Nothing to sell.');
    } else if (kind === 'prepay_rent') {
      toast(gs.prepayRent(1) ? 'Paid a week ahead.' : 'Not enough money.');
    }
    updateHud();
    showScreen(locationScreen(locationId));
  }

  // --------------------------------------------------------------- turn

  function handleAction(locationId) {
    const result = resolveTurn(gs, events, locationId);

    updateHud();
    flashDelta(dom.sanityDelta, result.deltas.sanity);
    flashDelta(dom.moneyDelta, result.deltas.money);
    for (const a of result.achievements) toast(`${a.emoji} ${a.name}`);

    if (result.gameOver) {
      saveStore.clear(storage);
      showGameOver(lastGameOverMessage || gs.gameOverMessage);
      return;
    }

    const modal = renderResultModal(result, gs, {
      onContinue: () => {
        modal.remove();
        gs.advanceDay();
        updateHud();
        saveStore.save(gs, storage);
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
    saveStore.clear(storage);
    hud.hidden = false;
    updateHud();
    transitionTo(hubScreen);
  }

  // --------------------------------------------------------------- boot

  gs.on('game_over_triggered', (msg) => { lastGameOverMessage = msg; });
  gs.on('stats_changed', updateHud);
  gs.on('day_changed', updateHud);

  if (opts.autoload !== false && saveStore.has(storage)) {
    if (saveStore.load(gs, storage)) toast('Run resumed.');
  }

  updateHud();
  showScreen(hubScreen());

  // A small surface for tests and the console — not used by the UI itself.
  const api = {
    toast,
    updateHud,
    save: () => saveStore.save(gs, storage),
    goto: {
      hub: () => showScreen(hubScreen()),
      map: () => showScreen(mapScreen()),
      location: (id) => showScreen(locationScreen(id)),
      satchel: () => showScreen(satchelScreen()),
      perks: () => showScreen(perksScreen()),
      contracts: () => showScreen(contractsScreen()),
      almanac: () => showScreen(almanacScreen()),
      journal: () => showScreen(journalScreen()),
      characters: () => showScreen(charactersScreen()),
    },
  };

  return { gs, events, api };
}
