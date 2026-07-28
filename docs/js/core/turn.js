/**
 * Turn resolution.
 *
 * One function, one day. The order is fixed and load-bearing — rent lands
 * before the random event, so an event can still pull you back from the brink
 * that rent pushed you toward.
 *
 *   1. the location action, modified by weather, festival and perks
 *   2. exhaustion penalty
 *   3. Sunday rent
 *   4. the scheduled random event
 *   5. achievements
 *   6. game-over check
 *   7. one concise history line
 *
 * Pure with respect to the DOM; every input is state or data.
 */

import { RENT_AMOUNT } from './game-state.js';
import { getLocation, Tag, varianceForDay, LOCATIONS } from '../data/locations.js';

/**
 * Legacy copy for tests that still reference LOCATION_COPY.
 * The real copy lives on each location definition (actionDesc, historyLabel).
 * Kept as a shim so old tests don't break after the data restructure.
 */
export const LOCATION_COPY = Object.fromEntries(
  LOCATIONS.filter((l) => ['spiritual_community', 'bar'].includes(l.id)).map((l) => [
    l.id,
    { name: l.name, actionDesc: l.actionDesc, historyLabel: l.historyLabel },
  ]),
);


const KEYS = ['sanity', 'money', 'energy', 'reputation', 'insight'];

const zero = () => ({ sanity: 0, money: 0, energy: 0, reputation: 0, insight: 0 });

/** Add `src` into `dst` in place. */
function accumulate(dst, src = {}) {
  for (const k of KEYS) dst[k] += src[k] ?? 0;
  return dst;
}

/**
 * Everything that modifies a day's base effects, resolved into one bundle.
 *
 * Exported separately from `resolveTurn` so the UI can preview a day before
 * the player commits to it, and so the maths is testable on its own.
 *
 * @param {object} gs
 * @param {string} locationId
 * @returns {{base:object, total:object, reasons:string[]}}
 */
export function computeDayEffects(gs, locationId) {
  const location = getLocation(locationId);
  const reasons = [];
  if (!location) return { base: zero(), total: zero(), reasons };

  const base = { ...location.effects };
  const total = accumulate(zero(), base);

  // --- variance ---
  // A location's printed numbers are an average, not a promise. The swing is
  // derived from (location, day, run seed), so the preview the player reads
  // and the day they actually get are the same figures — see
  // `varianceForDay()` for why this is hashed rather than rolled.
  const variance = varianceForDay(location, gs.journeyDay, gs.weatherSeed ?? 0);
  if (KEYS.some((k) => variance[k] !== 0)) {
    accumulate(total, variance);
    reasons.push('🎲 How the day went');
  }

  // --- weather ---
  const weather = gs.getWeather();
  for (const tag of location.tags) {
    const mod = weather.tagEffects[tag];
    if (!mod) continue;
    const applied = { ...mod };
    accumulate(total, applied);
    if (Object.values(applied).some((v) => v !== 0)) {
      reasons.push(`${weather.emoji} ${weather.name}`);
    }
  }

  // --- festival ---
  const festival = gs.getFestival();
  if (festival) {
    accumulate(total, festival.effects);
    for (const tag of location.tags) {
      accumulate(total, festival.tagEffects[tag] ?? {});
    }
    reasons.push(`${festival.emoji} ${festival.name}`);
  }

  // --- perks ---
  const perks = gs.getPerkEffects();
  const perkBundle = zero();
  if (locationId === 'bar' || location.tags.includes(Tag.WORK)) {
    perkBundle.sanity += perks.barSanityRelief;
  }
  if (location.tags.includes(Tag.COMMUNITY) || location.tags.includes(Tag.SPIRITUAL)) {
    perkBundle.money += perks.communityCostRelief;
  }
  if (location.tags.includes(Tag.NIGHT)) {
    perkBundle.money += perks.nightMoneyBonus;
    perkBundle.energy += perks.nightEnergyRelief;
  }
  if (location.tags.includes(Tag.MARKET)) {
    perkBundle.money += perks.marketMoneyBonus;
  }
  if (location.tags.includes(Tag.QUIET)) {
    perkBundle.sanity += perks.quietSanityBonus;
  }
  if (location.tags.includes(Tag.REST)) {
    perkBundle.energy += perks.restBonus;
  }
  if (base.reputation > 0) {
    perkBundle.reputation += perks.reputationBonus;
  }
  if (base.insight > 0) {
    perkBundle.insight += perks.insightBonus;
  }
  if (KEYS.some((k) => perkBundle[k] !== 0)) {
    accumulate(total, perkBundle);
    reasons.push('Perks');
  }


  return { base, total, reasons: [...new Set(reasons)] };
}

