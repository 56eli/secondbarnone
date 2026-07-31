/**
 * Screen renderers. Each returns a DOM element; app.js swaps them into
 * #content.
 *
 * Rule for this file: it may read state, but it must never mutate it. Every
 * mutation goes back through a callback so that the rules stay in core/.
 */

import { getInitials, Role, roleLabel, smallTalkFor } from '../data/characters.js';
import { eventsForCharacter } from '../data/events.js';
import { MAX_STAT, MAX_ENERGY, MAX_REPUTATION, ENDURANCE_GOAL_DAYS } from '../core/game-state.js';
import { computeDayEffects } from '../core/turn.js';
import { locationFocusResources, previewBand, previewMode } from '../core/preview.js';
import {
  LOCATIONS,
  getLocation,
  evaluateUnlock,
  isWelcomeDay,
  HUB_SLOTS,
  dailySlotLineup,
  indexToSlot,
} from '../data/locations.js';
import { PERKS, getPerk } from '../data/perks.js';
import { ACHIEVEMENTS } from '../data/achievements.js';
import { forecast } from '../data/weather.js';
import { upcomingFestivals } from '../data/festivals.js';
import { activateModal } from './modal-controller.js';

/** Small DOM helper. */
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v === null || v === undefined) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

/** Signed number for display: 0 renders as an em dash. */
export function fmtDelta(n) {
  const v = Math.round(n);
  if (v === 0) return '—';
  return `${v > 0 ? '+' : ''}${v}`;
}

const STAT_META = [
  ['sanity', '🧘', 'Sanity'],
  ['money', '💰', 'Money'],
  ['energy', '⚡', 'Energy'],
  ['reputation', '🤝', 'Rep'],
  ['insight', '🔮', 'Insight'],
];

/** A compact row of +N / −N chips for a delta bundle. */
export function effectChips(bundle, cls = 'chips', weatherEmoji = '') {
  const chips = STAT_META.filter(([key]) => Math.round(bundle[key] ?? 0) !== 0).map(
    ([key, emoji]) => {
      const v = Math.round(bundle[key]);
      const label = weatherEmoji
        ? `${weatherEmoji} ${emoji} ${fmtDelta(v)}`
        : `${emoji} ${fmtDelta(v)}`;
      return el('span', { class: `chip ${v > 0 ? 'pos' : 'neg'}` }, label);
    },
  );
  if (chips.length === 0) chips.push(el('span', { class: 'chip', text: 'no change' }));
  return el('div', { class: cls, 'data-preview-mode': 'exact' }, ...chips);
}

/** Keep the established UI exports while the pure implementation lives in core. */
export { BAND_STRONG, locationFocusResources, previewMode } from '../core/preview.js';

export function effectBandedChips(bundle, cls = 'chips', weatherEmoji = '') {
  const chips = STAT_META.filter(([key]) => Math.round(bundle[key] ?? 0) !== 0).map(
    ([key, emoji]) => {
      const v = Math.round(bundle[key]);
      const band = previewBand(v);
      const label = weatherEmoji ? `${weatherEmoji} ${emoji} ${band}` : `${emoji} ${band}`;
      return el('span', { class: `chip banded ${v > 0 ? 'pos' : 'neg'}` }, label);
    },
  );
  if (chips.length === 0) chips.push(el('span', { class: 'chip', text: 'no change' }));
  return el('div', { class: cls, 'data-preview-mode': 'banded' }, ...chips);
}

/** Fog shows only the location's positive focus icon(s), with no +/- markers. */
export function effectFocusChips(location, cls = 'chips') {
  const focus = locationFocusResources(location);
  const accessible = focus.map((entry) => entry.label).join(' and ') || 'Place';
  const icons = focus.length ? focus : [{ key: 'place', emoji: '📍', label: 'Place' }];
  return el(
    'div',
    {
      class: `${cls} focus-chips`,
      'data-preview-mode': 'veiled',
      'data-focus': focus.map((entry) => entry.key).join(','),
      'aria-label': `Main focus: ${accessible}`,
    },
    ...icons.map((entry) =>
      el('span', {
        class: 'chip focus',
        text: entry.emoji,
        title: `${entry.label} focus`,
        'aria-hidden': 'true',
      }),
    ),
  );
}

/**
 * The preview chips a card is allowed to show today, honouring `previewMode`.
 * `weatherEmoji` marks weather-adjusted numbers on exact days.
 */
function chipsFor(gs, total, weatherEmoji, cls, location) {
  const mode = previewMode(gs.getWeather?.());
  if (mode === 'veiled') return effectFocusChips(location, cls);
  if (mode === 'banded') return effectBandedChips(total, cls, weatherEmoji);
  return effectChips(total, cls, weatherEmoji);
}

/**
 * The weather emoji, but only when the weather actually adjusted this
 * location's numbers — a sunny day that touches nothing gets no decoration.
 */
function weatherEmojiIfAdjusted(gs, reasons) {
  const w = gs.getWeather?.();
  return w && reasons.some((r) => r.includes(w.emoji)) ? w.emoji : '';
}

/**
 * Portrait <img> with graceful fallback to an initials chip.
 * By default the portrait is wrapped in a button that enlarges it — tapping
 * or clicking any portrait in the game opens the full-size art on its own.
 * The small avatar is a preview of the picture, so the picture is all the
 * popup shows. Pass `{ clickable: false }` where the portrait already sits
 * inside another interactive control (buttons cannot nest in valid HTML).
 */
