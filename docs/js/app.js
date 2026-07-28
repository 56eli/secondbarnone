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
import {
  renderHub,
  renderLocation,
  renderCharacters,
  renderGameOver,
  renderResultModal,
  renderPerks,
  renderAlmanac,
  renderToast,
  openCharacterPopup,
} from './ui/screens.js';

const FADE_MS = 350;
const TOAST_MS = 2600;
const MUSIC_VOLUME_KEY = 'secondbarnone.settings.musicVolume';
const MUSIC_SRC = 'assets/audio/warm-piano-loop.wav';

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

  if (!content || !hud) {
    throw new Error('Required DOM nodes (content, hud) are missing from index.html');
  }

  const dom = {
    date: document.getElementById('hud-date'),
    day: document.getElementById('hud-day'),
    weather: document.getElementById('hud-weather'),
    portrait: document.getElementById('hud-portrait'),
    portraitBtn: document.getElementById('hud-portrait-btn'),
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
    settingsBtn: document.getElementById('settings-btn'),
  };

  let stopParticles = null;
  let lastGameOverMessage = '';
  let leonProfile = null;
  const persist = () => saveStore.save(gs, storage, events);

  dom.portraitBtn?.addEventListener('click', () => {
    if (leonProfile) openCharacterPopup(leonProfile);
  });

  // ------------------------------------------------------------ settings

  const readVolume = () => {
    try {
      const raw = storage?.getItem?.(MUSIC_VOLUME_KEY);
      const parsed = raw === null || raw === undefined ? 0 : Number(raw);
      return Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : 0;
    } catch {
      return 0;
    }
  };
  const writeVolume = (value) => {
    try {
      storage?.setItem?.(MUSIC_VOLUME_KEY, String(value));
    } catch {
      // Settings are nice-to-have; storage failures must not break the game.
    }
  };

  const AudioCtor = globalThis.Audio ?? globalThis.window?.Audio;
  const music = AudioCtor
    ? new AudioCtor(MUSIC_SRC)
    : { volume: 0, loop: false, preload: '', play: () => {}, pause: () => {} };
  music.loop = true;
  music.preload = 'auto';
  music.volume = readVolume();

  function playMusicIfWanted() {
    if (music.volume <= 0) return;
    const userAgent =
      globalThis.navigator?.userAgent ?? globalThis.window?.navigator?.userAgent ?? '';
    if (userAgent.includes('jsdom')) return;
    try {
      const maybePromise = music.play?.();
      if (maybePromise && typeof maybePromise.catch === 'function') maybePromise.catch(() => {});
    } catch {
      // jsdom and some locked-down browsers may reject media playback here.
    }
  }

  function setMusicVolume(value) {
    const volume = Math.max(0, Math.min(1, Number(value) || 0));
    music.volume = volume;
    writeVolume(volume);
    if (volume > 0) playMusicIfWanted();
    else {
      try {
        music.pause?.();
      } catch {
        /* media may be stubbed in tests */
      }
    }
    return volume;
  }

  document.addEventListener('pointerdown', playMusicIfWanted, { once: true });
  document.addEventListener('keydown', playMusicIfWanted, { once: true });

  function openSettings() {
    document.querySelector('.settings-backdrop')?.remove();
    const previouslyFocused = document.activeElement;
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop settings-backdrop';

    const dialog = document.createElement('div');
    dialog.className = 'settings-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'settings-title');

    const title = document.createElement('h2');
    title.id = 'settings-title';
    title.textContent = 'Settings';

    const label = document.createElement('label');
    label.className = 'settings-volume';
    label.setAttribute('for', 'music-volume');
    label.textContent = 'Background piano';

    const value = document.createElement('span');
    value.className = 'settings-volume-value';

    const slider = document.createElement('input');
    slider.id = 'music-volume';
    slider.type = 'range';
    slider.min = '0';
    slider.max = '100';
    slider.step = '1';
    slider.value = String(Math.round(music.volume * 100));
    value.textContent = `${slider.value}%`;
    slider.addEventListener('input', () => {
      const volume = setMusicVolume(Number(slider.value) / 100);
      value.textContent = `${Math.round(volume * 100)}%`;
    });

    const reset = document.createElement('button');
    reset.className = 'btn btn-danger';
    reset.type = 'button';
    reset.textContent = 'Reset game';
    reset.addEventListener('click', () => {
      saveStore.clear(storage);
      restart();
      backdrop.remove();
      toast('Save cleared.');
    });

    const close = document.createElement('button');
    close.className = 'btn';
    close.type = 'button';
    close.textContent = 'Close';
    const closeDialog = () => {
      backdrop.remove();
      document.removeEventListener('keydown', onKey);
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') closeDialog();
    };
    close.addEventListener('click', closeDialog);
    document.addEventListener('keydown', onKey);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closeDialog();
    });

    const row = document.createElement('div');
    row.className = 'settings-actions';
    row.append(reset, close);
    label.append(value);
    dialog.append(title, label, slider, row);
    backdrop.append(dialog);
    document.body.append(backdrop);
    slider.focus();
  }

  dom.settingsBtn?.addEventListener('click', openSettings);

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

    // Léon stays on every page — portrait + name in the HUD.
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
    // Money bar is a comfort meter against the soft cap; the number is uncapped.
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

    // Keep aria meters honest.
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
        if (gs.buyPerk(id)) {
          persist();
          toast('Learned.');
        }
        updateHud();
        showScreen(perksScreen());
      },
    });
  }

  function almanacScreen() {
    return renderAlmanac(gs, { onBack: () => transitionTo(hubScreen) });
  }

  // -------------------------------------------------------------- extras

  function handleSpecial(kind, arg, locationId) {
    if (kind === 'prepay_rent') {
      toast(gs.prepayRent(1) ? 'Paid a week ahead.' : 'Not enough money.');
    }
    persist();
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
    if (result.justWon) toast(`🏅 ${result.winMessage || 'Sixty days.'}`);
    if (result.masteryWon) toast(`🌟 ${result.masteryMessage || 'A hundred days.'}`);
    // Persist the resolved turn before presenting the modal: an accidental
    // refresh must never erase a day the player has already committed to.
    persist();

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
        persist();
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

  gs.on('game_over_triggered', (msg) => {
    lastGameOverMessage = msg;
  });
  gs.on('stats_changed', updateHud);
  gs.on('day_changed', updateHud);

  if (opts.autoload !== false && saveStore.has(storage)) {
    if (saveStore.load(gs, storage, events)) toast('Run resumed.');
  }

  updateHud();
  showScreen(hubScreen());

  // A small surface for tests and the console — not used by the UI itself.
  const api = {
    toast,
    updateHud,
    save: () => persist(),
    goto: {
      hub: () => showScreen(hubScreen()),
      location: (id) => showScreen(locationScreen(id)),
      perks: () => showScreen(perksScreen()),
      almanac: () => showScreen(almanacScreen()),
      characters: () => showScreen(charactersScreen()),
    },
  };

  return { gs, events, api };
}
