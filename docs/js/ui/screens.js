/**
 * Screen renderers. Each returns a DOM element; app.js swaps them into
 * #content.
 *
 * Rule for this file: it may read state, but it must never mutate it. Every
 * mutation goes back through a callback so that the rules stay in core/.
 */

import { getInitials, Role, roleLabel, smallTalkFor } from '../data/characters.js';
import {
  MAX_STAT, MAX_ENERGY, MAX_REPUTATION, MONEY_SOFT_CAP,
  ENDURANCE_GOAL_DAYS,
} from '../core/game-state.js';
import { computeDayEffects } from '../core/turn.js';
import {
  LOCATIONS, DISTRICT_ORDER, getLocation, evaluateUnlock,
  isWelcomeDay,
  HUB_SLOTS, dailySlotLineup, indexToSlot,
} from '../data/locations.js';
import { PERKS, getPerk } from '../data/perks.js';
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

const STAT_META = [
  ['sanity', '🧘', 'Sanity'],
  ['money', '💰', 'Money'],
  ['energy', '⚡', 'Energy'],
  ['reputation', '🤝', 'Rep'],
  ['insight', '🔮', 'Insight'],
];

/** A compact row of +N / −N chips for a delta bundle. */
export function effectChips(bundle, cls = 'chips', weatherEmoji = '') {
  const chips = STAT_META
    .filter(([key]) => Math.round(bundle[key] ?? 0) !== 0)
    .map(([key, emoji]) => {
      const v = Math.round(bundle[key]);
      const label = weatherEmoji ? `${weatherEmoji} ${emoji} ${fmtDelta(v)}` : `${emoji} ${fmtDelta(v)}`;
      return el('span', { class: `chip ${v > 0 ? 'pos' : 'neg'}` }, label);
    });
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
    img.addEventListener('error', () => { img.replaceWith(chip()); }, { once: true });
    return img;
  }

  const btn = el('button', {
    class: 'avatar-btn',
    type: 'button',
    'aria-label': `${profile.name} — view portrait`,
    onclick: (e) => {
      e.stopPropagation();
      openCharacterPopup(profile);
    },
  }, img);
  img.addEventListener('error', () => { btn.replaceWith(chip()); }, { once: true });
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
  img.addEventListener('error', () => {
    // Fall back once to the small sheet; if that fails too, leave it be
    // rather than looping.
    if (img.getAttribute('src') !== thumb) img.setAttribute('src', thumb);
  }, { once: true });

  const close = el('button', {
    class: 'portrait-close',
    type: 'button',
    'aria-label': 'Close portrait',
    onclick: () => onClose?.(),
  }, '×');

  const figure = el('div', {
    class: 'portrait-lightbox',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': `${profile.name} portrait`,
  }, img, close);

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
    if (previouslyFocused?.focus) previouslyFocused.focus();
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };

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
    : (gsOrList?.characterProfiles || gsOrList?.getAllCharacters?.() || []);
  return list.find((p) => p.id === id) || null;
}

/**
 * Small "kept by …" chip used on location cards and the location screen.
 * `clickable` controls whether the mini avatar opens the character popup;
 * it must be false when the chip sits inside another button (the map's
 * location cards), since a <button> cannot contain another <button>.
 */
function hostChip(gs, hostId, cls = 'host-chip', { clickable = true } = {}) {
  const host = findCharacter(gs, hostId);
  if (!host) return null;
  return el('div', { class: cls },
    avatar(host, 'avatar host-avatar', { clickable }),
    el('span', { class: 'host-name', text: host.name }),
  );
}

/** Standard back button used by every sub-screen. */
function backRow(onBack, ...extra) {
  return el('div', { class: 'action-row' },
    el('button', { class: 'btn', text: '← Back to hub', onclick: onBack }),
    ...extra);
}

// ------------------------------------------------------------------ hub