function avatar(profile, cls = 'avatar', { clickable = true } = {}) {
  if (!profile) {
    return el('div', { class: cls, 'aria-label': 'Unknown' }, '?');
  }
  const initials = getInitials(profile.name);
  const img = el('img', {
    class: cls,
    src: profile.portrait || `assets/portraits/${profile.id}.webp`,
    alt: `${profile.name} portrait`,
    loading: 'lazy',
    decoding: 'async',
    draggable: 'false',
    width: '60',
    height: '60',
  });
  // A broken portrait must not leave a clickable button that opens an empty
  // lightbox, so the fallback replaces the whole control, button included.
  const chip = () => el('div', { class: cls, 'aria-label': `${profile.name} portrait` }, initials);

  if (!clickable) {
    img.addEventListener(
      'error',
      () => {
        img.replaceWith(chip());
      },
      { once: true },
    );
    return img;
  }

  const btn = el(
    'button',
    {
      class: 'avatar-btn',
      type: 'button',
      'aria-label': `${profile.name} — view portrait`,
      onclick: (e) => {
        e.stopPropagation();
        openCharacterPopup(profile);
      },
    },
    img,
  );
  img.addEventListener(
    'error',
    () => {
      btn.replaceWith(chip());
    },
    { once: true },
  );
  return btn;
}

/**
 * The enlarged-portrait lightbox: opened by clicking or tapping any portrait
 * in the game.
 *
 * Deliberately shows **the picture and nothing else** — no name, no role, no
 * bio, no stat lines. The small avatar dotted around the UI is a thumbnail
 * preview, and this is simply that thumbnail at full size, so any chrome
 * would be competing with the art. Character bios live on the People screen,
 * which is where a player goes to *read* about someone.
 *
 * The <img> loads `portraitHi` (896px) rather than the inline thumbnail
 * (288px), and only at this moment — the large sheet is never part of the
 * initial page weight. If the hi tier is missing for any reason the image
 * silently falls back to the thumbnail rather than showing a broken frame.
 *
 * Closing never touches game state.
 */
/** @param {object} profile @param {{onClose?:()=>void}} [options] */
export function renderPortraitPopup(profile, { onClose } = {}) {
  const thumb = profile.portrait || `assets/portraits/${profile.id}.webp`;
  const full = profile.portraitHi || `assets/portraits/hi/${profile.id}.webp`;

  const img = el('img', {
    class: 'portrait-full',
    src: full,
    // The alt text is the one concession to a name: screen readers need to
    // know whose face this is, but nothing is drawn on screen.
    alt: `${profile.name} portrait, enlarged`,
    decoding: 'async',
    draggable: 'false',
  });
  img.addEventListener(
    'error',
    () => {
      // Fall back once to the small sheet; if that fails too, leave it be
      // rather than looping.
      if (img.getAttribute('src') !== thumb) img.setAttribute('src', thumb);
    },
    { once: true },
  );

  const close = el(
    'button',
    {
      class: 'portrait-close',
      type: 'button',
      'aria-label': 'Close portrait',
      onclick: () => onClose?.(),
    },
    '×',
  );

  const figure = el(
    'div',
    {
      class: 'portrait-lightbox',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': `${profile.name} portrait`,
    },
    img,
    close,
  );

  const backdrop = el('div', { class: 'modal-backdrop portrait-popup-backdrop' }, figure);
  // Tapping anywhere outside the picture dismisses it. Tapping the picture
  // itself also dismisses — with no controls to hit, "tap again to put it
  // away" is the behaviour people expect from a photo viewer.
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop || e.target === img || e.target === figure) onClose?.();
  });
  return backdrop;
}

/** The close handler of the currently open lightbox, if any. */
let closeOpenPopup = null;

/**
 * Opens (or replaces) the portrait popup for a character, appended straight
 * to <body> like the day-result modal. Self-contained so any screen can call
 * it without threading a callback all the way up through app.js — nothing
 * here mutates GameState, so it stays inside the "screens read, never
 * write" rule.
 */
export function openCharacterPopup(profile) {
  if (!profile) return;
  // Close via the previous popup's own cleanup: removing the backdrop from
  // the DOM alone would orphan its document keydown listener, one per open.
  closeOpenPopup?.();

  let deactivate = () => {};
  const close = () => {
    backdrop.remove();
    deactivate();
    if (closeOpenPopup === close) closeOpenPopup = null;
  };
  closeOpenPopup = close;

  const backdrop = renderPortraitPopup(profile, { onClose: close });
  document.body.append(backdrop);
  deactivate = activateModal(document, backdrop, {
    initialFocusSelector: '.portrait-close',
    onEscape: close,
  });
}

/** Look up a character profile by id from a GameState (or raw list). */
function findCharacter(gsOrList, id) {
  if (!id) return null;
  const list = Array.isArray(gsOrList)
    ? gsOrList
    : gsOrList?.characterProfiles || gsOrList?.getAllCharacters?.() || [];
  return list.find((p) => p.id === id) || null;
}

/** Standard back button used by every sub-screen. */
function backRow(onBack, ...extra) {
  return el(
    'div',
    { class: 'action-row' },
    el('button', { class: 'btn', text: '← Back to hub', onclick: onBack }),
    ...extra,
  );
}

// ------------------------------------------------------------------ hub

