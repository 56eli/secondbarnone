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

import { RENT_AMOUNT, MAX_STAT, MAX_ENERGY, MAX_REPUTATION } from './game-state.js';
import { getLocation, Tag, varianceForDay } from '../data/locations.js';

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
 * Pass `{ preview: true }` for the numbers a player is allowed to see before
 * committing: everything *except* the day's variance. The preview is the
 * honest average ("what this place is for"); resolveTurn adds the
 * deterministic swing on top ("how today actually went"). Hiding the swing
 * from previews is what stops exact-answer play — you can read the weather,
 * the festival and your perks, but never the dice.
 *
 * @param {object} gs
 * @param {string} locationId
 * @param {{preview?: boolean}} [opts]
 * @returns {{base:object, total:object, reasons:string[]}}
 */
export function computeDayEffects(gs, locationId, { preview = false } = {}) {
  const location = getLocation(locationId);
  const reasons = [];
  if (!location) return { base: zero(), total: zero(), reasons };

  const base = { ...location.effects };
  const total = accumulate(zero(), base);

  // --- variance ---
  // A location's printed numbers are an average, not a promise. The swing is
  // derived from (location, day, run seed) — see `varianceForDay()` for why
  // this is hashed rather than rolled. It is only included when resolving
  // the day, never when previewing it.
  if (!preview) {
    const variance = varianceForDay(location, gs.journeyDay, gs.weatherSeed ?? 0);
    if (KEYS.some((k) => variance[k] !== 0)) {
      accumulate(total, variance);
      reasons.push('🎲 How the day went');
    }
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
 *            rentAmount:number, extraRent:number, extraDays:number,
 *            longTrip:boolean, gameOver:boolean, justWon:boolean,
 *            masteryWon:boolean, masteryMessage:string, winMessage:string,
 *            deltas:object, reasons:string[], achievements:object[],
 *            exhaustion:number, exhaustionBurn:number,
 *            sanityDelta:number, moneyDelta:number,
 *            prevSanity:number, prevMoney:number, weather:object,
 *            festival:object|null, alreadyResolved?:boolean}}
 */
