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
 *   8. the calendar advances — see "A day is atomic" below
 *
 * ## A day is atomic
 *
 * Step 8 used to live in the UI: `resolveTurn()` applied the day's effects and
 * `app.js` called `gs.advanceDay()` from the result modal's Continue handler.
 * Because the autosave fired *between* those two points, refreshing the page
 * while the modal was open reloaded a save with the day's gains banked and the
 * calendar still on the day you had just played. Ten refreshes at the loft
 * took a run from 30 sanity / 20 energy to 100/100 without consuming a single
 * day — bypassing rent, the endurance goal, every day-gated unlock, and
 * letting a player re-roll any event they did not like.
 *
 * The fix is structural rather than a save-flag: **resolving a day and
 * advancing past it are one operation**. There is no longer a persistable
 * state in which a day has been paid for but not consumed, so no sequence of
 * refreshes can produce one. The result modal is now a *report* on a day that
 * is already over, which is also what it always read as.
 *
 * `advanceDay()` is skipped only when the run has just ended, so a game-over
 * screen shows the day the player died on rather than the morning after.
 *
 * Pure with respect to the DOM; every input is state or data.
 */

import { RENT_AMOUNT } from './game-state.js';
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
 * @param {object} gs
 * @param {string} locationId
 * @returns {{base:object, total:object, reasons:string[],
 *            factors:{kind:string, emoji:string, label:string}[]}}
 */
export function computeDayEffects(gs, locationId) {
  const location = getLocation(locationId);
  const reasons = [];
  /**
   * Structured counterpart to `reasons`.
   *
   * `reasons` is display copy ("⛈️ Storm"), and the UI used to recover the
   * weather emoji by *string-matching nine emoji out of that prose* — the
   * same nine-clause `r.includes('☀️') || …` block copy-pasted into three
   * renderers, to rediscover a value this function already had. That is what
   * shipped the `weatherEmoji` ReferenceError in PR #23/#24.
   *
   * Anything the UI needs to branch on belongs here, as data.
   * @type {{kind:string, emoji:string, label:string}[]}
   */
  const factors = [];
  if (!location) return { base: zero(), total: zero(), reasons, factors };

  const base = { ...location.effects };
  const total = accumulate(zero(), base);

  // --- variance ---
  // A location's printed numbers are an average, not a promise. The swing is
  // derived from (location, day, run seed), so the preview the player reads
  // and the day they actually get are the same figures — see
  // `varianceForDay()` for why this is hashed rather than rolled.
  const rawVariance = varianceForDay(location, gs.journeyDay, gs.weatherSeed ?? 0);
  // An observance can steady the day — `varianceDampening` scales the swing
  // toward zero without removing it, so a planned day lands closer to the
  // number on the card. Applied here rather than inside varianceForDay() so
  // the hash stays a pure function of (location, day, seed).
  const damp =
    typeof gs.getObservanceEffects === 'function'
      ? (gs.getObservanceEffects().varianceDampening ?? 0)
      : 0;
  const variance =
    damp > 0
      ? Object.fromEntries(KEYS.map((k) => [k, Math.round(rawVariance[k] * (1 - damp))]))
      : rawVariance;
  if (KEYS.some((k) => variance[k] !== 0)) {
    accumulate(total, variance);
    reasons.push('🎲 How the day went');
    factors.push({ kind: 'variance', emoji: '🎲', label: 'How the day went' });
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
      factors.push({ kind: 'weather', emoji: weather.emoji, label: weather.name });
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
    factors.push({ kind: 'festival', emoji: festival.emoji, label: festival.name });
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
    factors.push({ kind: 'perks', emoji: '🔮', label: 'Perks' });
  }

  // The bar's unique job is crisis money. It will still take you past empty,
  // but when you arrive already scraping the bottom Barret keeps you on for
  // the last cash-out. That makes it a dangerous lifeline rather than a better
  // cocktail bar: extra money, extra wear, previewed before you commit.
  if (locationId === 'bar' && (gs.energy ?? 100) < 5) {
    const lastOrders = { sanity: -2, money: 4, energy: 0, reputation: 0, insight: 0 };
    accumulate(total, lastOrders);
    reasons.push('Last orders');
    factors.push({ kind: 'location-role', emoji: '🍻', label: 'Last orders' });
  }

  // De-duplicate both views the same way: a tag can match a weather rule more
  // than once, and the player only wants to be told about it once.
  const seen = new Set();
  const uniqueFactors = factors.filter((f) => {
    const key = `${f.kind}:${f.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { base, total, reasons: [...new Set(reasons)], factors: uniqueFactors };
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
 * @returns {{resolvedDay:number, resolvedDate:string,
 *            actionDesc:string, event:object|null, rentCharged:number, rentAmount:number,
 *            gameOver:boolean, justWon:boolean, winMessage:string, masteryWon:boolean,
 *            masteryMessage:string, deltas:object, reasons:string[],
 *            achievements:object[],
 *            exhaustion:number, resilienceGained:number, resilienceUsed:number,
 *            sanityDelta:number, moneyDelta:number,
 *            prevSanity:number, prevMoney:number, weather:object,
 *            festival:object|null}}
 */
export function resolveTurn(gs, eventManager, locationId) {
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
  const resilienceBefore = gs.resilience ?? 0;
  gs.applyDeltas(total);
  gs.noteVisit(locationId);
  const resilienceGained = Math.max(0, (gs.resilience ?? 0) - resilienceBefore);
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
      {
        tags: location?.tags ?? [],
        weatherId: weather.id,
        affinity: gs.affinity ?? {},
        reputation: gs.reputation ?? 0,
      },
    );
    if (event) {
      const scaled = scaleEventDeltas(event, gs.getPerkEffects());
      const shielded =
        typeof gs.absorbEventLosses === 'function'
          ? gs.absorbEventLosses(scaled)
          : { deltas: scaled, used: 0 };
      gs.applyDeltas(shielded.deltas);
      event = { ...event, appliedDeltas: shielded.deltas, resilienceUsed: shielded.used };
      // Meeting someone counts. This is the only place affinity is earned,
      // so "how well do I know this person" always means "how many of their
      // moments have I actually been present for".
      if (typeof gs.noteAffinity === 'function') gs.noteAffinity(event.character);
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

  // The day the player just spent, captured before the calendar moves — the
  // result modal reports on *this* day, not on the morning that follows it.
  const resolvedDay = gs.journeyDay;
  const resolvedDate = gs.getDateDisplay();

  // 8 — the calendar advances, atomically with everything above. See the
  // "A day is atomic" note at the top of this file: splitting these two
  // across a UI callback is what made the refresh exploit possible.
  if (!gameOver) gs.advanceDay();

  return {
    resolvedDay,
    resolvedDate,
    actionDesc,
    event,
    rentCharged,
    rentAmount: rentCharged || RENT_AMOUNT,
    gameOver,
    justWon,
    masteryWon,
    masteryMessage: masteryWon ? gs.masteryMessage : '',
    winMessage: justWon ? gs.winMessage : '',
    deltas,
    reasons,
    achievements,
    exhaustion,
    resilienceGained,
    resilienceUsed: event?.resilienceUsed ?? 0,
    weather,
    festival,
    prevSanity: prev.sanity,
    prevMoney: prev.money,
    sanityDelta: deltas.sanity,
    moneyDelta: deltas.money,
  };
}