export function renderHub(gs, handlers) {
  const { onVisit, onCharacters, onPerks, onAlmanac } = handlers;
  const weather = gs.getWeather();
  const festival = gs.getFestival();
  const nudge = typeof gs.getDailyNudge === 'function' ? gs.getDailyNudge() : null;

  const historyItems = gs.recentHistory.length
    ? el('ul', {}, ...gs.recentHistory.map((h) => el('li', { text: h })))
    : el('p', { class: 'empty', text: 'Nothing yet — your journey begins today.' });

  // The two founding places are the primary choices.
  const quick = ['spiritual_community', 'bar'].map((id, offset) => {
    const location = getLocation(id);
    const { total, reasons } = computeDayEffects(gs, id, { preview: true });
    const weatherEmoji = weatherEmojiIfAdjusted(gs, reasons);
    return el(
      'button',
      {
        class: 'choice choice-primary',
        onclick: () => onVisit(id),
        'data-location': id,
        'data-slot': String(indexToSlot(offset)),
      },
      el('span', { class: 'choice-name', text: `${location.emoji} ${location.name}` }),
      el('span', { class: 'choice-action', text: location.actionLabel }),
      chipsFor(gs, total, weatherEmoji, 'chips choice-eff', location),
    );
  });

  const snap = {
    journeyDay: gs.journeyDay,
    reputation: gs.reputation,
    weekday: gs.getWeekdayIndex ? gs.getWeekdayIndex() : 0,
    perks: gs.perks,
    closedTags: typeof gs.getClosedTags === 'function' ? gs.getClosedTags() : [],
  };

  // Cards 3-6 rotate *within* their slot, never between slots: every
  // location is permanently assigned to one of the four, so the third card
  // is always somewhere quiet and the sixth is always a night or an errand.
  // The choice inside a slot is deterministic in (slot, day, seed), so the
  // board is stable across rerenders and across a reload of the same save.
  const selected = dailySlotLineup(snap, gs.weatherSeed || 0).filter(Boolean);

  const otherChoices = selected.map((location, offset) => {
    const slot = HUB_SLOTS[offset];
    const { total, reasons } = computeDayEffects(gs, location.id, { preview: true });
    const weatherEmoji = weatherEmojiIfAdjusted(gs, reasons);
    const visited = gs.visitedLocations.has(location.id);
    const { unlocked, reason } = evaluateUnlock(location, snap);
    // The pinned day-one invitation gets a quiet badge so the player can see
    // it is a one-off welcome rather than a place they have already earned.
    const isWelcome = location.dayOneWelcome && isWelcomeDay(snap.journeyDay);

    if (unlocked) {
      return el(
        'button',
        {
          class: `choice choice-primary${visited ? ' visited' : ''}${isWelcome ? ' welcome' : ''}`,
          onclick: () => onVisit(location.id),
          'data-location': location.id,
          'data-slot': String(slot),
          // Explicit string: the el() helper renders a boolean `true` as a bare
          // valueless attribute, which reads back as '' rather than 'true'.
          'data-welcome': isWelcome ? 'true' : false,
        },
        el('span', { class: 'choice-name', text: `${location.emoji} ${location.name}` }),
        el('span', { class: 'choice-action', text: location.actionLabel }),
        isWelcome
          ? el('span', { class: 'choice-welcome', text: '✨ Brian is expecting you' })
          : null,
        chipsFor(gs, total, weatherEmoji, 'chips choice-eff', location),
      );
    } else {
      return el(
        'button',
        {
          class: 'choice locked',
          disabled: true,
          'data-location': location.id,
          'data-slot': String(slot),
        },
        el('span', { class: 'choice-name', text: `${location.emoji} ${location.name}` }),
        el('span', { class: 'choice-action', text: `Locked: ${reason}` }),
      );
    }
  });

  const greeting = typeof gs.getGreeting === 'function' ? gs.getGreeting() : '';

  return el(
    'div',
    {
      class: 'screen hub',
      style: "background-image:url('assets/backgrounds/hub_background.webp')",
      'data-bg': 'assets/backgrounds/hub_background.webp',
    },
    el(
      'div',
      { class: 'hub-heading' },
      el(
        'div',
        {},
        el('p', { class: 'eyebrow', text: 'Today’s choice' }),
        el('h2', { class: 'screen-title', text: 'Where will you spend today?' }),
        el('p', {
          class: 'hub-meta',
          text: `${gs.getDateDisplay()}  |  Journey Day ${gs.journeyDay}`,
        }),
      ),
      el('span', { class: 'weather-badge', text: `${weather.emoji} ${weather.name}` }),
    ),
    greeting ? el('p', { class: 'hub-greeting', text: greeting }) : null,
    nudge
      ? el(
          'aside',
          { class: 'daily-nudge', 'aria-label': nudge.label },
          el('span', { class: 'nudge-emoji', text: nudge.emoji }),
          el('div', {}, el('strong', { text: nudge.label }), el('span', { text: nudge.text })),
        )
      : null,
    festival
      ? el('p', {
          class: 'festival-banner',
          text: `${festival.emoji} ${festival.name} — ${festival.line}`,
        })
      : null,

    el('div', { class: 'choices' }, ...quick, ...otherChoices),

    el(
      'div',
      { class: 'hub-tools', 'aria-label': 'Journey tools' },
      el('span', { class: 'tool-label', text: 'Keep close' }),
      el('button', { class: 'btn btn-small', onclick: onPerks, text: `🔮 Practice ${gs.insight}` }),
      el('button', { class: 'btn btn-small', onclick: onAlmanac, text: '📖 Weather & milestones' }),
      el('button', { class: 'btn btn-small', onclick: onCharacters, text: '👥 People' }),
    ),

    el(
      'details',
      { class: 'history' },
      el('summary', {
        text: `Recent days${gs.recentHistory.length ? ` (${gs.recentHistory.length})` : ''}`,
      }),
      historyItems,
    ),
  );
}

// ------------------------------------------------------------- location