export function resolveTurn(gs, eventManager, locationId) {
  if (gs.isTurnResolved) {
    return {
      actionDesc: '',
      event: null,
      rentCharged: 0,
      rentAmount: 0,
      extraRent: 0,
      extraDays: 0,
      longTrip: false,
      gameOver: gs.gameOver,
      justWon: false,
      masteryWon: false,
      masteryMessage: '',
      winMessage: '',
      deltas: zero(),
      reasons: [],
      achievements: [],
      exhaustion: 0,
      exhaustionBurn: 0,
      weather: gs.getWeather(),
      festival: gs.getFestival(),
      prevSanity: gs.sanity,
      prevMoney: gs.money,
      sanityDelta: 0,
      moneyDelta: 0,
      alreadyResolved: true,
    };
  }
  const prev = {
    sanity: gs.sanity,
    money: gs.money,
    energy: gs.energy,
    reputation: gs.reputation,
    insight: gs.insight,
  };
  const location = getLocation(locationId);
  const weather = gs.getWeather();
  const festival = gs.getFestival();

  // 1 — the day itself
  const { total, reasons } = computeDayEffects(gs, locationId);
  gs.markTurnResolved();
  gs.applyDeltas(total);
  gs.noteVisit(locationId);
  const actionDesc = location?.actionDesc ?? getLocation(locationId)?.actionDesc ?? '';
  // Energy is a hard survival resource: reaching empty is an immediate collapse,
  // before exhaustion, rent, or a lucky event can reverse it.
  let gameOver = gs.checkGameOver();

  // 2 — exhaustion (sanity *and* wallet: being drained is expensive)
  let exhaustion = 0;
  let exhaustionBurn = 0;
  let rentCharged = 0;
  let event = null;
  if (!gameOver) {
    exhaustion = gs.exhaustionPenalty();
    exhaustionBurn = gs.exhaustionBurn();
    if (exhaustion !== 0 || exhaustionBurn !== 0)
      gs.applyDeltas({ sanity: exhaustion, money: exhaustionBurn });

    // 3 — rent
    rentCharged = gs.applyRentIfSunday();

    // 4 — scheduled event
    if (!gs.gameOver) {
      event = eventManager.selectEvent(
        gs.journeyDay,
        gs.getWeekdayIndex(),
        locationId,
        gs.consecutiveBarDays,
        {
          tags: location?.tags ?? [],
          weatherId: weather.id,
          seenEvents: gs.eventsSeen,
        },
      );
      if (event) {
        gs.recordEventSeen(event);
        gs.applyDeltas(scaleEventDeltas(event, gs.getPerkEffects()));
      }
      gameOver = gs.checkGameOver();
    }
  }

  // 5 — long-trip locations (e.g. mountain retreat): resolve two additional
  // days of recovery only. Resolve the entire trip before achievements, wins,
  // the final game-over check and result deltas so the turn is atomic: travel
  // rent can never leave a live run at zero money, and the result screen never
  // hides the cost or recovery from the player.
  const longTrip = location?.special === 'long_trip';
  let extraDays = 0;
  let extraRent = 0;
  if (longTrip && !gameOver) {
    const addNight = () => {
      gs.journeyDay += 1;
      gs._advanceCalendarDay();
      gs.recoverEnergy();
      extraDays += 1;
      const r = gs.applyRentIfSunday();
      if (r) extraRent += r;
      gs.visitedLocations.add(location.id);
    };
    // Two extra silent nights; the action day has already resolved above.
    addNight();
    addNight();
    gs.sanity = Math.max(0, Math.min(MAX_STAT, gs.sanity));
    gs.energy = Math.max(0, Math.min(MAX_ENERGY, gs.energy));
    gs.money = Math.max(0, gs.money);
    gs.reputation = Math.max(0, Math.min(MAX_REPUTATION, gs.reputation));
    gs.emit(
      'day_changed',
      gs.journeyDay,
      gs.getWeekdayName(),
      gs.getMonthName(),
      gs.year,
      gs.dayOfMonth,
    );
    gs._statsChanged();
    // A Sunday encountered during travel can be fatal. This check is
    // deliberately after both nights and their rent charges.
    gameOver = gs.checkGameOver();
  }

  // 6 — achievements and one-shot endings observe the final trip state.
  const achievements = gs.checkAchievements();
  const justWon = typeof gs.checkWin === 'function' ? gs.checkWin() : false;
  const masteryWon = typeof gs.checkSecondWin === 'function' ? gs.checkSecondWin() : false;
  const masteryMessage = masteryWon ? gs.masteryMessage : '';
  if (masteryWon) gs.winMessage = gs.masteryMessage;

  // 7 — history and displayed deltas also use the final state.
  const parts = [];
  if (location) parts.push(location.historyLabel);
  else if (getLocation(locationId)?.historyLabel) parts.push(getLocation(locationId).historyLabel);
  if (rentCharged) parts.push(`Paid rent (-${rentCharged} money)`);
  if (extraRent) parts.push(`Paid travel rent (-${extraRent} money)`);
  if (event) parts.push(`Event: ${event.title}`);
  gs.addHistory(parts.join(' / '));

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
    extraRent,
    extraDays,
    longTrip,
    gameOver,
    justWon,
    masteryWon,
    masteryMessage,
    winMessage: masteryWon ? masteryMessage : justWon ? gs.winMessage : '',
    deltas,
    reasons,
    achievements,
    exhaustion,
    exhaustionBurn,
    weather,
    festival,
    prevSanity: prev.sanity,
    prevMoney: prev.money,
    sanityDelta: deltas.sanity,
    moneyDelta: deltas.money,
  };
}
