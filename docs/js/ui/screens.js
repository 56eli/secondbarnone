/**
 * Screen renderers. Each returns a DOM element; main.js swaps them into
 * #content, replacing Godot's ContentHost + PackedScene instantiation.
 */

import { getInitials, Role } from '../data/characters.js';
import { MAX_STAT, SANITY_GAIN, SANITY_LOSS, MONEY_GAIN, MONEY_LOSS } from '../core/game-state.js';

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

/** Portrait <img> with graceful fallback to initials. */
function avatar(profile, cls = 'avatar') {
  const initials = getInitials(profile.name);
  const img = el('img', {
    class: cls,
    src: profile.portrait,
    alt: `${profile.name} portrait`,
    loading: 'lazy',
    decoding: 'async',
  });
  // If the file is missing, swap in an initials chip (mirrors the
  // TextureRect / fallback-Label pair in character_profiles.gd).
  img.addEventListener('error', () => {
    img.replaceWith(el('div', { class: cls, 'aria-label': `${profile.name} portrait` }, initials));
  }, { once: true });
  return img;
}

// ------------------------------------------------------------------ hub

export function renderHub(gs, { onVisit, onCharacters }) {
  const historyItems = gs.recentHistory.length
    ? el('ul', {}, ...gs.recentHistory.map((h) => el('li', { text: h })))
    : el('p', { class: 'empty', text: 'Nothing yet — your journey begins today.' });

  return el('div', { class: 'screen hub', style: "background-image:url('assets/backgrounds/hub_background.svg')" },
    el('h2', { class: 'screen-title', text: 'Where will you spend today?' }),
    el('p', { class: 'hub-meta', text: `${gs.getDateDisplay()}  |  Journey Day ${gs.journeyDay}` }),
    el('p', { class: 'hub-mood', text: `${gs.getSeason()} — ${gs.getMood()}` }),

    el('div', { class: 'choices' },
      el('button', { class: 'choice', onclick: () => onVisit('spiritual_community') },
        el('span', { class: 'choice-name', text: '🧘 Spiritual Community' }),
        el('span', { class: 'choice-eff', text: `+${SANITY_GAIN} Sanity · −${MONEY_LOSS} Money` })),
      el('button', { class: 'choice', onclick: () => onVisit('bar') },
        el('span', { class: 'choice-name', text: '🍻 The Bar' }),
        el('span', { class: 'choice-eff', text: `+${MONEY_GAIN} Money · −${SANITY_LOSS} Sanity` })),
      el('button', { class: 'choice', onclick: onCharacters },
        el('span', { class: 'choice-name', text: '👥 Characters' }),
        el('span', { class: 'choice-eff', text: 'Meet the people in Léon’s life' })),
    ),

    el('div', { class: 'history' }, el('h3', { text: 'Recent history' }), historyItems),
  );
}

// ------------------------------------------------------------- location

const LOCATIONS = {
  spiritual_community: {
    title: 'Spiritual Community',
    desc: 'A peaceful sanctuary for meditation, connection, and spiritual growth. Soft candlelight flickers as the scent of incense fills the air.',
    action: `🧘 Meditate & Connect (+${SANITY_GAIN} Sanity, −${MONEY_LOSS} Money)`,
    bg: 'assets/backgrounds/spiritual_community.webp',
  },
  bar: {
    title: 'The Bar',
    desc: 'A dimly lit bar with worn wooden counters and amber glow. The clink of glasses and murmur of conversation fill the warm, smoky air.',
    action: `🍻 Work a Shift (+${MONEY_GAIN} Money, −${SANITY_LOSS} Sanity)`,
    bg: 'assets/backgrounds/bar.webp',
  },
};

export function renderLocation(locationId, { onAction, onBack }) {
  const cfg = LOCATIONS[locationId];
  const particles = el('div', { class: 'particles', 'aria-hidden': 'true' });

  const actionBtn = el('button', { class: 'btn btn-primary', text: cfg.action });
  const backBtn = el('button', { class: 'btn', text: '← Back to hub' });

  actionBtn.addEventListener('click', () => {
    actionBtn.disabled = true;
    backBtn.disabled = true;
    onAction(locationId);
  });
  backBtn.addEventListener('click', () => onBack());

  const node = el('div', { class: 'screen location', style: `background-image:url('${cfg.bg}')` },
    particles,
    el('h2', { class: 'screen-title', text: cfg.title }),
    el('p', { class: 'screen-sub', text: cfg.desc }),
    el('div', { class: 'action-row' }, actionBtn, backBtn),
  );

  node._startParticles = () => startParticles(particles);
  return node;
}