export function renderLocation(gs, locationId, { onAction, onBack, onSpecial, onBuyRenovation }) {
  const location = getLocation(locationId);
  const { total, reasons } = computeDayEffects(gs, locationId, { preview: true });
  const weatherEmoji = weatherEmojiIfAdjusted(gs, reasons);
  const mode = previewMode(gs.getWeather?.());
  const particles = el('div', { class: 'particles', 'aria-hidden': 'true' });

  const actionBtn = el('button', {
    class: 'btn btn-primary',
    text: `${location.emoji} ${location.actionLabel}`,
  });
  const backBtn = el('button', { class: 'btn', text: '← Back to hub' });

  actionBtn.addEventListener('click', () => {
    actionBtn.disabled = true;
    backBtn.disabled = true;
    onAction(locationId);
  });
  backBtn.addEventListener('click', () => onBack());

  // Location specials: the pawnbroker, the letting office, and so on.
  const special = renderSpecial(gs, location, onSpecial);

  const host = findCharacter(gs, location.host);
  // Hosts speak in their own voice here. Full biographies remain on the People
  // screen, so a location can stay about the day rather than become a dossier.
  const hostBanner = host
    ? el(
        'aside',
        { class: 'host-banner', 'aria-label': `A word from ${host.name}` },
        avatar(host, 'avatar host-avatar-lg'),
        el(
          'div',
          { class: 'host-meeting' },
          el('div', { class: 'host-label', text: 'Here today' }),
          el('div', { class: 'host-name-lg', text: host.name }),
          el('blockquote', {
            class: 'small-talk',
            text: `“${smallTalkFor(host.id, gs.journeyDay)}”`,
          }),
        ),
      )
    : null;

  const node = el(
    'div',
    {
      class: 'screen location',
      style: location.bg ? `background-image:url('${location.bg}')` : '',
      'data-bg': location.bg || '',
    },
    particles,
    el('h2', { class: 'screen-title', text: `${location.emoji} ${location.name}` }),
    el('p', { class: 'screen-sub', text: location.desc }),
    hostBanner,

    el(
      'div',
      { class: 'preview', 'data-preview-mode': mode },
      el('h3', { text: 'Today, here' }),
      chipsFor(gs, total, weatherEmoji, 'chips preview-chips', location),
      mode !== 'veiled' && reasons.length > 0
        ? el('p', { class: 'preview-why', text: `Adjusted by: ${reasons.join(', ')}` })
        : null,
    ),

    special,
    locationId === 'house_of_middleway' && gs.isRenovationUnlocked?.()
      ? el(
          'div',
          { class: 'community-projects preview' },
          el('h3', { text: 'Community Projects: House of Middleway Renovation' }),
          el('p', {
            class: 'preview-why',
            text: 'Use your insight and community resources to restore the sanctuary.',
          }),
          el(
            'div',
            { class: 'renovation-list' },
            ...gs.getRenovations().map((r) => {
              if (r.owned) {
                return el('div', {
                  class: 'renovation-item owned',
                  text: `✓ ${r.name} — Completed (+${r.reward.reputation} Rep, +${r.reward.sanity} Sanity)`,
                });
              }
              return el('button', {
                class: 'btn btn-small project-btn',
                disabled: !r.canBuy,
                text: `Fund: ${r.name} (${r.cost.insight} Insight, ${r.cost.money} Money)`,
                title: r.desc,
                onclick: () => onBuyRenovation?.(r.id),
              });
            }),
          ),
        )
      : null,
    el('div', { class: 'action-row' }, actionBtn, backBtn),
  );

  node._startParticles = () => startParticles(particles);
  return node;
}

/** Extra interaction offered by a handful of locations. */
function renderSpecial(gs, location, onSpecial) {
  if (location.special === 'prepay_rent') {
    const cost = gs.rentDue();
    const covered = gs.rentPrepaidUntilDay > gs.journeyDay;
    return el(
      'div',
      { class: 'special' },
      el('p', {
        text: covered
          ? `You are paid up to journey day ${gs.rentPrepaidUntilDay}.`
          : 'You can settle a week ahead and buy yourself a quiet Sunday.',
      }),
      el('button', {
        class: 'btn btn-small',
        disabled: gs.money <= cost,
        text: `Pay a week ahead (${cost} money)`,
        onclick: () => onSpecial('prepay_rent'),
      }),
    );
  }
  if (location.special === 'long_trip') {
    return el('p', {
      class: 'special-note',
      text: 'Three days of silence, counted as one turn — you come back down on the third evening and the calendar moves forward with you.',
    });
  }

  return null;
}

/** Floating motes. */
function startParticles(container) {
  const settingDisablesMotion = document.documentElement.classList.contains('reduce-motion');
  if (settingDisablesMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return () => {};
  }
  const spawn = () => {
    if (!container.isConnected) return;
    const size = 2 + Math.random() * 3;
    const dur = 3 + Math.random() * 2;
    const p = el('div', { class: 'particle' });
    p.style.width = `${size}px`;
    p.style.height = `${size}px`;
    p.style.left = `${Math.random() * 100}%`;
    p.style.top = `${70 + Math.random() * 30}%`;
    p.style.setProperty('--p-op', String(0.08 + Math.random() * 0.14));
    p.style.animationDuration = `${dur}s`;
    container.append(p);
    setTimeout(() => p.remove(), dur * 1000);
  };
  for (let i = 0; i < 6; i++) setTimeout(spawn, i * 320);
  const id = setInterval(() => {
    container.isConnected ? spawn() : clearInterval(id);
  }, 850);
  return () => clearInterval(id);
}

// ----------------------------------------------------------------- perks