export function renderHub(gs, handlers) {
  const {
    onVisit, onCharacters, onMap, onPerks, onAlmanac,
  } = handlers;
  const weather = gs.getWeather();
  const festival = gs.getFestival();
  const nudge = typeof gs.getDailyNudge === 'function' ? gs.getDailyNudge() : null;

  const historyItems = gs.recentHistory.length
    ? el('ul', {}, ...gs.recentHistory.map((h) => el('li', { text: h })))
    : el('p', { class: 'empty', text: 'Nothing yet — your journey begins today.' });

  // The two founding places are the primary choices.
  const quick = ['spiritual_community', 'bar'].map((id, offset) => {
    const location = getLocation(id);
    const { total, reasons } = computeDayEffects(gs, id);
    const weatherEmoji = reasons.some((r) => r.includes('☀️') || r.includes('☁️') || r.includes('🌧️') || r.includes('⛈️') || r.includes('🌫️') || r.includes('❄️') || r.includes('🔥') || r.includes('🧊') || r.includes('🌸')) ? (gs.getWeather()?.emoji ?? '') : '';
    return el('button', {
      class: 'choice choice-primary',
      onclick: () => onVisit(id),
      'data-location': id,
      'data-slot': String(indexToSlot(offset)),
    },
      el('span', { class: 'choice-name', text: `${location.emoji} ${location.name}` }),
      el('span', { class: 'choice-action', text: location.actionLabel }),
      effectChips(total, 'chips choice-eff'));
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
    const { total } = computeDayEffects(gs, location.id);
    const visited = gs.visitedLocations.has(location.id);
    const { unlocked, reason } = evaluateUnlock(location, snap);
    // The pinned day-one invitation gets a quiet badge so the player can see
    // it is a one-off welcome rather than a place they have already earned.
    const isWelcome = location.dayOneWelcome && isWelcomeDay(snap.journeyDay);

    if (unlocked) {
      return el('button', {
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
      effectChips(total, 'chips choice-eff', weatherEmoji)
      );
    } else {
      return el('button', {
        class: 'choice locked',
        disabled: true,
        'data-location': location.id,
        'data-slot': String(slot),
      },
        el('span', { class: 'choice-name', text: `${location.emoji} ${location.name}` }),
        el('span', { class: 'choice-action', text: `Locked: ${reason}` })
      );
    }
  });

  const greeting = typeof gs.getGreeting === 'function' ? gs.getGreeting() : '';

  return el('div', { class: 'screen hub', style: "background-image:url('assets/backgrounds/hub_background.webp')" },
    el('div', { class: 'hub-heading' },
      el('div', {},
        el('p', { class: 'eyebrow', text: 'Today’s choice' }),
        el('h2', { class: 'screen-title', text: 'Where will you spend today?' }),
        el('p', { class: 'hub-meta', text: `${gs.getDateDisplay()}  |  Journey Day ${gs.journeyDay}` })),
      el('span', { class: 'weather-badge', text: `${weather.emoji} ${weather.name}` })),
    greeting ? el('p', { class: 'hub-greeting', text: greeting }) : null,
    nudge ? el('aside', { class: 'daily-nudge', 'aria-label': nudge.label },
      el('span', { class: 'nudge-emoji', text: nudge.emoji }),
      el('div', {}, el('strong', { text: nudge.label }), el('span', { text: nudge.text }))) : null,
    festival
      ? el('p', { class: 'festival-banner', text: `${festival.emoji} ${festival.name} — ${festival.line}` })
      : null,

    el('div', { class: 'choices' }, ...quick, ...otherChoices),

    el('div', { class: 'hub-tools', 'aria-label': 'Journey tools' },
      el('span', { class: 'tool-label', text: 'Keep close' }),
      el('button', { class: 'btn btn-small', onclick: onPerks, text: `🔮 Practice ${gs.insight}` }),
      el('button', { class: 'btn btn-small', onclick: onAlmanac, text: '📖 Weather & milestones' }),
      el('button', { class: 'btn btn-small', onclick: onCharacters, text: '👥 People' })),

    el('details', { class: 'history' },
      el('summary', { text: `Recent days${gs.recentHistory.length ? ` (${gs.recentHistory.length})` : ''}` }),
      historyItems),
  );
}

// ------------------------------------------------------------------- map

export function renderMap(gs, { onVisit, onBack }) {
  const snap = {
    journeyDay: gs.journeyDay,
    reputation: gs.reputation,
    weekday: gs.getWeekdayIndex(),
    perks: gs.perks,
    closedTags: gs.getClosedTags(),
  };

  const districts = DISTRICT_ORDER.map((district) => {
    const here = LOCATIONS.filter((l) => l.district === district);
    if (here.length === 0) return null;

    const cards = here.map((location) => {
      const { unlocked, reason } = evaluateUnlock(location, snap);
      const { total } = computeDayEffects(gs, location.id);
      const visited = gs.visitedLocations.has(location.id);

      const card = el('button', {
        class: `loc-card${unlocked ? '' : ' locked'}${visited ? ' visited' : ''}`,
        disabled: !unlocked,
        'data-location': location.id,
      },
      el('span', { class: 'loc-name', text: `${location.emoji} ${location.name}` }),
      hostChip(gs, location.host, 'host-chip compact', { clickable: false }),
      unlocked
        ? effectChips(total, 'chips loc-chips')
        : el('span', { class: 'loc-lock', text: `🔒 ${reason}` }),
      el('span', { class: 'loc-tags', text: location.tags.join(' · ') }));

      if (unlocked) card.addEventListener('click', () => onVisit(location.id));
      return card;
    });

    const open = here.filter((l) => evaluateUnlock(l, snap).unlocked).length;
    return el('section', { class: 'district' },
      el('h3', { class: 'district-title' }, district,
        el('span', { class: 'district-count', text: ` ${open}/${here.length} open` })),
      el('div', { class: 'loc-grid' }, ...cards));
  }).filter(Boolean);

  return el('div', { class: 'screen map-screen' },
    el('h2', { class: 'screen-title', text: 'The City' }),
    el('p', { class: 'screen-sub', text: 'Effects shown include today’s weather, festivals, and your practice.' }),
    ...districts,
    backRow(onBack));
}

// ------------------------------------------------------------- location

export function renderLocation(gs, locationId, { onAction, onBack, onSpecial }) {
  const location = getLocation(locationId);
  const { total, reasons } = computeDayEffects(gs, locationId);
  const weatherEmojiForLocation = reasons.some((r) => r.includes('☀️') || r.includes('☁️') || r.includes('🌧️') || r.includes('⛈️') || r.includes('🌫️') || r.includes('❄️') || r.includes('🔥') || r.includes('🧊') || r.includes('🌸')) ? (gs.getWeather()?.emoji ?? '') : '';
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
    ? el('aside', { class: 'host-banner', 'aria-label': `A word from ${host.name}` },
      avatar(host, 'avatar host-avatar-lg'),
      el('div', { class: 'host-meeting' },
        el('div', { class: 'host-label', text: 'Here today' }),
        el('div', { class: 'host-name-lg', text: host.name }),
        el('blockquote', { class: 'small-talk', text: `“${smallTalkFor(host.id, gs.journeyDay)}”` })))
    : null;

  const node = el('div', { class: 'screen location', style: location.bg ? `background-image:url('${location.bg}')` : '' },
    particles,
    el('h2', { class: 'screen-title', text: `${location.emoji} ${location.name}` }),
    el('p', { class: 'screen-sub', text: location.desc }),
    hostBanner,

    el('div', { class: 'preview' },
      el('h3', { text: "Today, here" }),
      effectChips(total, 'chips preview-chips', weatherEmojiForLocation),
      reasons.length > 0
        ? el('p', { class: 'preview-why', text: `Adjusted by: ${reasons.join(', ')}` })
        : null),

    special,
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
    return el('div', { class: 'special' },
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
      }));
  }
  if (location.special === 'long_trip') {
    return el('p', { class: 'special-note', text: 'Three days, counted as one. They will not let you leave early.' });
  }

  return null;
}

