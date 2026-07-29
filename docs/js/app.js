/**
 * Application wiring.
 *
 * Exposed as `initGame()` rather than run on import so that tests can start a
 * fresh game against a fresh DOM as many times as they like without
 * re-importing the module.
 *
 * Owns the HUD, screen switching with fade transitions, the result modal,
 * toasts, autosave, audio and the game-over overlay. Game rules live in core/;
 * this file is presentation and wiring only.
 */

import { resourceBarClass } from './core/resource-bar.js';
import {
  GameState,
  MAX_STAT,
  MAX_ENERGY,
  MAX_REPUTATION,
  MONEY_SOFT_CAP,
  saveStore,
} from './core/game-state.js';
import { EventManager } from './core/event-manager.js';
import { resolveTurn } from './core/turn.js';
import { createRng } from './core/rng.js';
import {
  renderHub,
  renderLocation,
  renderCharacters,
  renderGameOver,
  renderResultModal,
  renderPerks,
  renderAlmanac,
  renderSettings,
  renderToast,
  openCharacterPopup,
} from './ui/screens.js';

const FADE_MS = 350;
const TOAST_MS = 2600;
const MUSIC_URL = 'assets/music/warm_piano.wav';

/**
 * Boot a game into the current document.
 * @param {{rng?: object, seed?: number, storage?: object, autoload?: boolean}} [opts]
 * @returns {{gs: GameState, events: EventManager, api: object}}
 */