export function renderPerks(gs, { onBuy, onBack }) {
  const rows = PERKS.map((perk) => {
    const owned = gs.hasPerk(perk.id);
    const check = gs.canBuy(perk.id);
    return el(
      'div',
      { class: `perk-row${owned ? ' owned' : ''}${!owned && !check.ok ? ' blocked' : ''}` },
      el('span', { class: 'perk-emoji', text: perk.emoji }),
      el(
        'div',
        { class: 'perk-meta' },
        el('div', { class: 'perk-name', text: perk.name }),
        el('div', { class: 'perk-desc', text: perk.desc }),
        perk.requires.length > 0
          ? el('div', {
              class: 'perk-req',
              text: `after ${perk.requires.map((r) => getPerk(r).name).join(', ')}`,
            })
          : null,
      ),
      owned
        ? el('span', { class: 'perk-owned', text: '✓ learned' })
        : el('button', {
            class: 'btn btn-small',
            disabled: !check.ok,
            title: check.ok
              ? `Estimated: reachable ~day ${Math.ceil(perk.cost / 1.2 + (perk.requires.length || 0) * 5)}`
              : check.reason,
            text: `${perk.cost} 🔮`,
            onclick: () => onBuy(perk.id),
          }),
    );
  });

  return el(
    'div',
    { class: 'screen' },
    el('h2', { class: 'screen-title', text: '🔮 Practice' }),
    el('p', {
      class: 'screen-sub',
      text: `Quiet days give insight. Insight buys habits that stay bought. You have ${gs.insight}.`,
    }),
    el('div', { class: 'perk-list' }, ...rows),
    backRow(onBack),
  );
}

// --------------------------------------------------------------- almanac

export function renderAlmanac(gs, { onBack }) {
  const LOOKAHEAD = 4;
  // Per-day season *and* month: a forecast that crosses a month boundary can
  // also cross a season boundary, and each day's weather is computed with its
  // own pair — that is what lets fringe snow (November / early March) appear
  // in the almanac instead of being smeared into season-only weather.
  const calendar = Array.from({ length: LOOKAHEAD }, (_, i) => ({
    season: gs.peekSeason(i),
    monthIndex: gs.peekDay(i).monthIndex,
  }));
  const days = forecast(gs.journeyDay, gs.weatherSeed, calendar, LOOKAHEAD);
  const festivals = upcomingFestivals(gs.monthIndex, gs.dayOfMonth, 3);
  const earned = ACHIEVEMENTS.filter((a) => gs.achievements.has(a.id));
  const pending = ACHIEVEMENTS.filter((a) => !gs.achievements.has(a.id));

  // Energy outlook, banded against the *effective* exhaustion threshold so
  // the prose and the HUD bar's warning never disagree.
  const threshold = gs.exhaustionThreshold;
  const energyNow = gs.energy;
  const forecastEnergy =
    energyNow < threshold
      ? 'Low — rest will restore quickly.'
      : energyNow > 75
        ? 'Strong — you can push a little.'
        : 'Moderate — keep an eye on it.';

  return el(
    'div',
    { class: 'screen' },
    el('h2', { class: 'screen-title', text: '📖 The Almanac' }),
    el('p', {
      class: 'screen-sub',
      text: 'Weather is not luck. It is written down, and you can read ahead.',
    }),

    el('h3', { class: 'section-h', text: 'Energy Outlook' }),
    el('p', { class: 'energy-forecast', text: forecastEnergy }),

    el('h3', { class: 'section-h', text: 'Forecast' }),
    el(
      'div',
      { class: 'forecast' },
      ...days.map(({ day, weather }, i) =>
        el(
          'div',
          { class: `fc${i === 0 ? ' today' : ''}` },
          el('div', { class: 'fc-day', text: i === 0 ? 'Today' : `Day ${day}` }),
          el('div', { class: 'fc-emoji', text: weather.emoji }),
          el('div', { class: 'fc-name', text: weather.name }),
          weather.closes.length > 0
            ? el('div', { class: 'fc-closes', text: `closes ${weather.closes.join(', ')}` })
            : null,
        ),
      ),
    ),

    el('h3', { class: 'section-h', text: 'Coming up' }),
    el(
      'ul',
      { class: 'fest-list' },
      ...festivals.map((f) =>
        el('li', {}, el('strong', { text: `${f.emoji} ${f.name}` }), ` — ${f.line}`),
      ),
    ),

    el('h3', {
      class: 'section-h',
      text: `Achievements (${earned.length}/${ACHIEVEMENTS.length})`,
    }),
    el(
      'div',
      { class: 'ach-grid' },
      ...earned.map((a) =>
        el(
          'div',
          { class: 'ach earned', title: a.desc },
          el('span', { class: 'ach-emoji', text: a.emoji }),
          el('span', { class: 'ach-name', text: a.name }),
        ),
      ),
      ...pending.map((a) =>
        el(
          'div',
          { class: 'ach', title: a.desc },
          el('span', { class: 'ach-emoji', text: '·' }),
          el('span', { class: 'ach-name', text: a.name }),
        ),
      ),
    ),

    backRow(onBack),
  );
}

// ------------------------------------------------------------ settings