/** Floating motes. */
function startParticles(container) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {};
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
  const id = setInterval(() => { container.isConnected ? spawn() : clearInterval(id); }, 850);
  return () => clearInterval(id);
}

// ----------------------------------------------------------------- perks

export function renderPerks(gs, { onBuy, onBack }) {
  const rows = PERKS.map((perk) => {
    const owned = gs.hasPerk(perk.id);
    const check = gs.canBuy(perk.id);
    return el('div', { class: `perk-row${owned ? ' owned' : ''}${!owned && !check.ok ? ' blocked' : ''}` },
      el('span', { class: 'perk-emoji', text: perk.emoji }),
      el('div', { class: 'perk-meta' },
        el('div', { class: 'perk-name', text: perk.name }),
        el('div', { class: 'perk-desc', text: perk.desc }),
        perk.requires.length > 0
          ? el('div', { class: 'perk-req', text: `after ${perk.requires.map((r) => getPerk(r).name).join(', ')}` })
          : null),
      owned
        ? el('span', { class: 'perk-owned', text: '✓ learned' })
        : el('button', {
          class: 'btn btn-small',
          disabled: !check.ok,
          title: check.ok ? `Estimated: reachable ~day ${Math.ceil(perk.cost / 1.2 + (perk.requires.length || 0) * 5)}` : check.reason,
          text: `${perk.cost} 🔮`,
          onclick: () => onBuy(perk.id),
        }));
  });

  return el('div', { class: 'screen' },
    el('h2', { class: 'screen-title', text: '🔮 Practice' }),
    el('p', { class: 'screen-sub', text: `Quiet days give insight. Insight buys habits that stay bought. You have ${gs.insight}.` }),
    el('div', { class: 'perk-list' }, ...rows),
    backRow(onBack));
}

// --------------------------------------------------------------- almanac