/** Scale an event's deltas by the player's perks. */
export function scaleEventDeltas(event, perks) {
  const helpful = event.rarity === 'rare_helpful' ? 1 + perks.helpfulAmplify : 1;
  const dampen = 1 - perks.hurtfulDampening;
  const soften = (v) => (v < 0 ? Math.round(v * dampen) : Math.round(v * helpful));
  return {
    sanity: soften(event.sanityDelta),
    money: soften(event.moneyDelta),
    energy: soften(event.energyDelta ?? 0),
    reputation: soften(event.reputationDelta ?? 0),
    insight: Math.round((event.insightDelta ?? 0) * helpful),
  };
}

/**
 * Resolve one day.
 *
 * @returns {{actionDesc:string, event:object|null, rentCharged:number,
 *            gameOver:boolean, deltas:object, reasons:string[],
 *            achievements:object[],
 *            exhaustion:number,
 *            sanityDelta:number, moneyDelta:number,
 *            prevSanity:number, prevMoney:number, weather:object,
 *            festival:object|null}}
 */
export function resolveTurn(gs, eventManager, locationId) {
  const prev = {
    sanity: gs.sanity, money: gs.money, energy: gs.energy,
    reputation: gs.reputation, insight: gs.insight,
  };
  const location = getLocation(locationId);
  const weather = gs.getWeather();
  const festival = gs.getFestival();

  // 1 — the day itself
  const { total, reasons } = computeDayEffects(gs, locationId);
  gs.applyDeltas(total);
  gs.noteVisit(locationId);
  const actionDesc = location?.actionDesc ?? getLocation(locationId)?.actionDesc ?? '';

  // 2 — exhaustion
  const exhaustion = gs.exhaustionPenalty();
  if (exhaustion !== 0) gs.applyDeltas({ sanity: exhaustion });

  // 3 — rent
  const rentCharged = gs.applyRentIfSunday();

  // 4 — scheduled event
  let event = null;
  if (!gs.gameOver) {
    event = eventManager.selectEvent(
      gs.journeyDay,
      gs.getWeekdayIndex(),
      locationId,
      gs.consecutiveBarDays,
      { tags: location?.tags ?? [], weatherId: weather.id },
    );
    if (event) {
      gs.applyDeltas(scaleEventDeltas(event, gs.getPerkEffects()));
    }
  }

  // 5 — achievements
  const achievements = gs.checkAchievements();

  // 5b — soft win (does not end the run)
  const justWon = typeof gs.checkWin === 'function' ? gs.checkWin() : false;

  // 5c — mastery layer (does not end the run)
  const masteryWon = typeof gs.checkSecondWin === 'function' ? gs.checkSecondWin() : false;

  // 6 — game over
  const gameOver = gs.checkGameOver();

  // 7 — history
  const parts = [];
  if (location) parts.push(location.historyLabel);
  else if (getLocation(locationId)?.historyLabel) parts.push(getLocation(locationId).historyLabel);
  if (rentCharged) parts.push(`Paid rent (-${rentCharged} money)`);
  if (event) parts.push(`Event: ${event.title}`);
  const line = parts.join(' / ');
  gs.addHistory(line);

  const deltas = {
    sanity: gs.sanity - prev.sanity,
    money: gs.money - prev.money,
    energy: gs.energy - prev.energy,
    reputation: gs.reputation - prev.reputation,
    insight: gs.insight - prev.insight,
  };

  return {
    actionDesc,
    event,
    rentCharged,
    rentAmount: rentCharged || RENT_AMOUNT,
    gameOver,
    justWon,
    masteryWon,
    masteryMessage: masteryWon ? gs.winMessage : '',
    winMessage: justWon ? gs.winMessage : '',
    deltas,
    reasons,
    achievements,
    exhaustion,
    weather,
    festival,
    prevSanity: prev.sanity,
    prevMoney: prev.money,
    sanityDelta: deltas.sanity,
    moneyDelta: deltas.money,
  };
}