export function renderSettings(
  preferences,
  {
    onToggleContrast,
    onToggleMotion,
    onToggleSound,
    onChangeVolume,
    onCopyShare,
    onExportSave,
    onImportSave,
    onBack,
    onAbandon,
  },
  share = null,
) {
  const toggle = (label, enabled, handler, desc) =>
    el(
      'div',
      { class: 'settings-row' },
      el('button', {
        class: `settings-choice${enabled ? ' selected' : ''}`,
        type: 'button',
        'aria-pressed': String(enabled),
        onclick: handler,
        text: `${label}: ${enabled ? 'On' : 'Off'}`,
      }),
      desc ? el('p', { class: 'settings-desc', text: desc }) : null,
    );

  const soundOn = preferences.sound !== false;
  const volume = typeof preferences.volume === 'number' ? preferences.volume : 0.25;

  const volumeInput = el('input', {
    type: 'range',
    min: '0',
    max: '1',
    step: '0.05',
    value: String(volume),
    'aria-label': 'Music volume',
    oninput: (e) => onChangeVolume?.(Number(e.target.value)),
  });

  return el(
    'div',
    { class: 'screen settings-screen' },
    el('h2', { class: 'screen-title', text: '⚙️ Settings' }),
    el('p', {
      class: 'screen-sub',
      text: 'These preferences stay on this device and never roll the calendar.',
    }),

    el(
      'section',
      { class: 'settings-group' },
      el('h3', { text: 'Accessibility' }),
      toggle(
        'High contrast',
        preferences.highContrast,
        onToggleContrast,
        'Stronger color separation for text and chips.',
      ),
      toggle(
        'Reduced motion',
        preferences.reducedMotion,
        onToggleMotion,
        'Disables particles and collapses fade transitions.',
      ),
    ),

    el(
      'section',
      { class: 'settings-group' },
      el('h3', { text: 'Sound' }),
      toggle(
        'Background music',
        soundOn,
        onToggleSound,
        'A warm, slow piano loop — off until you turn it on, per autoplay rules.',
      ),
      el('div', { class: 'settings-row' }, el('label', { text: 'Volume' }), volumeInput),
    ),

    share?.url
      ? el(
          'section',
          { class: 'settings-group' },
          el('h3', { text: 'Share this city' }),
          el('p', {
            class: 'settings-desc',
            text: `This run's seed is ${share.seed}. Anyone opening the link below gets the same Paris — same weather, same event timing — in a fresh run of their own.`,
          }),
          el(
            'div',
            { class: 'share-controls' },
            el('input', {
              class: 'share-url',
              type: 'text',
              readonly: true,
              value: share.url,
              'aria-label': 'Shareable run-seed link',
              onclick: (e) => e.target.select(),
            }),
            el('button', {
              class: 'btn btn-small',
              type: 'button',
              text: 'Copy link',
              onclick: () => onCopyShare?.(share.url),
            }),
          ),
        )
      : null,

    (() => {
      const importInput = el('input', {
        type: 'file',
        accept: 'application/json,.json',
        hidden: true,
        'aria-label': 'Import save file',
        onchange: async (event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          const confirmed = window.confirm(
            'Import this save? Your current local run will be replaced after validation.',
          );
          if (confirmed) onImportSave?.(await file.text());
          event.target.value = '';
        },
      });
      return el(
        'section',
        { class: 'settings-group' },
        el('h3', { text: 'Save backup' }),
        el('p', {
          class: 'settings-desc',
          text: 'Export this run to a JSON file, or restore a backup from another browser.',
        }),
        el(
          'div',
          { class: 'settings-save-actions' },
          el('button', {
            class: 'btn btn-small',
            type: 'button',
            text: 'Export save',
            onclick: () => onExportSave?.(),
          }),
          el('button', {
            class: 'btn btn-small',
            type: 'button',
            text: 'Import save',
            onclick: () => importInput.click(),
          }),
          importInput,
        ),
      );
    })(),

    el(
      'section',
      { class: 'settings-group settings-danger' },
      el('h3', { text: 'Run' }),
      el('p', {
        class: 'settings-desc',
        text: 'Runs autosave after every day. You can abandon the current run and start over here.',
      }),
      el('button', {
        class: 'btn btn-danger',
        type: 'button',
        onclick: () => {
          if (window.confirm('Abandon this run and start over? Your progress will be deleted.')) {
            onAbandon?.();
          }
        },
        text: 'Abandon run & start over',
      }),
    ),

    backRow(onBack),
  );
}

// ------------------------------------------------------------ characters

const ROLE_ORDER = [Role.PROTAGONIST, Role.ARCH_NEMESIS, Role.RIVAL, Role.SIDE_CHARACTER];

const GROUP_TITLES = {
  [Role.PROTAGONIST]: 'Protagonist',
  [Role.ARCH_NEMESIS]: 'Arch Nemesis',
  [Role.RIVAL]: 'Rivals',
  [Role.SIDE_CHARACTER]: 'Side Characters',
};

export function getRelationshipMarker(gs, profile) {
  if (!gs || !profile) return '';
  const seen = gs.eventsSeen || new Set();
  const id = profile.id;
  const charEvents = eventsForCharacter(id);
  const count = charEvents.filter((e) => seen.has(e.id)).length;

  if (['sato', 'alex', 'kaden', 'brian'].includes(id)) {
    if (count === 0) return 'First meeting pending';
    if (count === 1) return 'Acquainted · First conversation';
    if (count === 2) return 'Arc deepening · Second beat fired';
    return 'Long-standing acquaintance · Late arc';
  }

  if (count === 0) return 'Unmet in conversation';
  if (count === 1) return 'First conversation had';
  return `Familiar (${count} encounters)`;
}