export function renderAlmanac(gs, { onBack }) {
  const days = forecast(gs.journeyDay, gs.weatherSeed, gs.getSeason(), 4);
  const festivals = upcomingFestivals(gs.monthIndex, gs.dayOfMonth, 3);
  const earned = ACHIEVEMENTS.filter((a) => gs.achievements.has(a.id));
  const pending = ACHIEVEMENTS.filter((a) => !gs.achievements.has(a.id));

  // Energy forecast: predict trajectory based on current energy level
  const energyNow = gs.energy;
  const forecastEnergy = energyNow < 25 ? 'Low — rest will restore quickly.'
    : energyNow > 75 ? 'Strong — you can push a little.'
    : 'Moderate — keep an eye on it.';

  return el('div', { class: 'screen' },
    el('h2', { class: 'screen-title', text: '📖 The Almanac' }),
    el('p', { class: 'screen-sub', text: 'Weather is not luck. It is written down, and you can read ahead.' }),

    el('h3', { class: 'section-h', text: 'Energy Outlook' }),
    el('p', { class: 'energy-forecast', text: forecastEnergy }),

    el('h3', { class: 'section-h', text: 'Forecast' }),
    el('div', { class: 'forecast' }, ...days.map(({ day, weather }, i) => el('div', { class: `fc${i === 0 ? ' today' : ''}` },
      el('div', { class: 'fc-day', text: i === 0 ? 'Today' : `Day ${day}` }),
      el('div', { class: 'fc-emoji', text: weather.emoji }),
      el('div', { class: 'fc-name', text: weather.name }),
      weather.closes.length > 0 ? el('div', { class: 'fc-closes', text: `closes ${weather.closes.join(', ')}` }) : null))),

    el('h3', { class: 'section-h', text: 'Coming up' }),
    el('ul', { class: 'fest-list' }, ...festivals.map((f) => el('li', {},
      el('strong', { text: `${f.emoji} ${f.name}` }),
      ` — ${f.line}`))),

    el('h3', { class: 'section-h', text: `Achievements (${earned.length}/${ACHIEVEMENTS.length})` }),
    el('div', { class: 'ach-grid' },
      ...earned.map((a) => el('div', { class: 'ach earned', title: a.desc },
        el('span', { class: 'ach-emoji', text: a.emoji }),
        el('span', { class: 'ach-name', text: a.name }))),
      ...pending.map((a) => el('div', { class: 'ach', title: a.desc },
        el('span', { class: 'ach-emoji', text: '·' }),
        el('span', { class: 'ach-name', text: a.name })))),

    backRow(onBack));
}

// ------------------------------------------------------------ characters

const ROLE_ORDER = [Role.PROTAGONIST, Role.ARCH_NEMESIS, Role.RIVAL, Role.SIDE_CHARACTER];

const GROUP_TITLES = {
  [Role.PROTAGONIST]: 'Protagonist',
  [Role.ARCH_NEMESIS]: 'Arch Nemesis',
  [Role.RIVAL]: 'Rivals',
  [Role.SIDE_CHARACTER]: 'Side Characters',
};