/** Floating motes — the CSS equivalent of location_base.gd's spawner. */
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

// ------------------------------------------------------------ characters

export function renderCharacters(profiles, { onBack }) {
  const detail = el('div', { class: 'detail' },
    el('p', { class: 'detail-empty', text: 'Select a character to read their story.' }));

  const rows = profiles.map((p) => {
    const row = el('button', { class: 'char-row', role: 'option', 'aria-selected': 'false' },
      avatar(p),
      el('div', {},
        el('div', { class: 'char-name', text: p.name }),
        el('div', {
          class: 'char-role',
          text: `${p.role === Role.PROTAGONIST ? 'Protagonist' : 'Side Character'} · ${p.location}`,
        })));

    row.addEventListener('click', () => {
      for (const r of rows) r.setAttribute('aria-selected', 'false');
      row.setAttribute('aria-selected', 'true');
      detail.replaceChildren(
        el('div', { class: 'detail-head' },
          avatar(p, 'avatar detail-avatar'),
          el('div', {},
            el('h3', { text: p.name }),
            el('div', {
              class: 'detail-role',
              text: p.role === Role.PROTAGONIST ? 'Protagonist' : 'Side Character',
            }))),
        el('p', { text: p.bio }),
        el('dl', {},
          el('dt', { text: 'Relationship to Léon' }),
          el('dd', { text: p.relationship }),
          el('dt', { text: 'Usually found at' }),
          el('dd', { text: p.location })),
      );
    });
    return row;
  });

  return el('div', { class: 'screen' },
    el('h2', { class: 'screen-title', text: 'Characters' }),
    el('p', { class: 'screen-sub', text: 'The people who orbit Léon’s two worlds.' }),
    el('div', { class: 'char-layout' },
      el('div', { class: 'char-list', role: 'listbox', 'aria-label': 'Characters' }, ...rows),
      detail),
    el('div', { class: 'action-row' },
      el('button', { class: 'btn', text: '← Back to hub', onclick: onBack })),
  );
}

// ------------------------------------------------------------- game over

export function renderGameOver(gs, message, { onRestart }) {
  return el('div', { class: 'screen gameover' },
    el('h2', { text: 'The Balance Broke' }),
    el('p', { text: message }),
    el('p', {
      class: 'summary',
      text: `You lasted ${gs.journeyDay} day${gs.journeyDay === 1 ? '' : 's'}, ending on ${gs.getDateDisplay()}.`,
    }),
    el('button', { class: 'btn btn-primary', text: 'Begin again', onclick: onRestart }));
}

// ----------------------------------------------------------------- modal

export function renderResultModal(result, gs, { onContinue }) {
  const { actionDesc, event, rentCharged, sanityDelta, moneyDelta } = result;

  const fmt = (n) => `${n >= 0 ? '+' : ''}${Math.round(n)}`;

  const eventBlock = event
    ? el('div', { class: 'event-block' },
        el('span', { class: `rarity-tag rarity-${event.rarity}`, text: rarityLabel(event.rarity) }),
        el('p', { class: 'event-title', text: event.title }),
        el('p', { text: event.description }))
    : null;

  const rentNote = rentCharged
    ? el('p', { class: 'screen-sub', style: 'margin:10px 0 0', text: '📅 Sunday rent came due — 18 money.' })
    : null;

  const modal = el('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Day result' },
    el('h3', { text: 'End of Day' }),
    el('p', { text: actionDesc }),
    rentNote,
    eventBlock,
    el('div', { class: 'modal-stats' },
      `Sanity ${Math.round(gs.sanity)}/${MAX_STAT} (${fmt(sanityDelta)})  ·  Money ${Math.round(gs.money)}/${MAX_STAT} (${fmt(moneyDelta)})`),
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
