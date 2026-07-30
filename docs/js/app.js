/**
 * Application wiring.
 *
 * Exposed as `initGame()` rather than run on import so that tests can start a
 * fresh game against a fresh DOM as many times as they like without
 * re-importing the module.
 *
 * Owns the HUD, seamless screen switching (cross-dissolve, never through
 * black), the result modal, toasts, autosave, audio and the game-over
 * overlay. Game rules live in core/; this file is presentation and wiring
 * only.
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
  renderVictoryModal,
  renderKadenSmearModal,
  renderPerks,
  renderAlmanac,
  renderSettings,
  renderToast,
  openCharacterPopup,
} from './ui/screens.js';
import { PreferencesService } from './ui/preferences-service.js';
import { ModalController } from './ui/modal-controller.js';

/** Cross-dissolve duration / background decode budget. Never a black pause. */
export const FADE_MS = 250;
export const TOAST_MS = 2600;

/**
 * Boot a game into the current document.
 * @param {{rng?: object, seed?: number, storage?: object, autoload?: boolean, fadeMs?: number, toastMs?: number}} [opts]
 * `fadeMs` is the cross-dissolve duration in ms and, on the way to a
 * background-image screen, the decode budget: the swap happens the moment the
 * new background is ready, at the latest after `fadeMs`. `0` (tests) swaps
 * synchronously with no dissolve.
 * @returns {{gs: GameState, events: EventManager, api: object}}
 */
