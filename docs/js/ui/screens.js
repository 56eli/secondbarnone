/**
 * Screen renderers. Each returns a DOM element; app.js swaps them into
 * #content.
 *
 * Rule for this file: it may read state, but it must never mutate it. Every
 * mutation goes back through a callback so that the rules stay in core/.
 */

import { getInitials, Role, roleLabel, smallTalkFor } from '../data/characters.js';
import { MAX_STAT, MAX_ENERGY, MAX_REPUTATION, ENDURANCE_GOAL_DAYS } from '../core/game-state.js';
import { computeDayEffects } from '../core/turn.js';
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
import { OBSERVANCES, getObservance } from '../data/observances.js';
import { ACHIEVEMENTS } from '../data/achievements.js';
import { forecast } from '../data/weather.js';
import { upcomingFestivals } from '../data/festivals.js';

/** Small DOM helper. */
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v === null || v === undefined) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
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

/**
 * The weather emoji to stamp on a day's effect chips, or '' if the weather
 * did not move the numbers.
 *
 * Reads the structured `factors` from `computeDayEffects()`. This replaced
 * three copy-pasted nine-clause blocks that string-matched emoji back out of
 * human-readable prose to recover a value the engine already had — the
 * pattern behind the `weatherEmoji` ReferenceError in PR #23/#24.
 *
 * @param {{kind:string, emoji:string}[]} [factors]
 */
export function weatherEmojiFor(factors = []) {
  return factors.find((f) => f.kind === 'weather')?.emoji ?? '';
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
  return el('div', { class: cls }, ...chips);
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
/** @param {object} profile @param {{onClose?: () => void}} [opts] */
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

/**
 * Opens (or replaces) the portrait popup for a character, appended straight
 * to <body> like the day-result modal. Self-contained so any screen can call
 * it without threading a callback all the way up through app.js — nothing
 * here mutates GameState, so it stays inside the "screens read, never
 * write" rule.
 */
export function openCharacterPopup(profile) {
  if (!profile) return;
  document.querySelector('.portrait-popup-backdrop')?.remove();

  const previouslyFocused = document.activeElement;
  const close = () => {
    backdrop.remove();
    document.removeEventListener('keydown', onKey);
    if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') close();
  };

  const backdrop = renderPortraitPopup(profile, { onClose: close });
  document.addEventListener('keydown', onKey);
  document.body.append(backdrop);
  // The close affordance is the only focusable thing in the lightbox, so
  // focus lands there and Escape/Enter both do the obvious thing.
  backdrop.querySelector('.portrait-close')?.focus();
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
  const { onVisit, onCharacters, onPerks, onAlmanac, onRetire } = handlers;
  const weather = gs.getWeather();
  const festival = gs.getFestival();
  const nudge = typeof gs.getDailyNudge === 'function' ? gs.getDailyNudge() : null;

  const historyItems = gs.recentHistory.length
    ? el('ul', {}, ...gs.recentHistory.map((h) => el('li', { text: h })))
    : el('p', { class: 'empty', text: 'Nothing yet — your journey begins today.' });

  // The two founding places are the primary choices.
  const quick = ['spiritual_community', 'bar'].map((id, offset) => {
    const location = getLocation(id);
    const { total, factors } = computeDayEffects(gs, id);
    const weatherEmoji = weatherEmojiFor(factors);
    return el(
      'button',
      {
        class: 'choice choice-primary',
        onclick: () => onVisit(id),
        'data-location': id,
        'data-slot': String(indexToSlot(offset)),
      },
      el('span', { class: 'choice-name', text: `${location.emoji} ${location.name}` }),
      location.gloss ? el('span', { class: 'choice-gloss', text: location.gloss }) : null,
      el('span', { class: 'choice-action', text: location.actionLabel }),
      effectChips(total, 'chips choice-eff', weatherEmoji),
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
    const { total, factors } = computeDayEffects(gs, location.id);
    const weatherEmoji = weatherEmojiFor(factors);
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
        location.gloss ? el('span', { class: 'choice-gloss', text: location.gloss }) : null,
        el('span', { class: 'choice-action', text: location.actionLabel }),
        isWelcome
          ? el('span', { class: 'choice-welcome', text: '✨ Brian is expecting you' })
          : null,
        effectChips(total, 'chips choice-eff', weatherEmoji),
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
        location.gloss ? el('span', { class: 'choice-gloss', text: location.gloss }) : null,
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
      gs.journeyDay >= ENDURANCE_GOAL_DAYS
        ? el('button', { class: 'btn btn-small', onclick: onRetire, text: '🕯️ Rest here' })
        : null,
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

export function renderLocation(gs, locationId, { onAction, onBack, onSpecial }) {
  const location = getLocation(locationId);
  const { total, reasons, factors } = computeDayEffects(gs, locationId);
  const weatherEmojiForLocation = weatherEmojiFor(factors);
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
    },
    particles,
    el('h2', { class: 'screen-title', text: `${location.emoji} ${location.name}` }),
    location.gloss ? el('p', { class: 'location-gloss', text: location.gloss }) : null,
    el('p', { class: 'screen-sub', text: location.desc }),
    hostBanner,

    el(
      'div',
      { class: 'preview' },
      el('h3', { text: 'Today, here' }),
      effectChips(total, 'chips preview-chips', weatherEmojiForLocation),
      reasons.length > 0
        ? el('p', { class: 'preview-why', text: `Adjusted by: ${reasons.join(', ')}` })
        : null,
    ),

    special,
    el('div', { class: 'action-row' }, actionBtn, backBtn),
  );

  node._startParticles = () => startParticles(particles);
  return node;
}

/** Extra interaction offered by a handful of locations. */
function renderSpecial(gs, location, onSpecial) {
  if (location.special === 'prepay_rent') {
    // Ask what a week ahead actually costs rather than assuming it is this
    // week's rent: rent escalates, and `prepayCost()` prices each week at the
    // Sunday it covers so paying ahead is never a discount.
    const cost = typeof gs.prepayCost === 'function' ? gs.prepayCost(1) : gs.rentDue();
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
        disabled: gs.money < cost,
        text: `Pay a week ahead (${cost} money)`,
        onclick: () => onSpecial('prepay_rent'),
      }),
    );
  }
  if (location.special === 'long_trip') {
    return el('p', {
      class: 'special-note',
      text: 'It feels like three days. The game counts it as one.',
    });
  }

  return null;
}