export function renderCharacters(profiles, { onBack, gs }) {
  const detail = el(
    'div',
    { class: 'detail' },
    el('p', { class: 'detail-empty', text: 'Select a character to read their story.' }),
  );

  const showDetail = (p) => {
    detail.replaceChildren(
      el(
        'div',
        { class: 'detail-head' },
        avatar(p, 'avatar detail-avatar'),
        el(
          'div',
          {},
          el('h3', { text: p.name }),
          el('div', { class: `detail-role role-${p.role}`, text: roleLabel(p.role) }),
        ),
      ),
      el('p', { text: p.bio }),
      el(
        'dl',
        {},
        el('dt', { text: 'Relationship to Léon' }),
        el('dd', { text: p.relationship }),
        gs ? el('dt', { text: 'Arc status' }) : null,
        gs ? el('dd', { text: getRelationshipMarker(gs, p) }) : null,
        el('dt', { text: 'Usually found at' }),
        el('dd', { text: p.location }),
      ),
    );
  };

  const allRows = [];
  const makeRow = (p) => {
    const marker = gs ? getRelationshipMarker(gs, p) : null;
    const row = el(
      'button',
      {
        class: `char-row role-${p.role}`,
        'aria-pressed': 'false',
      },
      avatar(p, 'avatar', { clickable: false }),
      el(
        'div',
        { class: 'char-meta' },
        el('div', { class: 'char-name', text: p.name }),
        el('div', { class: 'char-relationship', text: `↳ ${p.relationship}` }),
        el('div', { class: 'char-role', text: `${roleLabel(p.role)} · ${p.location}` }),
        marker ? el('div', { class: 'char-marker', text: `❖ ${marker}` }) : null,
      ),
    );

    row.addEventListener('click', () => {
      for (const r of allRows) r.setAttribute('aria-pressed', 'false');
      row.setAttribute('aria-pressed', 'true');
      showDetail(p);
    });
    row._profile = p;
    allRows.push(row);
    return row;
  };

  // These are ordinary buttons, deliberately not an ARIA listbox: native Tab
  // and activation behavior is more predictable than claiming an arrow-key
  // widget we do not implement.
  const list = el('div', { class: 'char-list', 'aria-label': 'Characters' });
  const groups = [];
  for (const role of ROLE_ORDER) {
    const members = profiles.filter((p) => p.role === role);
    if (members.length === 0) continue;
    const heading = el('div', { class: 'char-group', text: GROUP_TITLES[role] });
    const rows = members.map(makeRow);
    list.append(heading, ...rows);
    groups.push({ heading, rows });
  }

  const count = el('span', { class: 'char-count', text: `${profiles.length} people` });

  const search = el('input', {
    class: 'char-search',
    type: 'search',
    placeholder: 'Search by name, role or location…',
    'aria-label': 'Search characters',
  });

  search.addEventListener('input', () => {
    const q = search.value.trim().toLowerCase();
    let visible = 0;
    for (const { heading, rows } of groups) {
      let shown = 0;
      for (const row of rows) {
        const p = row._profile;
        const hit =
          !q ||
          p.name.toLowerCase().includes(q) ||
          p.location.toLowerCase().includes(q) ||
          roleLabel(p.role).toLowerCase().includes(q) ||
          p.bio.toLowerCase().includes(q);
        row.hidden = !hit;
        if (hit) shown += 1;
      }
      heading.hidden = shown === 0;
      visible += shown;
    }
    count.textContent = q
      ? `${visible} match${visible === 1 ? '' : 'es'}`
      : `${profiles.length} people`;
  });

  return el(
    'div',
    { class: 'screen' },
    el('h2', { class: 'screen-title', text: 'Characters' }),
    el('p', {
      class: 'screen-sub',
      text: 'The people who keep Léon’s city feeling like a home — every place has someone waiting.',
    }),
    el('div', { class: 'char-toolbar' }, search, count),
    el('div', { class: 'char-layout' }, list, detail),
    backRow(onBack),
  );
}

// ------------------------------------------------------------- game over

export function renderGameOver(gs, message, { onRestart }) {
  const stats = [
    ['Days survived', gs.journeyDay],
    ['Places visited', `${gs.visitedLocations.size} / ${LOCATIONS.length}`],
    ['Perks learned', gs.perks.size],
    ['Achievements', `${gs.achievements.size} / ${ACHIEVEMENTS.length}`],
    ['Reputation', Math.round(gs.reputation)],
  ];

  const title = gs.masteryWon
    ? 'The City Is Yours'
    : gs.won && gs.journeyDay >= ENDURANCE_GOAL_DAYS
      ? 'A Long Road Ended'
      : 'The Balance Broke';

  const closingNote = gs.masteryWon ? gs.masteryMessage : gs.won ? gs.winMessage : '';

  return el(
    'div',
    { class: 'screen gameover' },
    el('h2', { text: title }),
    el('p', { text: message }),
    closingNote
      ? el('p', {
          class: 'win-note',
          text: closingNote,
        })
      : null,
    el('p', {
      class: 'summary',
      text: `You lasted ${gs.journeyDay} day${gs.journeyDay === 1 ? '' : 's'}, ending on ${gs.getDateDisplay()}.`,
    }),
    el(
      'dl',
      { class: 'run-stats' },
      ...stats.flatMap(([k, v]) => [el('dt', { text: k }), el('dd', { text: String(v) })]),
    ),
    el('button', { class: 'btn btn-primary', text: 'Begin again', onclick: onRestart }),
  );
}

// ----------------------------------------------------------------- modal