export function initGame(opts = {}) {
  const fadeMs = opts.fadeMs ?? FADE_MS;
  const toastMs = opts.toastMs ?? TOAST_MS;
  const gs = new GameState({ seed: opts.seed });
  // Seed the event RNG from the run's own seed by default. Persisting the
  // RNG state in the save (already done) then makes a mid-day reload replay
  // the *same* scheduled event draw instead of re-rolling it — determinism
  // here matches the variance/weather promise everywhere else.
  const rng = opts.rng ?? createRng(gs.weatherSeed);
  const events = new EventManager(rng);
  events.initialize(gs.getCharacterNames());

  const storage = 'storage' in opts ? opts.storage : globalThis.localStorage;

  const content = document.getElementById('content');
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
    fragileFraud: document.getElementById('fragile-fraud'),
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
  // A resolved day is persisted before the player dismisses its result. This
  // closes the morning rollback window while preserving the intentional result
  // screen across a reload.
  let pendingResult = null;
  const prefsService = new PreferencesService(storage, document);
  const modals = new ModalController(document);
  const preferences = prefsService.preferences;
  const applyPreferences = () => prefsService.applyPreferences();

  // ---------------------------------------------------------------- audio

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
    // Kaden's slur is visible only while the campaign still has purchase.
    dom.fragileFraud?.toggleAttribute('hidden', !gs.kadenSmearSeen || gs.reputation >= 80);

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
    setTimeout(() => node.remove(), toastMs);
    return node;
  }

  // ----------------------------------------------------- screen swapping

  // Backgrounds already fetched this session. Repeat navigation (hub →
  // location → hub) never waits on the network twice.
  const readyBackgrounds = new Set();

  /**
   * Resolve once `url`'s image is decoded, or after `budgetMs` — whichever
   * comes first. The budget exists so a slow first fetch can stall a
   * navigation at most once; the cross-dissolve below covers whatever pops
   * in afterwards, so there is no black frame either way.
   */
  function backgroundReady(url, budgetMs) {
    if (!url || readyBackgrounds.has(url) || budgetMs <= 0 || typeof Image === 'undefined') {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const done = () => {
        readyBackgrounds.add(url);
        resolve();
      };
      const img = new Image();
      img.onload = done;
      img.onerror = done; // a missing background must never block navigation
      img.src = url;
      if (img.complete && img.naturalWidth > 0) return done(); // synchronously cached
      if (typeof img.decode === 'function') img.decode().then(done, () => {});
      setTimeout(done, budgetMs);
    });
  }

  /**
   * Move to a new screen without ever passing through black: wait for the
   * background (bounded by `fadeMs`), then dissolve — the outgoing screen
   * fades out on top of the incoming one, exactly like the popups do.
   */
  function transitionTo(buildScreen) {
    const node = buildScreen();
    const swap = () => showScreen(node);
    backgroundReady(node?.dataset?.bg, fadeMs).then(swap, swap);
  }

  function showScreen(node) {
    if (stopParticles) {
      stopParticles();
      stopParticles = null;
    }
    const leftovers = [...content.children];
    content.append(node);
    // Announce navigation and keep keyboard focus out of a screen that is
    // dissolving away. Headings are programmatically focusable, not added to
    // the ordinary Tab order.
    const heading = node.querySelector('h1, h2');
    if (heading) {
      heading.setAttribute('tabindex', '-1');
      heading.focus();
    }
    // Only the most recent previous screen gets to dissolve; anything older
    // (a swap still in flight) leaves now.
    const old = leftovers.filter((c) => c !== node).pop();
    for (const stale of leftovers) if (stale !== old && stale !== node) stale.remove();
    if (old && fadeMs > 0) {
      old.classList.add('swap-out'); // sits on top, fades out, ignores input
      setTimeout(() => old.remove(), fadeMs);
    } else {
      old?.remove();
    }
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
      onBuyRenovation: (id) => {
        if (gs.buyRenovation(id)) {
          toast('Sanctuary restored.');
          saveStore.save(gs, storage, { events: events.toJSON() });
        }
        updateHud();
        showScreen(locationScreen(locationId));
      },
    });
  }

  function charactersScreen() {
    return renderCharacters(gs.getAllCharacters(), {
      onBack: () => transitionTo(hubScreen),
      gs,
    });
  }

  function perksScreen() {
    return renderPerks(gs, {
      onBack: () => transitionTo(hubScreen),
      onBuy: (id) => {
        if (gs.buyPerk(id)) {
          toast('Learned.');
          saveStore.save(gs, storage, { events: events.toJSON() });
        }
        updateHud();
        showScreen(perksScreen());
      },
    });
  }

  function almanacScreen() {
    return renderAlmanac(gs, { onBack: () => transitionTo(hubScreen) });
  }

  function shareUrl() {
    try {
      const u = new URL(window.location.href);
      u.search = `?seed=${gs.weatherSeed}`;
      return u.toString();
    } catch {
      return null;
    }
  }

  function settingsScreen() {
    return renderSettings(
      preferences,
      {
        onBack: () => transitionTo(hubScreen),
        onToggleContrast: () => {
          prefsService.toggleContrast();
          showScreen(settingsScreen());
        },
        onToggleMotion: () => {
          prefsService.toggleMotion();
          showScreen(settingsScreen());
        },
        onToggleSound: () => {
          prefsService.toggleSound();
          showScreen(settingsScreen());
        },
        onChangeVolume: (v) => {
          setVolume(v);
        },
        onCopyShare: async (url) => {
          try {
            await globalThis.navigator?.clipboard?.writeText(url);
            toast('City link copied.');
          } catch {
            toast('Select the link and copy it manually.');
          }
        },
        onAbandon: () => {
          restart();
          toast('New run started.');
        },
      },
      { seed: gs.weatherSeed, url: shareUrl() },
    );
  }

  // -------------------------------------------------------------- extras

  function handleSpecial(kind, arg, locationId) {
    if (kind === 'prepay_rent') {
      const paid = gs.prepayRent(1);
      toast(paid ? 'Paid the next uncovered Sunday.' : 'Keep at least one money after paying.');
      if (paid) saveStore.save(gs, storage, { events: events.toJSON() });
    }
    updateHud();
    showScreen(locationScreen(locationId));
  }

  // --------------------------------------------------------------- turn

  function presentResolvedTurn(result, { announce = true, persist = true } = {}) {
    updateHud();
    if (announce) {
      flashDelta(dom.sanityDelta, result.deltas.sanity);
      flashDelta(dom.moneyDelta, result.deltas.money);
      for (const a of result.achievements) toast(`${a.emoji} ${a.name}`);
      if (result.justWon && !result.masteryWon)
        toast(`🏅 ${result.winMessage || 'Sixty days. You held.'}`);
      if (result.masteryWon) toast(`🌟 ${result.masteryMessage || result.winMessage}`);
      if (result.extraRent) {
        toast(`📅 Rent came due while you were away (${result.extraRent} money).`);
      }
    }

    if (result.gameOver) {
      pendingResult = null;
      saveStore.clear(storage);
      showGameOver(lastGameOverMessage || gs.gameOverMessage);
      return;
    }

    pendingResult = result;
    if (persist) {
      saveStore.save(gs, storage, {
        events: events.toJSON(),
        pendingResult,
      });
    }

    const modal = renderResultModal(result, gs, {
      onContinue: () => {
        modals.dismissActive();
        pendingResult = null;
        // Every completed action enters the next playable morning. A long trip
        // has already consumed its two silent interior days in resolveTurn;
        // this final advance moves N+2 → N+3 just as an ordinary day moves
        // N → N+1. The simulator uses the same lifecycle.
        const showKadenSmear = () => {
          const story = renderKadenSmearModal({
            gs,
            onContinue: () => {
              gs.acknowledgeKadenSmear();
              saveStore.save(gs, storage, { events: events.toJSON() });
              modals.dismissActive();
              transitionTo(hubScreen);
            },
          });
          modals.showModal(story);
        };
        const advanceToMorning = () => {
          const kadenSmear = gs.advanceDay();
          updateHud();
          saveStore.save(gs, storage, { events: events.toJSON() });
          if (kadenSmear || (gs.kadenSmearSeen && !gs.kadenSmearAcknowledged)) {
            // Zero-duration transitions are the headless test harness; a real player
            // gets the day-two interlude after the hub transition settles.
            if (fadeMs > 0) setTimeout(showKadenSmear, 0);
            else transitionTo(hubScreen);
          } else transitionTo(hubScreen);
        };
        if (result.masteryWon) {
          const victory = renderVictoryModal(gs, {
            onRestart: () => {
              modals.dismissActive();
              restart();
            },
            onContinue: () => {
              modals.dismissActive();
              advanceToMorning();
            },
          });
          modals.showModal(victory);
        } else {
          advanceToMorning();
        }
      },
    });
    modals.showModal(modal);
  }

  function handleAction(locationId) {
    presentResolvedTurn(resolveTurn(gs, events, locationId));
  }

  // ----------------------------------------------------------- game over

  function showGameOver(message) {
    pendingResult = null;
    modals.dismissActive();
    hud.hidden = true;
    showScreen(renderGameOver(gs, message, { onRestart: restart }));
  }

  function restart() {
    pendingResult = null;
    gs.resetGame();
    events.reset(gs.weatherSeed);
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

  let resumedPending = null;
  if (opts.autoload !== false && saveStore.has(storage)) {
    if (saveStore.load(gs, storage)) {
      toast('Run resumed.');
      // Restore event manager state (next event day, recent ids, RNG) and a
      // resolved-but-not-dismissed result if saved.
      const blob = saveStore.loadExtra(storage);
      if (blob && blob.events) events.loadFrom(blob.events);
      if (
        blob?.pendingResult &&
        gs.isTurnResolved &&
        blob.pendingResult.deltas &&
        blob.pendingResult.weather &&
        Array.isArray(blob.pendingResult.achievements)
      ) {
        resumedPending = blob.pendingResult;
      }
    }
  }

  dom.portraitBtn?.addEventListener('click', () => {
    if (leonProfile) openCharacterPopup(leonProfile);
  });
  dom.settingsBtn?.addEventListener('click', () => transitionTo(settingsScreen));

  applyPreferences();
  updateHud();
  showScreen(hubScreen());
  if (resumedPending) presentResolvedTurn(resumedPending, { announce: false, persist: false });
  else if (fadeMs > 0 && gs.kadenSmearSeen && !gs.kadenSmearAcknowledged) {
    setTimeout(
      () =>
        modals.showModal(
          renderKadenSmearModal({
            gs,
            onContinue: () => {
              gs.acknowledgeKadenSmear();
              saveStore.save(gs, storage, { events: events.toJSON() });
              modals.dismissActive();
              transitionTo(hubScreen);
            },
          }),
        ),
      0,
    );
  }

  const api = {
    toast,
    updateHud,
    save: () =>
      saveStore.save(gs, storage, {
        events: events.toJSON(),
        ...(pendingResult ? { pendingResult } : {}),
      }),
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