export function renderCharacters(profiles, { onBack }) {
  const detail = el('div', { class: 'detail' },
    el('p', { class: 'detail-empty', text: 'Select a character to read their story.' }));

  const showDetail = (p) => {
    detail.replaceChildren(
      el('div', { class: 'detail-head' },
        avatar(p, 'avatar detail-avatar'),
        el('div', {},
          el('h3', { text: p.name }),
          el('div', { class: `detail-role role-${p.role}`, text: roleLabel(p.role) }))),
      el('p', { text: p.bio }),
      el('dl', {},
        el('dt', { text: 'Relationship to Léon' }),
        el('dd', { text: p.relationship }),
        el('dt', { text: 'Usually found at' }),
        el('dd', { text: p.location })),
    );
  };

  const allRows = [];
  const makeRow = (p) => {
    const row = el('button', {
      class: `char-row role-${p.role}`, role: 'option', 'aria-selected': 'false',
    },
    avatar(p, 'avatar', { clickable: false }),
    el('div', { class: 'char-meta' },
      el('div', { class: 'char-name', text: p.name }),
      el('div', { class: 'char-relationship', text: `↳ ${p.relationship}` }),
      el('div', { class: 'char-role', text: `${roleLabel(p.role)} · ${p.location}` })));

    row.addEventListener('click', () => {
      for (const r of allRows) r.setAttribute('aria-selected', 'false');
      row.setAttribute('aria-selected', 'true');
      showDetail(p);
    });
    row._profile = p;
    allRows.push(row);
    return row;
  };

  const list = el('div', { class: 'char-list', role: 'listbox', 'aria-label': 'Characters' });
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
        const hit = !q
          || p.name.toLowerCase().includes(q)
          || p.location.toLowerCase().includes(q)
          || roleLabel(p.role).toLowerCase().includes(q)
          || p.bio.toLowerCase().includes(q);
        row.hidden = !hit;
        if (hit) shown += 1;
      }
      heading.hidden = shown === 0;
      visible += shown;
    }
    count.textContent = q ? `${visible} match${visible === 1 ? '' : 'es'}` : `${profiles.length} people`;
  });

  return el('div', { class: 'screen' },
    el('h2', { class: 'screen-title', text: 'Characters' }),
    el('p', { class: 'screen-sub', text: 'The people who keep Léon’s city feeling like a home — every place has someone waiting.' }),
    el('div', { class: 'char-toolbar' }, search, count),
    el('div', { class: 'char-layout' }, list, detail),
    backRow(onBack));
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

  const title = gs.won && gs.journeyDay >= ENDURANCE_GOAL_DAYS
    ? 'A Long Road Ended'
    : 'The Balance Broke';

  return el('div', { class: 'screen gameover' },
    el('h2', { text: title }),
    el('p', { text: message }),
    gs.won ? el('p', { class: 'win-note', text: gs.winMessage || 'You reached one hundred days before the end.' }) : null,
    el('p', {
      class: 'summary',
      text: `You lasted ${gs.journeyDay} day${gs.journeyDay === 1 ? '' : 's'}, ending on ${gs.getDateDisplay()}.`,
    }),
    el('dl', { class: 'run-stats' },
      ...stats.flatMap(([k, v]) => [el('dt', { text: k }), el('dd', { text: String(v) })])),
    el('button', { class: 'btn btn-primary', text: 'Begin again', onclick: onRestart }));
}

// ----------------------------------------------------------------- modal

export function renderResultModal(result, gs, { onContinue }) {
  const {
    actionDesc, event, rentCharged, deltas, weather, festival,
    achievements, exhaustion,
  } = result;

  const eventChar = event?.character ? findCharacter(gs, event.character) : null;
  const eventBlock = event
    ? el('div', { class: 'event-block' },
      el('span', { class: `rarity-tag rarity-${event.rarity}`, text: rarityLabel(event.rarity) }),
      eventChar
        ? el('div', { class: 'event-person' },
          avatar(eventChar, 'avatar event-avatar'),
          el('div', {},
            el('p', { class: 'event-title', text: event.title }),
            el('p', { class: 'event-who', text: eventChar.name })))
        : el('p', { class: 'event-title', text: event.title }),
      el('p', { text: event.description }))
    : null;

  const notes = [];
  if (result.justWon) notes.push(`🏅 ${result.winMessage || 'One hundred days. You held.'}`);
  if (rentCharged) notes.push(`📅 Sunday rent came due — ${rentCharged} money.`);
  if (exhaustion) notes.push(`😵 Running on empty cost you another ${Math.abs(exhaustion)} sanity.`);
  if (festival) notes.push(`${festival.emoji} ${festival.name}.`);
  for (const a of achievements) notes.push(`${a.emoji} Achievement: ${a.name}.`);

  const modal = el('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Day result' },
    el('h3', { text: 'End of Day' }),
    el('p', { class: 'modal-weather', text: `${weather.emoji} ${weather.name}` }),
    el('p', { text: actionDesc }),
    notes.length > 0
      ? el('ul', { class: 'modal-notes' }, ...notes.map((n) => el('li', { text: n })))
      : null,
    eventBlock,
    el('div', { class: 'modal-stats' }, effectChips(deltas, 'chips')),
    el('div', { class: 'modal-totals', text: `Sanity ${Math.round((gs.sanity / MAX_STAT) * 100)}% · Money ${Math.round(gs.money)} · Energy ${Math.round((gs.energy / MAX_ENERGY) * 100)}% · Rep ${Math.round((gs.reputation / MAX_REPUTATION) * 100)}% · Insight ${gs.insight}` }),
    el('div', { class: 'modal-actions' },
      el('button', { class: 'btn btn-primary', text: 'Continue →', onclick: onContinue })),
  );

  const backdrop = el('div', { class: 'modal-backdrop' }, modal);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) onContinue(); });
  return backdrop;
}

function rarityLabel(rarity) {
  return { standard: 'Common', rare_helpful: 'Rare · Helpful', rare_hurtful: 'Rare · Hurtful' }[rarity] ?? '';
}

/** Small transient toast, used for achievements and saves. */
export function renderToast(text) {
  return el('div', { class: 'toast', role: 'status', text });
}