export function renderResultModal(result, gs, { onContinue }) {
  const { actionDesc, event, rentCharged, deltas, weather, festival, achievements, exhaustion } =
    result;

  const eventChar = event?.character ? findCharacter(gs, event.character) : null;
  const eventBlock = event
    ? el(
        'div',
        { class: 'event-block' },
        el('span', { class: `rarity-tag rarity-${event.rarity}`, text: rarityLabel(event.rarity) }),
        eventChar
          ? el(
              'div',
              { class: 'event-person' },
              avatar(eventChar, 'avatar event-avatar'),
              el(
                'div',
                {},
                el('p', { class: 'event-title', text: event.title }),
                el('p', { class: 'event-who', text: eventChar.name }),
              ),
            )
          : el('p', { class: 'event-title', text: event.title }),
        el('p', { text: event.description }),
      )
    : null;

  const notes = [];
  if (result.justWon) notes.push(`🏅 ${result.winMessage || 'Sixty days. You held.'}`);
  if (result.masteryWon) notes.push(`🌟 ${result.masteryMessage}`);
  if (rentCharged) notes.push(`📅 Sunday rent came due — ${rentCharged} money.`);
  if (result.extraRent)
    notes.push(`📅 Rent came due while you were away — ${result.extraRent} money.`);
  if (exhaustion || result.exhaustionBurn) {
    const parts = [];
    if (exhaustion) parts.push(`${Math.abs(exhaustion)} sanity`);
    if (result.exhaustionBurn) parts.push(`${Math.abs(result.exhaustionBurn)} money`);
    notes.push(`😵 Running on empty cost you another ${parts.join(' and ')}.`);
  }
  if (festival) notes.push(`${festival.emoji} ${festival.name}.`);
  if (result.longTrip) notes.push(`🏔 Three days pass in silence. The calendar has moved.`);
  for (const a of achievements) notes.push(`${a.emoji} Achievement: ${a.name}.`);

  const modal = el(
    'div',
    { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Day result' },
    el('h3', { text: 'End of Day' }),
    el('p', { class: 'modal-weather', text: `${weather.emoji} ${weather.name}` }),
    el('p', { text: actionDesc }),
    notes.length > 0
      ? el('ul', { class: 'modal-notes' }, ...notes.map((n) => el('li', { text: n })))
      : null,
    eventBlock,
    el('div', { class: 'modal-stats' }, effectChips(deltas, 'chips')),
    el('div', {
      class: 'modal-totals',
      text: `Sanity ${Math.round((gs.sanity / MAX_STAT) * 100)}% · Money ${Math.round(gs.money)} · Energy ${Math.round((gs.energy / MAX_ENERGY) * 100)}% · Rep ${Math.round((gs.reputation / MAX_REPUTATION) * 100)}% · Insight ${gs.insight}`,
    }),
    el(
      'div',
      { class: 'modal-actions' },
      el('button', { class: 'btn btn-primary', text: 'Continue →', onclick: onContinue }),
    ),
  );

  const backdrop = el('div', { class: 'modal-backdrop' }, modal);
  // Intentionally *do not* advance time on a backdrop click: a stray tap must
  // never roll the calendar. The Continue button is the only way forward.

  // ModalController supplies the shared focus trap, inert background, scroll
  // lock and focus restoration. Escape is intentionally contained but does
  // not continue a resolved day; the explicit Continue button is the exit.
  return backdrop;
}

function rarityLabel(rarity) {
  return (
    { standard: 'Common', rare_helpful: 'Rare · Helpful', rare_hurtful: 'Rare · Hurtful' }[
      rarity
    ] ?? ''
  );
}

/** Small transient toast, used for achievements and saves. */
export function renderToast(text) {
  return el('div', { class: 'toast', role: 'status', text });
}

/**
 * A non-dismissable narrative interlude; the explicit button is the only exit.
 * `lead` is an optional DOM element rendered above the title — used to put a
 * face on a story beat (e.g. Kaden's portrait on the opening smear), matching
 * how the event popups preview their character.
 */
function renderStoryModal(title, lines, actions, className = '', lead = null) {
  const modal = el(
    'div',
    {
      class: `modal story-modal ${className}`,
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': title,
    },
    lead ?? null,
    el('h2', { text: title }),
    ...lines.map((line) => el('p', { text: line })),
    el('div', { class: 'modal-actions' }, ...actions),
  );
  return el('div', { class: 'modal-backdrop' }, modal);
}

/** Kaden's fixed opening story beat, shown once when day two begins. */
export function renderKadenSmearModal({ onContinue, gs }) {
  // Preview Kaden's face at the top of the interlude, exactly like the event
  // popups do — the rumour is his, so he should be the one visible.
  const kaden = findCharacter(gs, 'kaden');
  const lead = kaden
    ? el(
        'div',
        { class: 'story-lead' },
        avatar(kaden, 'avatar story-avatar'),
        el(
          'div',
          {},
          el('p', { class: 'story-who', text: kaden.name }),
          el('p', { class: 'story-role', text: roleLabel(kaden.role) }),
        ),
      )
    : null;
  return renderStoryModal(
    'A Rumour Finds Its Feet',
    [
      'By breakfast, Kaden has already been busy. A clipped recording, a few planted quotes, and the city has a version of Léon that is easier to repeat than to know.',
      '“Fragile fraud,” the posts call him — a man with a fragile ego playing at wisdom. Friends avoid his eyes. A regular cancels. The House suddenly feels very quiet.',
      'The lie has travelled faster than any answer can. For now, Léon has to let his work speak.',
    ],
    [el('button', { class: 'btn btn-primary', text: 'Face the day →', onclick: onContinue })],
    'kaden-smear-modal',
    lead,
  );
}

/** The optional late-game ending: it celebrates without ending the ongoing run. */
export function renderVictoryModal(gs, { onRestart, onContinue }) {
  return renderStoryModal(
    'You are enlightened!',
    [
      'One hundred and fifty days have passed. The House of Middleway stands restored: roof, kitchen, garden, and library all carrying the people who found their way here.',
      'You did not escape the city. You learned how to belong to it.',
    ],
    [
      el('button', { class: 'btn btn-primary', text: 'Continue →', onclick: onContinue }),
      el('button', { class: 'btn', text: 'Restart', onclick: onRestart }),
    ],
    'victory-modal',
  );
}