/** Floating motes. */
function startParticles(container) {
  if (
    document.body?.dataset?.reducedMotion === 'reduce' ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
    return () => {};
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

export function renderPerks(gs, { onBuy, onBack, onObserve }) {
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
            // Honest tooltip. This used to claim "Estimated: reachable ~day N"
            // computed as cost/1.2 + requires*5 — a made-up number that had no
            // relationship to the player's income and read as a projection.
            // What the player can actually use is the truth: the price, and
            // what they hold against it. If that is not enough here, the
            // honest fix is to say less, not to estimate harder.
            title: check.ok
              ? `You hold ${Math.floor(gs.insight)} 🔮 — enough to learn this now`
              : check.reason,
            text: `${perk.cost} 🔮`,
            onclick: () => onBuy(perk.id),
          }),
    );
  });

  // ---- observances: the repeatable half of the insight economy ----
  // Perks are who Léon has become and are bought out by ~day 20; observances
  // are what he is doing about tomorrow, and never stop being buyable. See
  // data/observances.js for the design rules.
  const pending = gs.pendingObservance;
  const pendingDef = pending ? getObservance(pending.id) : null;

  const observanceRows = OBSERVANCES.map((o) => {
    const check =
      typeof gs.canObserve === 'function' ? gs.canObserve(o.id) : { ok: false, reason: '' };
    const active = pending?.id === o.id;
    return el(
      'div',
      {
        class: `perk-row observance-row${active ? ' owned' : ''}${!active && !check.ok ? ' blocked' : ''}`,
      },
      el('span', { class: 'perk-emoji', text: o.emoji }),
      el(
        'div',
        { class: 'perk-meta' },
        el('div', { class: 'perk-name', text: o.name }),
        el('div', { class: 'perk-desc', text: o.desc }),
        el('div', {
          class: 'perk-req',
          text: `lasts ${o.duration} day${o.duration === 1 ? '' : 's'}`,
        }),
      ),
      active
        ? el('span', { class: 'perk-owned', text: `✓ until day ${pending.untilDay}` })
        : el('button', {
            class: 'btn btn-small',
            disabled: !check.ok,
            title: check.ok ? `Begin this observance for ${o.cost} insight` : check.reason,
            text: `${o.cost} 🔮`,
            onclick: () => onObserve?.(o.id),
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
    el('h3', { class: 'section-h', text: 'Habits — bought once, kept for good' }),
    el('div', { class: 'perk-list' }, ...rows),

    el('h3', { class: 'section-h', text: 'Observances — kept for a while, then let go' }),
    el('p', {
      class: 'screen-sub',
      text: pendingDef
        ? `You are keeping ${pendingDef.name} until day ${pending.untilDay}. Beginning another sets this one down.`
        : 'Something to hold for the next few days. One at a time.',
    }),
    el('div', { class: 'perk-list' }, ...observanceRows),
    backRow(onBack),
  );
}

// --------------------------------------------------------------- almanac

export function renderAlmanac(gs, { onBack }) {
  // Pass the calendar date, not just today's season: a forecast that spans a
  // season boundary has to derive each day's season for itself. See the note
  // on `forecast()` — journey day 60 lands on 1 March in a default run.
  const days = forecast(
    gs.journeyDay,
    gs.weatherSeed,
    { monthIndex: gs.monthIndex, dayOfMonth: gs.dayOfMonth, year: gs.year },
    4,
  );
  const festivals = upcomingFestivals(gs.monthIndex, gs.dayOfMonth, 3);
  const earned = ACHIEVEMENTS.filter((a) => gs.achievements.has(a.id));
  const pending = ACHIEVEMENTS.filter((a) => !gs.achievements.has(a.id));

  // Energy forecast: predict trajectory based on current energy level
  const energyNow = gs.energy;
  const forecastEnergy =
    energyNow < 25
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

    // The rent curve, stated plainly. Rent now rises over a run, and a
    // pressure the player cannot see coming is just an ambush.
    el('h3', { class: 'section-h', text: 'The Rent' }),
    el('p', {
      class: 'energy-forecast',
      text:
        typeof gs.baseRentOn === 'function'
          ? (() => {
              const now = gs.baseRentOn();
              const next = gs.nextRentRiseDay?.();
              return next
                ? `${now} a week now. It goes up to ${gs.baseRentOn(next)} on day ${next}.`
                : `${now} a week. It will not rise again.`;
            })()
          : '',
    }),

    el('h3', { class: 'section-h', text: 'The sixty-day rest' }),
    el('p', {
      class: 'energy-forecast',
      text:
        gs.journeyDay >= ENDURANCE_GOAL_DAYS
          ? 'You have held long enough. The hub now offers Rest here when you want this run to become an ending.'
          : `${ENDURANCE_GOAL_DAYS - gs.journeyDay} day${ENDURANCE_GOAL_DAYS - gs.journeyDay === 1 ? '' : 's'} until you can rest here and end the run on your own terms.`,
    }),

    // Mastery was previously live code with no achievement, no almanac entry
    // and no mention in any document — unreachable *and* undiscoverable.
    ...(typeof gs.masteryProgress === 'function'
      ? [
          el('h3', { class: 'section-h', text: gs.masteryWon ? 'Mastery — kept' : 'Mastery' }),
          el('p', {
            class: 'energy-forecast',
            text: gs.masteryWon
              ? gs.masteryMessage
              : 'A hundred days, well known and well travelled, held without leaning on the bar.',
          }),
          el(
            'ul',
            { class: 'mastery-list' },
            ...gs.masteryProgress().map((row) => {
              const ok = row.atMost ? row.now <= row.need : row.now >= row.need;
              return el('li', {
                class: ok ? 'mastery-met' : '',
                text: `${ok ? '✓' : '·'} ${row.label}: ${row.now} / ${row.atMost ? 'at most ' : ''}${row.need}`,
              });
            }),
          ),
        ]
      : []),

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

// ------------------------------------------------------------ characters

const ROLE_ORDER = [Role.PROTAGONIST, Role.ARCH_NEMESIS, Role.RIVAL, Role.SIDE_CHARACTER];

const GROUP_TITLES = {
  [Role.PROTAGONIST]: 'Protagonist',
  [Role.ARCH_NEMESIS]: 'Arch Nemesis',
  [Role.RIVAL]: 'Rivals',
  [Role.SIDE_CHARACTER]: 'Side Characters',
};

/**
 * How well Léon knows someone, in words.
 *
 * Affinity is a raw count of shared moments; this is the only place it is
 * turned into language, so the thresholds live in one spot and the People
 * screen never shows the player a bare integer.
 */
export function acquaintanceLabel(count) {
  if (count <= 0) return '';
  if (count === 1) return 'You have crossed paths once.';
  if (count < 4) return `You have crossed paths ${count} times.`;
  if (count < 8) return `A familiar face — ${count} times now.`;
  return `You know each other well by now — ${count} times.`;
}

/**
 * @param {object[]} profiles
 * @param {{onBack: () => void, affinity?: Record<string, number>}} handlers
 */
export function renderCharacters(profiles, { onBack, affinity = {} }) {
  const detail = el(
    'div',
    // aria-live: selecting a row swaps this panel's contents, and a screen
    // reader was previously told nothing at all when it changed.
    { class: 'detail', 'aria-live': 'polite', tabindex: '-1' },
    el('p', { class: 'detail-empty', text: 'Select a character to read their story.' }),
  );

  const showDetail = (p) => {
    const met = affinity[p.id] ?? 0;
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
          met > 0 ? el('div', { class: 'detail-met', text: acquaintanceLabel(met) }) : null,
        ),
      ),
      el('p', { text: p.bio }),
      el(
        'dl',
        {},
        el('dt', { text: 'Relationship to Léon' }),
        el('dd', { text: p.relationship }),
        el('dt', { text: 'Usually found at' }),
        el('dd', { text: p.location }),
      ),
    );
  };

  const allRows = [];
  let selectedRow = null;
  const visibleRows = () => allRows.filter((row) => !row.hidden);
  const selectRow = (row, { focus = false } = {}) => {
    if (!row) return;
    for (const r of allRows) r.setAttribute('aria-selected', 'false');
    row.setAttribute('aria-selected', 'true');
    selectedRow = row;
    list.setAttribute('aria-activedescendant', row.id);
    showDetail(row._profile);
    if (focus) row.focus();
  };
  const makeRow = (p) => {
    const row = el(
      'button',
      {
        id: `character-option-${p.id}`,
        class: `char-row role-${p.role}`,
        role: 'option',
        tabindex: '-1',
        'aria-selected': 'false',
      },
      avatar(p, 'avatar', { clickable: false }),
      el(
        'div',
        { class: 'char-meta' },
        el('div', { class: 'char-name', text: p.name }),
        el('div', { class: 'char-relationship', text: `↳ ${p.relationship}` }),
        el('div', { class: 'char-role', text: `${roleLabel(p.role)} · ${p.location}` }),
      ),
      // A quiet marker for people this run has actually met, so the roster
      // reads as "who I know" rather than an encyclopaedia handed over at
      // turn one.
      (affinity[p.id] ?? 0) > 0
        ? el('span', {
            class: 'char-met',
            text: `×${affinity[p.id]}`,
            title: acquaintanceLabel(affinity[p.id]),
          })
        : null,
    );

    row.addEventListener('click', () => selectRow(row));
    row._profile = p;
    allRows.push(row);
    return row;
  };

  const list = el('div', {
    class: 'char-list',
    role: 'listbox',
    tabindex: '0',
    'aria-label': 'Characters',
  });
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

  list.addEventListener('keydown', (e) => {
    const rows = visibleRows();
    if (rows.length === 0) return;
    const current = rows.indexOf(selectedRow);
    let next = current < 0 ? 0 : current;
    if (e.key === 'ArrowDown') next = current < 0 ? 0 : Math.min(rows.length - 1, current + 1);
    else if (e.key === 'ArrowUp') next = current < 0 ? 0 : Math.max(0, current - 1);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = rows.length - 1;
    else if (e.key === 'Enter' || e.key === ' ') next = current < 0 ? 0 : current;
    else return;
    e.preventDefault();
    selectRow(rows[next], { focus: true });
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
    ['Ending shape', typeof gs.getEnding === 'function' ? gs.getEnding().shape : '—'],
    ['Places visited', `${gs.visitedLocations.size} / ${LOCATIONS.length}`],
    ['Perks learned', gs.perks.size],
    ['Achievements', `${gs.achievements.size} / ${ACHIEVEMENTS.length}`],
    ['Reputation', Math.round(gs.reputation)],
  ];

  const ending = typeof gs.getEnding === 'function' ? gs.getEnding() : null;
  const title =
    ending?.title ??
    (gs.won && gs.journeyDay >= ENDURANCE_GOAL_DAYS ? 'A Long Road Ended' : 'The Balance Broke');
  const subtitle = ending?.subtitle ?? message;

  return el(
    'div',
    { class: 'screen gameover' },
    el('h2', { text: title }),
    el('p', { text: subtitle }),
    ending?.body ? el('p', { text: ending.body }) : el('p', { text: message }),
    ending && message && message !== ending.body && message !== subtitle
      ? el('p', { class: 'ending-cause', text: message })
      : null,
    gs.won
      ? el('p', {
          class: 'win-note',
          text: gs.winMessage || 'You reached the sixty-day milestone before the end.',
        })
      : null,
    gs.masteryWon ? el('p', { class: 'win-note', text: gs.masteryMessage }) : null,
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

/**
 * The end-of-day report.
 *
 * Since `resolveTurn()` became atomic this is a *report on a day that is
 * already over*, not a commit step — dismissing it cannot change the outcome,
 * which is why the backdrop and Escape are both allowed to close it.
 *
 * `fatal: true` is the same report for the day that ended the run. Showing it
 * matters: the player needs to see the event, the rent charge or the
 * exhaustion line that killed them, and previously the game cut straight from
 * the location screen to a tombstone.
 *
 * @param {object} result
 * @param {object} gs
 * @param {{onContinue: () => void, fatal?: boolean}} handlers
 */
export function renderResultModal(result, gs, { onContinue, fatal = false }) {
  const {
    actionDesc,
    event,
    rentCharged,
    deltas,
    weather,
    festival,
    achievements,
    exhaustion,
    resilienceGained,
    resilienceUsed,
    masteryWon,
    masteryMessage,
    resolvedDate,
  } = result;

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
  if (masteryWon) notes.push(`🌟 ${masteryMessage || 'A hundred days. The city knows you.'}`);
  if (rentCharged) notes.push(`📅 Sunday rent came due — ${rentCharged} money.`);
  if (exhaustion)
    notes.push(`😵 Running on empty cost you another ${Math.abs(exhaustion)} sanity.`);
  if (resilienceGained)
    notes.push(`🫶 The community left you ${resilienceGained} resilience for harder days.`);
  if (resilienceUsed) notes.push(`🫶 Community resilience absorbed ${resilienceUsed} of the blow.`);
  if (festival) notes.push(`${festival.emoji} ${festival.name}.`);
  for (const a of achievements) notes.push(`${a.emoji} Achievement: ${a.name}.`);

  const modal = el(
    'div',
    {
      class: `modal${fatal ? ' modal-fatal' : ''}`,
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': fatal ? 'The day the run ended' : 'Day result',
      tabindex: '-1',
    },
    el('h3', { text: fatal ? 'How It Ended' : 'End of Day' }),
    resolvedDate ? el('p', { class: 'modal-date', text: resolvedDate }) : null,
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
      el('button', {
        class: 'btn btn-primary',
        text: fatal ? 'See how it ended →' : 'Continue →',
        onclick: onContinue,
      }),
    ),
  );

  const backdrop = el('div', { class: 'modal-backdrop' }, modal);

  // Escape closes the report, matching the portrait lightbox and the settings
  // dialog. The day is already resolved and saved, so there is nothing to
  // confirm and nothing a stray key can cost the player.
  const onKey = (e) => {
    if (e.key === 'Escape') {
      document.removeEventListener('keydown', onKey);
      onContinue();
    }
  };
  document.addEventListener('keydown', onKey);
  backdrop._teardown = () => document.removeEventListener('keydown', onKey);

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) {
      document.removeEventListener('keydown', onKey);
      onContinue();
    }
  });
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
