/**
 * Observances — the repeatable insight sink.
 *
 * ## Why this exists
 *
 * `perks.js` is a one-off tree: ten perks, 66 insight total, fully bought by
 * roughly journey day 20 on any run that touches the quiet locations. After
 * that, insight accumulated for the remaining eighty days of a long run with
 * **nothing to buy** — a resource the game kept awarding and the player could
 * no longer spend. A currency with no sink is a scoreboard, and this one was
 * not even displayed as a score.
 *
 * An observance is the other half of the economy: a **repeatable** spend,
 * bought with insight, that affects the *next* day rather than the whole run.
 * Perks are who Léon has become; observances are what he is doing about
 * tomorrow.
 *
 * ## Design rules
 *
 * 1. **Repeatable, never permanent.** Every observance expires. Nothing here
 *    can stack into a permanent buff, because that would just be a slower
 *    perk tree with the same dead end at the end of it.
 * 2. **One at a time.** Setting an observance replaces any pending one, and
 *    the insight already spent is *not* refunded. Choosing is the gameplay;
 *    an inventory of queued blessings is not.
 * 3. **Priced against the late-game earn rate.** A run that leans on quiet
 *    locations earns roughly 3-4 insight a day, so costs of 6-14 mean an
 *    observance is a real decision every two to four days rather than a
 *    formality or a once-a-fortnight treat.
 * 4. **Never a get-out-of-jail card.** Nothing here restores a resource
 *    directly. Observances change the *shape* of a day — they soften rent,
 *    steady a swing, widen the exhaustion threshold — so a player still has
 *    to play the day. The worst-case outcome of a badly chosen observance is
 *    that it did nothing, not that it saved a run that should have ended.
 * 5. **Pure data plus pure helpers**, like every other module in `data/`.
 *    Nothing here touches the DOM or holds state; the pending observance
 *    lives on `GameState` and is saved with the run.
 *
 * @see docs/DESIGN_PRINCIPLES.md — "Every currency needs a sink"
 */

const observance = (cfg) =>
  Object.freeze({
    cost: 8,
    /** How many journey days the effect stays pending. Always >= 1. */
    duration: 1,
    effects: Object.freeze({}),
    ...cfg,
  });

/**
 * Effect keys an observance may declare. Kept explicit so a typo in a new
 * observance fails a test rather than silently doing nothing.
 *
 *   rentRelief          money off the next rent charge
 *   varianceDampening   0-1, fraction of the daily swing removed
 *   exhaustionResist    added to the exhaustion threshold, like Second Wind
 *   insightRebate       insight returned when the observance resolves
 *   weatherWard         ignores tag closures for one day
 */
export const OBSERVANCE_KEYS = Object.freeze([
  'rentRelief',
  'varianceDampening',
  'exhaustionResist',
  'insightRebate',
  'weatherWard',
]);

export const OBSERVANCES = [
  observance({
    id: 'settled_ledger',
    name: 'A Settled Ledger',
    emoji: '🧾',
    desc: 'An evening with the paperwork and a pot of tea. The next rent notice arrives already half-answered.',
    cost: 10,
    duration: 7,
    effects: { rentRelief: 8 },
  }),
  observance({
    id: 'steady_hands',
    name: 'Steady Hands',
    emoji: '🫱',
    desc: 'You plan tomorrow properly instead of arriving at it. The day lands closer to what the card promised.',
    cost: 6,
    duration: 1,
    effects: { varianceDampening: 0.75 },
  }),
  observance({
    id: 'long_sit',
    name: 'The Long Sit',
    emoji: '🧎',
    desc: 'An hour before dawn, every morning this week. Tiredness arrives later and argues less.',
    cost: 12,
    duration: 5,
    effects: { exhaustionResist: 10 },
  }),
  observance({
    id: 'oilskin_and_boots',
    name: 'Oilskin and Boots',
    emoji: '🧥',
    desc: 'Dug out of the cupboard and left by the door. Whatever the sky is doing tomorrow, you can still go out in it.',
    cost: 8,
    duration: 2,
    effects: { weatherWard: 1 },
  }),
  observance({
    id: 'teaching_note',
    name: 'A Teaching Note',
    emoji: '✒️',
    desc: 'You write down what you actually learned this week rather than what you meant to. Some of it comes back to you.',
    cost: 14,
    duration: 3,
    effects: { insightRebate: 9 },
  }),
];

const BY_ID = new Map(OBSERVANCES.map((o) => [o.id, o]));

/** @returns {object|null} */
export function getObservance(id) {
  return BY_ID.get(id) ?? null;
}

export function observanceIds() {
  return OBSERVANCES.map((o) => o.id);
}

/**
 * Can this observance be started right now?
 *
 * @param {string} id
 * @param {{insight:number, pending?:{id:string}|null}} snap
 * @returns {{ok:boolean, reason:string}}
 */
export function canObserve(id, snap) {
  const o = BY_ID.get(id);
  if (!o) return { ok: false, reason: 'No such observance' };
  if (snap?.pending?.id === id) return { ok: false, reason: 'Already keeping this' };
  if ((snap?.insight ?? 0) < o.cost) return { ok: false, reason: `Needs ${o.cost} insight` };
  return { ok: true, reason: '' };
}

/**
 * The effect bundle currently in force.
 *
 * Returns zeroes when nothing is pending or the pending observance has
 * expired, so callers never need a null check.
 *
 * @param {{id:string, untilDay:number}|null} pending
 * @param {number} journeyDay
 */
export function activeObservanceEffects(pending, journeyDay) {
  const zero = {
    rentRelief: 0,
    varianceDampening: 0,
    exhaustionResist: 0,
    insightRebate: 0,
    weatherWard: 0,
  };
  if (!pending || journeyDay > pending.untilDay) return zero;
  const o = BY_ID.get(pending.id);
  if (!o) return zero;
  for (const [k, v] of Object.entries(o.effects)) {
    if (k in zero) zero[k] += v;
  }
  return zero;
}

/** True when a pending observance has run out and should be cleared. */
export function isExpired(pending, journeyDay) {
  return Boolean(pending) && journeyDay > pending.untilDay;
}