export function initGame(opts = {}) {
  const gs = new GameState({ seed: opts.seed });
  const rng = opts.rng ?? createRng();
  const events = new EventManager(rng);
  events.initialize(gs.getCharacterNames());

  const storage = 'storage' in opts ? opts.storage : globalThis.localStorage;

  const content = document.getElementById('content');
  const fade = document.getElementById('fade');
  const hud = document.getElementById('hud');
  const toastHost = document.getElementById('toasts');

  if (!content || !hud) {
    throw new Error('Required DOM nodes (content, hud) are missing from index.html');
  }

  const dom = {
    date: document.getElementById('hud-date'),
    day: document.getElementById('hud-day'),
    weather: document.getElementById('hud-weather'),
    portrait: document.getElementById('hud-portrait'),
    portraitBtn: document.getElementById('hud-portrait-btn'),
    settingsBtn: document.getElementById('settings-button'),
    name: document.getElementById('hud-name'),
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
  let leonProfile = null;
  let musicEl = null;
  let preferences = { highContrast: false, reducedMotion: false, sound: false, volume: 0.35 };
  try {
    preferences = {
      ...preferences,
      ...JSON.parse(storage?.getItem('secondbarnone.settings.v1') ?? '{}'),
    };
    // Older saves stored sound state under musicOn / muted. Be tolerant.
    if (typeof preferences.sound !== 'boolean') {
      preferences.sound =
        preferences.musicOn === true || preferences.muted === false ? true : false;
    }
    if (typeof preferences.volume !== 'number') preferences.volume = 0.35;
  } catch {
    /* storage is optional */
  }
  const applyPreferences = () => {
    document.documentElement.classList.toggle('high-contrast', Boolean(preferences.highContrast));
    document.documentElement.classList.toggle('reduce-motion', Boolean(preferences.reducedMotion));
    applySound();
    try {
      storage?.setItem('secondbarnone.settings.v1', JSON.stringify(preferences));
    } catch {
      /* best effort */
    }
  };

  // ---------------------------------------------------------------- audio

  /** Lazily create the music <audio> element — never preloaded, never
   *  auto-played without user interaction (browsers block that anyway). */
  function ensureMusic() {
    if (musicEl) return musicEl;
    const el = document.createElement('audio');
    el.id = 'bgm';
    el.src = MUSIC_URL;
    el.loop = true;
    el.preload = 'none';
    el.setAttribute('aria-hidden', 'true');
    el.volume = preferences.volume;
    document.body.append(el);
    musicEl = el;
    return el;
  }

  function applySound() {
    if (!musicEl) {
      if (preferences.sound) ensureMusic();
      else return;
    }
    musicEl.volume = preferences.volume;
    if (preferences.sound) {
      // play() returns a promise; autoplay policies may reject it, in which
      // case we stay muted rather than throw. The user can toggle again from
      // Settings after interacting with the page.
      const p = musicEl.play();
      if (p && typeof p.catch === 'function')
        p.catch(() => {
          preferences.sound = false;
          try {
            storage?.setItem('secondbarnone.settings.v1', JSON.stringify(preferences));
          } catch {
            /* noop */
          }
        });
    } else {
      musicEl.pause();
    }
  }

  function toggleSound() {
    preferences.sound = !preferences.sound;
    if (preferences.sound) ensureMusic();
    applyPreferences();
  }

  function setVolume(v) {
    preferences.volume = Math.max(0, Math.min(1, Number(v) || 0));
    applyPreferences();
  }

  // ---------------------------------------------------------------- HUD

  const setBar = (node, value, max) => {
    if (!node) return;
    const percent = Math.max(0, Math.min(100, (value / max) * 100));
    node.style.width = `${percent}%`;
    node.classList.remove('bar-critical', 'bar-warning', 'bar-fair', 'bar-full');
    node.classList.add(resourceBarClass(percent, 100));
  };
  const setText = (node, text) => {
    if (node) node.textContent = text;
  };

  function updateHud() {
    setText(dom.date, gs.getDateDisplay());
    setText(dom.day, `Journey Day ${gs.journeyDay}`);

    const weather = gs.getWeather();
    setText(dom.weather, `${weather.emoji} ${weather.name}`);

    const leon = typeof gs.getProtagonist === 'function' ? gs.getProtagonist() : null;
    if (leon) {
      leonProfile = leon;
      if (dom.portrait && dom.portrait.getAttribute('src') !== leon.portrait) {
        dom.portrait.setAttribute('src', leon.portrait);
        dom.portrait.setAttribute('alt', leon.name);
      }
      setText(dom.name, leon.name);
    }

    const sLow = gs.sanity < 25;
    const mLow = gs.money < 25;
    const sPct = Math.round((gs.sanity / MAX_STAT) * 100);
    const ePct = Math.round((gs.energy / MAX_ENERGY) * 100);
    const rPct = Math.round((gs.reputation / MAX_REPUTATION) * 100);
    const mComfort = Math.min(100, Math.round((gs.money / MONEY_SOFT_CAP) * 100));

    setBar(dom.sanityBar, gs.sanity, MAX_STAT);
    setBar(dom.moneyBar, Math.min(gs.money, MONEY_SOFT_CAP), MONEY_SOFT_CAP);
    setBar(dom.energyBar, gs.energy, MAX_ENERGY);
    setBar(dom.repBar, gs.reputation, MAX_REPUTATION);

    dom.sanityBar?.classList.toggle('low', sLow);
    dom.moneyBar?.classList.toggle('low', mLow);
    dom.energyBar?.classList.toggle('low', gs.isExhausted);

    setText(dom.sanityLabel, `🧘 Sanity${sLow ? ' — low!' : ''}`);
    setText(dom.moneyLabel, `💰 Money${mLow ? ' — low!' : ''}`);
    dom.sanityLabel?.classList.toggle('low', sLow);
    dom.moneyLabel?.classList.toggle('low', mLow);

    setText(dom.sanityNum, `${sPct}%`);
    setText(dom.moneyNum, `${Math.round(gs.money)}`);
    setText(dom.energyNum, `${ePct}%`);
    setText(dom.repNum, `${rPct}%`);
    setText(dom.insight, `🔮 ${gs.insight}`);

    const setMeter = (bar, now, max) => {
      const track = bar?.parentElement;
      if (track?.getAttribute('role') === 'meter') {
        track.setAttribute('aria-valuenow', String(Math.round(now)));
        track.setAttribute('aria-valuemax', String(max));
      }
    };
    setMeter(dom.sanityBar, sPct, 100);
    setMeter(dom.moneyBar, mComfort, 100);
    setMeter(dom.energyBar, ePct, 100);
    setMeter(dom.repBar, rPct, 100);
  }

  function flashDelta(node, delta) {
    if (!node || !delta) return;
    node.textContent = `${delta > 0 ? '+' : ''}${Math.round(delta)}`;
    node.className = `delta ${delta > 0 ? 'pos' : 'neg'}`;
    void node.offsetWidth;
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
    if (stopParticles) {
      stopParticles();
      stopParticles = null;
    }
    content.replaceChildren(node);
    if (typeof node._startParticles === 'function') stopParticles = node._startParticles();
  }

  // ------------------------------------------------------------ screens

  function hubScreen() {
    return renderHub(gs, {
      onVisit: (loc) => transitionTo(() => locationScreen(loc)),
      onCharacters: () => transitionTo(charactersScreen),
      onPerks: () => transitionTo(perksScreen),
      onAlmanac: () => transitionTo(almanacScreen),
    });
  }

  function locationScreen(locationId) {
    return renderLocation(gs, locationId, {
      onAction: handleAction,
      onBack: () => transitionTo(hubScreen),
      onSpecial: (kind, arg) => handleSpecial(kind, arg, locationId),
    });
  }

  function charactersScreen() {
    return renderCharacters(gs.getAllCharacters(), {
      onBack: () => transitionTo(hubScreen),
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

  function almanacScreen() {
    return renderAlmanac(gs, { onBack: () => transitionTo(hubScreen) });
  }

  function settingsScreen() {
    return renderSettings(preferences, {
      onBack: () => transitionTo(hubScreen),
      onToggleContrast: () => {
        preferences.highContrast = !preferences.highContrast;
        applyPreferences();
        showScreen(settingsScreen());
      },
      onToggleMotion: () => {
        preferences.reducedMotion = !preferences.reducedMotion;
        applyPreferences();
        showScreen(settingsScreen());
      },
      onToggleSound: () => {
        toggleSound();
        showScreen(settingsScreen());
      },
      onChangeVolume: (v) => {
        setVolume(v);
      },
      onAbandon: () => {
        restart();
        toast('New run started.');
      },
    });
  }

  // -------------------------------------------------------------- extras

  function handleSpecial(kind, arg, locationId) {
    if (kind === 'prepay_rent') {
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
    if (result.justWon && !result.masteryWon)
      toast(`🏅 ${result.winMessage || 'Sixty days. You held.'}`);
    if (result.masteryWon) toast(`🌟 ${result.masteryMessage || result.winMessage}`);
    if (result.extraRent) {
      toast(`📅 Rent came due while you were away (${result.extraRent} money).`);
    }

    if (result.gameOver) {
      saveStore.clear(storage);
      showGameOver(lastGameOverMessage || gs.gameOverMessage);
      return;
    }

    const modal = renderResultModal(result, gs, {
      onContinue: () => {
        modal._cleanup?.();
        modal.remove();
        if (!result.longTrip) gs.advanceDay();
        else {
          gs.emit(
            'day_changed',
            gs.journeyDay,
            gs.getWeekdayName(),
            gs.getMonthName(),
            gs.year,
            gs.dayOfMonth,
          );
          gs._statsChanged();
        }
        updateHud();
        saveStore.save(gs, storage, { events: events.toJSON() });
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
    // Re-seed the RNG used by the event manager so the new run has fresh
    // event timing rather than replaying the last one.
    if (typeof rng.setState === 'function' && rng.isSeeded) {
      // seeded RNGs keep state; nothing to do, events.reset() already advanced it
    } else if (rng !== createRng) {
      // unseeded Math.random path: nothing to reset
    }
    saveStore.clear(storage);
    hud.hidden = false;
    updateHud();
    transitionTo(hubScreen);
  }

  // --------------------------------------------------------------- boot

  gs.on('game_over_triggered', (msg) => {
    lastGameOverMessage = msg;
  });
  gs.on('stats_changed', updateHud);
  gs.on('day_changed', updateHud);

  if (opts.autoload !== false && saveStore.has(storage)) {
    if (saveStore.load(gs, storage)) {
      toast('Run resumed.');
      // Restore event manager state (next event day, recent ids, RNG) if saved.
      const blob = saveStore.loadExtra(storage);
      if (blob && blob.events) events.loadFrom(blob.events);
    }
  }

  dom.portraitBtn?.addEventListener('click', () => {
    if (leonProfile) openCharacterPopup(leonProfile);
  });
  dom.settingsBtn?.addEventListener('click', () => transitionTo(settingsScreen));

  applyPreferences();
  updateHud();
  showScreen(hubScreen());

  const api = {
    toast,
    updateHud,
    save: () => saveStore.save(gs, storage, { events: events.toJSON() }),
    goto: {
      hub: () => showScreen(hubScreen()),
      location: (id) => showScreen(locationScreen(id)),
      perks: () => showScreen(perksScreen()),
      almanac: () => showScreen(almanacScreen()),
      settings: () => showScreen(settingsScreen()),
      characters: () => showScreen(charactersScreen()),
    },
  };

  return { gs, events, api };
}
