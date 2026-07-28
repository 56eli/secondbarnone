/**
 * GameState — stats, calendar, history and everything the run accumulates.
 *
 * Originally a 1:1 port of scripts/game_state.gd with two stats. It now also
 * owns energy, reputation and insight, the perk set, earned
 * achievements and the per-run weather seed.
 *
 * Still strictly DOM-free: everything here is testable headlessly.
 */

import { createAllProfiles } from '../data/characters.js';
import { aggregatePerks, canBuyPerk, getPerk } from '../data/perks.js';
import {
  activeObservanceEffects,
  canObserve,
  getObservance,
  isExpired,
} from '../data/observances.js';
import { weatherForDay, closedTags } from '../data/weather.js';
import { festivalOn } from '../data/festivals.js';
import { evaluateAchievements } from '../data/achievements.js';
import { LOCATIONS, getLocation } from '../data/locations.js';
import {
  MAX_STAT,
  START_SANITY,
  START_MONEY,
  MONEY_HARD_CEILING,
  SANITY_GAIN,
  SANITY_LOSS,
  MONEY_GAIN,
  MONEY_LOSS,
  MAX_ENERGY,
  START_ENERGY,
  ENERGY_RECOVERY,
  EXHAUSTION_THRESHOLD,
  EXHAUSTION_MAX_PENALTY,
  MAX_REPUTATION,
  START_REPUTATION,
  START_INSIGHT,
  ENDURANCE_GOAL_DAYS,
  RENT_AMOUNT,
  START_WEEKDAY_OFFSET,
  RENT_DISCOUNT_REP_THRESHOLD,
  RENT_DISCOUNT_REP_BONUS,
  RENT_DISCOUNT_REP_HIGH,
  RENT_DISCOUNT_REP_HIGH_BONUS,
  RENT_ESCALATION_PERIOD_DAYS,
  RENT_ESCALATION_STEP,
  RENT_ESCALATION_FIRST_DAY,
  RENT_MAX_AMOUNT,
  MASTERY_GOAL_DAYS,
  MASTERY_REPUTATION,
  MASTERY_MONEY,
  MASTERY_LOCATIONS,
  MASTERY_MAX_BAR_STREAK,
} from './balance.js';

/**
 * Every tuning number lives in `core/balance.js` and is re-exported here so
 * that `import { MAX_STAT } from './game-state.js'` keeps working for the
 * whole codebase while there is still exactly one definition of each value.
 * `data/` modules import balance.js directly, which avoids an import cycle.
 */
export {
  MAX_STAT,
  START_SANITY,
  START_MONEY,
  MONEY_SOFT_CAP,
  MONEY_HARD_CEILING,
  SANITY_GAIN,
  SANITY_LOSS,
  MONEY_GAIN,
  MONEY_LOSS,
  MAX_ENERGY,
  START_ENERGY,
  ENERGY_FULL_RECOVERY_DAYS,
  ENERGY_RECOVERY,
  EXHAUSTION_THRESHOLD,
  EXHAUSTION_MAX_PENALTY,
  MAX_REPUTATION,
  START_REPUTATION,
  START_INSIGHT,
  ENDURANCE_GOAL_DAYS,
  RENT_AMOUNT,
  START_WEEKDAY_OFFSET,
  RENT_DISCOUNT_REP_THRESHOLD,
  RENT_DISCOUNT_REP_BONUS,
  RENT_DISCOUNT_REP_HIGH,
  RENT_DISCOUNT_REP_HIGH_BONUS,
  RENT_ESCALATION_PERIOD_DAYS,
  RENT_ESCALATION_STEP,
  RENT_ESCALATION_FIRST_DAY,
  RENT_MAX_AMOUNT,
  MASTERY_GOAL_DAYS,
  MASTERY_REPUTATION,
  MASTERY_MONEY,
  MASTERY_LOCATIONS,
  MASTERY_MAX_BAR_STREAK,
} from './balance.js';

export const WEEKDAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

export const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/**
 * localStorage key for the save slot.
 *
 * The version suffix is part of the key rather than only a field inside it, so
 * a browser that still holds an older run can be migrated rather than
 * misread. `LEGACY_SAVE_KEYS` is checked in order after the current key, and
 * — since v6 — is *pruned* once a run has been migrated and re-saved, so two
 * divergent saves cannot coexist indefinitely.
 */
export const SAVE_KEY = 'secondbarnone.save.v6';
const LEGACY_SAVE_KEYS = [
  'secondbarnone.save.v5',
  'secondbarnone.save.v4',
  'secondbarnone.save.v3',
];

/** Schema versions `loadFrom()` accepts after migration. */
export const SUPPORTED_SAVE_VERSIONS = Object.freeze([3, 4, 5, 6]);
export const CURRENT_SAVE_VERSION = 6;

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

export class GameState {
  /** @param {{seed?:number}} [opts] */
  constructor(opts = {}) {
    this._listeners = new Map();
    this.characterProfiles = createAllProfiles();
    this._seedOption = opts.seed;
    this._initStats();
  }

  _initStats() {
    this.sanity = START_SANITY;
    this.money = START_MONEY;
    this.energy = START_ENERGY;
    this.reputation = START_REPUTATION;
    this.insight = START_INSIGHT;

    this.journeyDay = 1;
    this.dayOfMonth = 1;
    this.monthIndex = 0;
    this.year = 2026;
    this.gameOver = false;
    this.gameOverMessage = '';
    /** Set when the player reaches the endurance goal without dying. */
    this.won = false;
    this.winMessage = '';
    this.masteryWon = false;
    this.masteryMessage = '';

    this.consecutiveBarDays = 0;
    this.maxConsecutiveBarDays = 0;
    this.lastLocationVisited = '';
    this._lastRentDayOfMonth = -1;
    this._lastRentJourneyDay = -1;
    this.rentPrepaidUntilDay = 0;
    this.rentPaidCount = 0;
    this.recentHistory = [];

    this.perks = new Set();
    this.achievements = new Set();
    this.visitedLocations = new Set();
    this.nightDays = 0;
    this.festivalsSeen = 0;
    this.pendingAchievements = [];

    /**
     * The observance currently being kept, or null. `{id, untilDay}`.
     * Repeatable insight spend — see `data/observances.js`.
     */
    this.pendingObservance = null;
    /** How many observances this run has completed, for achievements. */
    this.observancesKept = 0;

    /**
     * Per-character affinity, `characterId -> number`.
     *
     * Incremented when one of their events fires. This is the seed of the
     * relationship layer: the People screen reads it, and it is what future
     * fourth-and-later events will gate on. Kept as a plain object rather
     * than a Map so `toJSON()` stays a straight copy.
     */
    this.affinity = {};

    /** Per-run seed driving the (deterministic) weather. */
    this.weatherSeed = this._seedOption ?? Math.floor(Math.random() * 1e9);
  }

  // ---------------- signals ----------------

  on(signal, handler) {
    if (!this._listeners.has(signal)) this._listeners.set(signal, []);
    this._listeners.get(signal).push(handler);
    return () => this.off(signal, handler);
  }

  off(signal, handler) {
    const list = this._listeners.get(signal);
    if (!list) return;
    const i = list.indexOf(handler);
    if (i >= 0) list.splice(i, 1);
  }

  emit(signal, ...args) {
    const list = this._listeners.get(signal);
    if (!list) return;
    for (const fn of [...list]) fn(...args);
  }

  _statsChanged() {
    this.emit('stats_changed', this.sanity, this.money, this.energy, this.reputation);
  }

  // ---------------- lifecycle ----------------

  resetGame() {
    this._initStats();
    this._statsChanged();
    this.emit(
      'day_changed',
      this.journeyDay,
      this.getWeekdayName(),
      this.getMonthName(),
      this.year,
      this.dayOfMonth,
    );
  }

  // ---------------- calendar ----------------

  getWeekdayIndex() {
    return (this.journeyDay - 1 + START_WEEKDAY_OFFSET) % 7;
  }

  getWeekdayName() {
    return WEEKDAY_NAMES[this.getWeekdayIndex()];
  }

  getMonthName() {
    return MONTH_NAMES[this.monthIndex];
  }

  /** e.g. "Thursday, January 1, 2026". */
  getDateDisplay() {
    return `${this.getWeekdayName()}, ${this.getMonthName()} ${this.dayOfMonth}, ${this.year}`;
  }

  advanceDay() {
    this.journeyDay += 1;
    this._advanceCalendarDay();
    this.recoverEnergy();
    // An observance expires at the start of the day after its last, so the
    // rebate lands where the player can see it rather than mid-resolution.
    this.settleObservance();
    this.emit(
      'day_changed',
      this.journeyDay,
      this.getWeekdayName(),
      this.getMonthName(),
      this.year,
      this.dayOfMonth,
    );
    this._statsChanged();
  }

  _advanceCalendarDay() {
    this.dayOfMonth += 1;
    let maxDay = DAYS_IN_MONTH[this.monthIndex];
    if (this.monthIndex === 1 && this._isLeapYear(this.year)) maxDay = 29;
    if (this.dayOfMonth > maxDay) {
      this.dayOfMonth = 1;
      this.monthIndex += 1;
      if (this.monthIndex >= 12) {
        this.monthIndex = 0;
        this.year += 1;
      }
    }
  }

  _isLeapYear(y) {
    return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  }

  // ---------------- weather & festivals ----------------

  /** Today's weather. Derived, never stored. */
  getWeather() {
    return weatherForDay(this.journeyDay, this.weatherSeed, this.getSeason());
  }

  /** Tags shut down by today's weather. */
  getClosedTags() {
    return closedTags(this.getWeather());
  }

  /** Today's festival, or null. */
  getFestival() {
    return festivalOn(this.monthIndex, this.dayOfMonth);
  }

  // ---------------- perks ----------------

  getPerkEffects() {
    return aggregatePerks(this.perks);
  }

  hasPerk(id) {
    return this.perks.has(id);
  }

  canBuy(id) {
    return canBuyPerk(id, { insight: this.insight, perks: this.perks });
  }

  /** Spend insight on a perk. @returns {boolean} */
  buyPerk(id) {
    const check = this.canBuy(id);
    if (!check.ok) return false;
    this.insight -= getPerk(id).cost;
    this.perks.add(id);
    this.emit('perks_changed', [...this.perks], this.insight);
    this._statsChanged();
    return true;
  }

  // ---------------- stat mutation ----------------

  /**
   * Apply a partial delta bundle. Unknown keys are ignored.
   * @param {{sanity?:number, money?:number, energy?:number,
   *          reputation?:number, insight?:number}} d
   */
  applyDeltas(d = {}) {
    this.sanity = clamp(this.sanity + (d.sanity ?? 0), 0, MAX_STAT);
    // Money is a wallet: floor at 0 (broke ends the run), no gameplay ceiling.
    this.money = clamp(this.money + (d.money ?? 0), 0, MONEY_HARD_CEILING);
    this.energy = clamp(this.energy + (d.energy ?? 0), 0, MAX_ENERGY);
    this.reputation = clamp(this.reputation + (d.reputation ?? 0), 0, MAX_REPUTATION);
    this.insight = Math.max(this.insight + (d.insight ?? 0), 0);
    this._statsChanged();
  }

  /** Back-compat shim for the original two-stat signature. */
  applyEventDeltas(
    sanityDelta,
    moneyDelta,
    energyDelta = 0,
    reputationDelta = 0,
    insightDelta = 0,
  ) {
    this.applyDeltas({
      sanity: sanityDelta,
      money: moneyDelta,
      energy: energyDelta,
      reputation: reputationDelta,
      insight: insightDelta,
    });
  }

  /** Overnight energy recovery, boosted by Second Wind. */
  recoverEnergy() {
    const perks = this.getPerkEffects();
    const amount = ENERGY_RECOVERY + perks.restBonus * 0.5;
    this.energy = clamp(this.energy + amount, 0, MAX_ENERGY);
    return amount;
  }

  /**
   * Extra sanity cost when running on empty. Zero above the threshold,
   * scaling to −EXHAUSTION_MAX_PENALTY at zero energy, reduced by Second Wind.
   *
   * The curve is quadratic rather than linear on purpose. A shallow dip below
   * the threshold costs almost nothing, so a single hard day is survivable
   * and does not need punishing; the cost then climbs steeply as the tank
   * empties, so *ignoring* energy for a week is what actually kills you. That
   * is the shape that makes topping up a live consideration on the way down
   * rather than a panic at the bottom.
   */
  exhaustionPenalty() {
    const resist = this.exhaustionResist();
    const threshold = EXHAUSTION_THRESHOLD + resist;
    if (this.energy >= threshold) return 0;
    const depth = (threshold - this.energy) / threshold;
    // Ceil, not round: being below the threshold at all must cost at least 1,
    // otherwise `isExhausted` can be true while the penalty is silently zero.
    return -Math.max(1, Math.ceil(depth * depth * EXHAUSTION_MAX_PENALTY));
  }

  /**
   * How far the exhaustion threshold has been pushed out.
   *
   * One accessor rather than two call sites adding the same two numbers, so
   * `isExhausted` and `exhaustionPenalty()` can never disagree about where
   * the line is — a real bug class, since `isExhausted` drives the HUD warning
   * and the penalty drives the damage.
   */
  exhaustionResist() {
    return this.getPerkEffects().exhaustionResist + this.getObservanceEffects().exhaustionResist;
  }

  get isExhausted() {
    return this.energy < EXHAUSTION_THRESHOLD + this.exhaustionResist();
  }

  /** Rent due today? Sundays only, once each, unless prepaid or waived. */
  /**
   * Rent due today? Sundays only, once each, unless prepaid or waived.
   *
   * The prepaid comparison is **exclusive** (`<`, not `<=`), and that detail
   * is load-bearing. `prepayRent()` records the day the cover *runs out*, and
   * an inclusive bound made that final day free as well — so buying one week
   * on a Sunday covered both that Sunday and the next, a permanent 44% rent
   * discount for anyone who noticed. See the note on `prepayRent()`.
   */
  isRentDue() {
    if (this.getWeekdayIndex() !== 6) return false;
    if (this._lastRentJourneyDay === this.journeyDay) return false;
    if (this.journeyDay < this.rentPrepaidUntilDay) return false;
    if (this.getFestival()?.waivesRent) return false;
    return true;
  }

  /**
   * The headline rent for today, before any relief.
   *
   * Steps up by `RENT_ESCALATION_STEP` every `RENT_ESCALATION_PERIOD_DAYS`
   * from `RENT_ESCALATION_FIRST_DAY`, capped at `RENT_MAX_AMOUNT`. This is
   * the game's pressure curve: see the note in `core/balance.js` for why it
   * is a visible step rather than a smooth ramp.
   *
   * Pure in `journeyDay`, so the almanac can show the player the next rise
   * without simulating anything.
   *
   * @param {number} [journeyDay] defaults to today
   */
  baseRentOn(journeyDay = this.journeyDay) {
    if (journeyDay < RENT_ESCALATION_FIRST_DAY) return RENT_AMOUNT;
    const steps =
      Math.floor((journeyDay - RENT_ESCALATION_FIRST_DAY) / RENT_ESCALATION_PERIOD_DAYS) + 1;
    return Math.min(RENT_AMOUNT + steps * RENT_ESCALATION_STEP, RENT_MAX_AMOUNT);
  }

  /** The journey day the next rent rise lands on, or null once capped. */
  nextRentRiseDay(journeyDay = this.journeyDay) {
    if (this.baseRentOn(journeyDay) >= RENT_MAX_AMOUNT) return null;
    if (journeyDay < RENT_ESCALATION_FIRST_DAY) return RENT_ESCALATION_FIRST_DAY;
    const since = journeyDay - RENT_ESCALATION_FIRST_DAY;
    const steps = Math.floor(since / RENT_ESCALATION_PERIOD_DAYS) + 1;
    return RENT_ESCALATION_FIRST_DAY + steps * RENT_ESCALATION_PERIOD_DAYS;
  }

  /**
   * What rent actually costs after perks, reputation and any observance.
   *
   * Relief is subtracted from the *escalated* figure, so the counterplay a
   * player has invested in keeps working — it buys back a rising cost rather
   * than discounting a static one.
   */
  rentDue() {
    const perkRelief = this.getPerkEffects().rentRelief;
    const observanceRelief = this.getObservanceEffects().rentRelief;
    let repDiscount = 0;
    if (this.reputation >= RENT_DISCOUNT_REP_HIGH) {
      repDiscount = RENT_DISCOUNT_REP_HIGH_BONUS;
    } else if (this.reputation >= RENT_DISCOUNT_REP_THRESHOLD) {
      repDiscount = RENT_DISCOUNT_REP_BONUS;
    }
    return Math.max(this.baseRentOn() - perkRelief - repDiscount - observanceRelief, 0);
  }

  /** Charge rent once per Sunday. Returns the amount charged (0 if none). */
  applyRentIfSunday() {
    if (!this.isRentDue()) return 0;
    this._lastRentDayOfMonth = this.dayOfMonth;
    this._lastRentJourneyDay = this.journeyDay;
    const amount = this.rentDue();
    this.money = Math.max(this.money - amount, 0);
    this.rentPaidCount += 1;
    this._statsChanged();
    return amount;
  }

  /**
   * Pay ahead at the letting office: covers exactly `weeks` of Sundays.
   *
   * `rentPrepaidUntilDay` is the first day **not** covered, which pairs with
   * the exclusive bound in `isRentDue()`. Paying one week on day 11 (a
   * Sunday) covers day 11 only and expires on day 18, so the following Sunday
   * is charged normally.
   *
   * Cover extends from whichever is later — today, or the end of existing
   * cover — so paying twice in a row stacks two weeks rather than overwriting
   * the first.
   */
  prepayRent(weeks = 1) {
    const cost = this.prepayCost(weeks);
    if (this.money < cost) return false;
    this.money -= cost;
    const from = Math.max(this.rentPrepaidUntilDay, this.journeyDay);
    this.rentPrepaidUntilDay = from + weeks * 7;
    this._statsChanged();
    return true;
  }

  /**
   * What paying `weeks` ahead costs, priced week by week.
   *
   * Each week is charged at the rent that will actually be due when it falls,
   * not at today's rate. Without this, prepaying is an **escalation dodge**:
   * because rent rises over a run, buying fourteen weeks on day 8 at the
   * opening rate cost 270 against 336 paid weekly — a 20% discount for
   * knowing the mechanic, and a direct hole in the pressure curve the
   * escalation exists to create.
   *
   * Relief (perks, reputation, an observance) is applied to each week too, so
   * the counterplay still works; it just cannot be used to freeze the meter.
   *
   * Paying ahead therefore buys **certainty and a quiet Sunday**, never a
   * lower price — which is the same rule `tests/exploits.test.js` asserts for
   * the weekly case.
   */
  prepayCost(weeks = 1) {
    const perkRelief = this.getPerkEffects().rentRelief;
    const observanceRelief = this.getObservanceEffects().rentRelief;
    let repDiscount = 0;
    if (this.reputation >= RENT_DISCOUNT_REP_HIGH) {
      repDiscount = RENT_DISCOUNT_REP_HIGH_BONUS;
    } else if (this.reputation >= RENT_DISCOUNT_REP_THRESHOLD) {
      repDiscount = RENT_DISCOUNT_REP_BONUS;
    }
    const from = Math.max(this.rentPrepaidUntilDay, this.journeyDay);
    let total = 0;
    for (let w = 0; w < weeks; w += 1) {
      // Price each week at the rate of the **Sunday it actually covers**, not
      // at the day the cover begins. Those differ whenever a rent rise lands
      // between the two, and reading the earlier day was worth a real
      // discount: paying every Monday came to 186 against 194 paid normally,
      // because Monday's rate was charged for the following Sunday.
      const sunday = this._nextSundayOnOrAfter(from + w * 7);
      total += Math.max(this.baseRentOn(sunday) - perkRelief - repDiscount - observanceRelief, 0);
    }
    return total;
  }

  /** The first journey day on or after `day` that is a Sunday. */
  _nextSundayOnOrAfter(day) {
    const weekday = (day - 1 + START_WEEKDAY_OFFSET) % 7;
    return day + ((6 - weekday + 7) % 7);
  }

  // ---------------- observances ----------------

  /** The observance effect bundle in force today. Always a full bundle. */
  getObservanceEffects() {
    return activeObservanceEffects(this.pendingObservance, this.journeyDay);
  }

  /** @returns {{ok:boolean, reason:string}} */
  canObserve(id) {
    return canObserve(id, { insight: this.insight, pending: this.pendingObservance });
  }

  /**
   * Spend insight to begin keeping an observance.
   *
   * Replaces any observance already running — deliberately, and without a
   * refund. One at a time is the rule that keeps this a decision rather than
   * a shopping list; see `data/observances.js`.
   *
   * @returns {boolean} true if it was started
   */
  beginObservance(id) {
    const check = this.canObserve(id);
    if (!check.ok) return false;
    const o = getObservance(id);
    this.insight -= o.cost;
    this.pendingObservance = { id, untilDay: this.journeyDay + o.duration };
    this.observancesKept += 1;
    this.emit('observance_changed', this.pendingObservance);
    this._statsChanged();
    return true;
  }

  /**
   * Clear an expired observance and pay out any rebate.
   *
   * Called once per day from `advanceDay()`. Returns the observance that just
   * ended, or null, so the UI can say so rather than having it vanish.
   */
  settleObservance() {
    if (!isExpired(this.pendingObservance, this.journeyDay)) return null;
    const finished = getObservance(this.pendingObservance.id);
    const rebate = finished?.effects?.insightRebate ?? 0;
    this.pendingObservance = null;
    if (rebate > 0) this.insight += rebate;
    this.emit('observance_changed', null);
    this._statsChanged();
    return finished;
  }

  /** Legacy two-location action, retained so old callers keep working. */
  applyLocationAction(location) {
    if (location === 'spiritual_community') {
      this.sanity = Math.min(this.sanity + SANITY_GAIN, MAX_STAT);
      this.money = Math.max(this.money - MONEY_LOSS, 0);
      this.consecutiveBarDays = 0;
    } else if (location === 'bar') {
      // Money is uncapped — bar tips keep stacking past the old 100 ceiling.
      this.money = Math.min(this.money + MONEY_GAIN, MONEY_HARD_CEILING);
      this.sanity = Math.max(this.sanity - SANITY_LOSS, 0);
      this.consecutiveBarDays += 1;
      this.maxConsecutiveBarDays = Math.max(this.maxConsecutiveBarDays, this.consecutiveBarDays);
    }
    this.lastLocationVisited = location;
    this._statsChanged();
  }

  // ---------------- relationships ----------------

  /**
   * Record that Léon had a moment with someone.
   *
   * Affinity is the seed of the relationship layer. Today it is read by the
   * People screen ("you have run into Renata six times") and recorded in the
   * save; it is deliberately a plain counter rather than a tier system,
   * because the tiers should be defined by the content that gates on them and
   * that content does not exist yet. See DEVELOPMENT_ROADMAP.md → "Character
   * relationship state" for the intended shape.
   *
   * @param {string} characterId
   * @param {number} [amount]
   * @returns {number} the new total
   */
  noteAffinity(characterId, amount = 1) {
    if (!characterId) return 0;
    const next = (this.affinity[characterId] ?? 0) + amount;
    this.affinity[characterId] = next;
    this.emit('affinity_changed', characterId, next);
    return next;
  }

  /** How many times Léon has had a moment with this person this run. */
  affinityFor(characterId) {
    return this.affinity[characterId] ?? 0;
  }

  /** Everyone Léon has actually met this run, most-seen first. */
  metCharacters() {
    return Object.entries(this.affinity)
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([id, n]) => ({ id, count: n }));
  }

  /** Record that a day was spent somewhere. */
  noteVisit(locationId) {
    const location = getLocation(locationId);
    this.lastLocationVisited = locationId;
    this.visitedLocations.add(locationId);
    if (locationId === 'bar') {
      this.consecutiveBarDays += 1;
      this.maxConsecutiveBarDays = Math.max(this.maxConsecutiveBarDays, this.consecutiveBarDays);
    } else {
      this.consecutiveBarDays = 0;
    }
    if (location?.tags.includes('night')) this.nightDays += 1;
    if (this.getFestival()) this.festivalsSeen += 1;
  }

  checkGameOver() {
    if (this.gameOver) return true;
    if (this.sanity <= 0) {
      this.gameOver = true;
      this.won = false;
      this.gameOverMessage = 'Your sanity has crumbled. The spiritual path was neglected too long.';
      this.emit('game_over_triggered', this.gameOverMessage);
      return true;
    }
    if (this.money <= 0) {
      this.gameOver = true;
      this.won = false;
      this.gameOverMessage = "You're broke. The bills pile up and you can't sustain the community.";
      this.emit('game_over_triggered', this.gameOverMessage);
      return true;
    }
    return false;
  }

  /**
   * Second mastery layer: a hundred days, well-known and well-travelled.
   *
   * ## Why the money bar came down
   *
   * This used to require `money >= 200` alongside `reputation >= 80`, 18
   * locations visited and never more than five bar days in a row. Those
   * conditions are **mutually exclusive**: a play pattern broad enough to see
   * eighteen places and disciplined enough to avoid bar streaks banks around
   * 90-110 money at day 100, not 200. Simulated over 25 seeds of a competent
   * explorer, the mastery layer fired **zero times** — every run cleared
   * reputation, exploration and the bar-streak rule, and failed on money
   * alone.
   *
   * A win condition no player can satisfy is not a challenge, it is dead
   * code, so the money bar is now `MASTERY_MONEY` — comfortably above
   * subsistence, reachable by someone who has been careful, and not a demand
   * to grind the one activity the rest of the condition forbids.
   *
   * The bar-streak rule is the interesting half and is unchanged: mastery is
   * for a player who held the city *without* leaning on the thing that pays.
   */
  checkSecondWin() {
    if (this.masteryWon || this.gameOver) return false;
    if (this.journeyDay < MASTERY_GOAL_DAYS) return false;
    if (this.reputation < MASTERY_REPUTATION) return false;
    if (this.money < MASTERY_MONEY) return false;
    if (this.visitedLocations.size < MASTERY_LOCATIONS) return false;
    if (this.maxConsecutiveBarDays > MASTERY_MAX_BAR_STREAK) return false;
    this.masteryWon = true;
    this.masteryMessage =
      "A hundred days, well-known, well-traveled, and still standing. The city is yours as much as anyone's.";
    this.emit('mastery_won', this.masteryMessage);
    return true;
  }

  /**
   * How close this run is to the mastery layer, as readable rows.
   *
   * Exported as data rather than rendered here so the almanac can show the
   * player what mastery *is* — it was previously live code with no
   * achievement, no almanac entry and no mention in any document, which meant
   * no player could discover it even if they could satisfy it.
   */
  masteryProgress() {
    return [
      { label: 'Days held', now: this.journeyDay, need: MASTERY_GOAL_DAYS },
      { label: 'Reputation', now: Math.round(this.reputation), need: MASTERY_REPUTATION },
      { label: 'Money banked', now: Math.round(this.money), need: MASTERY_MONEY },
      { label: 'Places known', now: this.visitedLocations.size, need: MASTERY_LOCATIONS },
      {
        label: 'Longest bar streak',
        now: this.maxConsecutiveBarDays,
        need: MASTERY_MAX_BAR_STREAK,
        atMost: true,
      },
    ];
  }

  /**
   * Soft win: survive ENDURANCE_GOAL_DAYS without breaking. Does not end the
   * run — the player may keep going — but flags the moment once.
   * @returns {boolean} true the first time the goal is reached
   */
  checkWin() {
    if (this.won || this.gameOver) return false;
    if (this.journeyDay < ENDURANCE_GOAL_DAYS) return false;
    this.won = true;
    this.winMessage = `${ENDURANCE_GOAL_DAYS} days. The community still stands, the bar still opens, and you are still here. That is enough.`;
    this.emit('win_triggered', this.winMessage);
    return true;
  }

  /** Time-of-day greeting based on weekday and season — pure flavour. */
  getGreeting() {
    const day = this.getWeekdayName();
    const season = this.getSeason();
    if (day === 'Sunday')
      return 'Sunday morning. The city is quieter. So is the rent notice on the fridge.';
    if (day === 'Monday')
      return 'Monday. The week opens its hands and asks what you will put in them.';
    if (day === 'Friday')
      return 'Friday evening light. People are kinder to themselves, and to you.';
    if (day === 'Saturday')
      return 'Saturday. Markets, open mics, and the kind of tired that feels earned.';
    if (season === 'Winter')
      return `${day}. Cold enough that the kettle feels like a small kindness.`;
    if (season === 'Spring') return `${day}. Something is beginning, whether you are ready or not.`;
    if (season === 'Summer') return `${day}. The light lasts longer than your patience, some days.`;
    return `${day}. Autumn air, and the sense that the year is keeping score.`;
  }

  /** Léon himself — always available for the HUD portrait. */
  getProtagonist() {
    return (
      this.characterProfiles.find((p) => p.id === 'leon') ?? {
        id: 'leon',
        name: 'Léon',
        portrait: 'assets/portraits/leon.webp',
        role: 'protagonist',
      }
    );
  }

  // ---------------- achievements ----------------

  /** Snapshot handed to achievement predicates. */
  achievementSnapshot(extra = {}) {
    return {
      journeyDay: this.journeyDay,
      sanity: this.sanity,
      money: this.money,
      energy: this.energy,
      reputation: this.reputation,
      insight: this.insight,
      perks: this.perks,
      visitedLocations: this.visitedLocations,
      totalLocations: LOCATIONS.length,
      rentPaidCount: this.rentPaidCount,
      nightDays: this.nightDays,
      festivalsSeen: this.festivalsSeen,
      weatherId: this.getWeather().id,
      locationTags: getLocation(this.lastLocationVisited)?.tags ?? [],
      ...extra,
    };
  }

  /** Evaluate and record. @returns {object[]} newly earned */
  checkAchievements(extra = {}) {
    const earned = evaluateAchievements(this.achievementSnapshot(extra), this.achievements);
    for (const a of earned) {
      this.achievements.add(a.id);
      this.pendingAchievements.push(a);
      this.emit('achievement_earned', a);
    }
    return earned;
  }

  // ---------------- history & flavour ----------------

  addHistory(entry) {
    this.recentHistory.unshift(entry);
    if (this.recentHistory.length > 5) this.recentHistory.pop();
    this.emit('history_updated', entry);
  }

  getSeason() {
    const m = this.monthIndex;
    if (m === 11 || m === 0 || m === 1) return 'Winter';
    if (m >= 2 && m <= 4) return 'Spring';
    if (m >= 5 && m <= 7) return 'Summer';
    if (m >= 8 && m <= 10) return 'Autumn';
    return 'Unknown';
  }

  /**
   * A gentle, informational focus cue for the hub. It never chooses for the
   * player; it just makes a looming need easier to notice at a glance.
   */
  getDailyNudge() {
    if (this.sanity < 25 && this.money < 25) {
      return {
        emoji: '🫶',
        label: 'Take it gently',
        text: 'Both your head and wallet are under pressure. One careful day is enough.',
      };
    }
    if (this.sanity < 25) {
      return {
        emoji: '🫧',
        label: 'A little room',
        text: 'Your sanity is low. A quieter plan may help you come back to yourself.',
      };
    }
    if (this.energy < EXHAUSTION_THRESHOLD) {
      const predictive =
        this.consecutiveBarDays >= 2
          ? 'A bar night will put you near empty quickly. Consider rest tomorrow.'
          : 'Your energy is running thin. Small, restorative plans still count.';
      return { emoji: '🫖', label: 'Pace yourself', text: predictive };
    }
    if (this.isRentDue()) {
      return {
        emoji: '🧾',
        label: 'Sunday rent',
        text: `Rent is due today: ${this.rentDue()} money. You can settle it at the letting office ahead of time.`,
      };
    }
    if (this.money < 25) {
      return {
        emoji: '🪙',
        label: 'Keep an eye on the wallet',
        text: 'Money is low. A paid day can make the next choice less urgent.',
      };
    }
    const daysToSunday = (6 - this.getWeekdayIndex() + 7) % 7;
    if (
      daysToSunday > 0 &&
      daysToSunday <= 2 &&
      this.rentPrepaidUntilDay < this.journeyDay + daysToSunday
    ) {
      return {
        emoji: '📅',
        label: 'Looking ahead',
        text: `Sunday rent is ${daysToSunday === 1 ? 'tomorrow' : 'in two days'}. A little cushion can make it quieter.`,
      };
    }
    return {
      emoji: '🏠',
      label: 'No rush',
      text: 'Nothing is on fire. Choose the kind of day you can return from.',
    };
  }

  /** Friend-event name pool — everyone except the protagonist. */
  getCharacterNames() {
    return this.characterProfiles.filter((p) => p.id !== 'leon').map((p) => p.name);
  }

  getAllCharacters() {
    return [...this.characterProfiles];
  }

  // ---------------- save / load ----------------

  /** Plain JSON-safe snapshot of the whole run. */
  toJSON() {
    return {
      v: CURRENT_SAVE_VERSION,
      sanity: this.sanity,
      money: this.money,
      energy: this.energy,
      reputation: this.reputation,
      insight: this.insight,
      journeyDay: this.journeyDay,
      dayOfMonth: this.dayOfMonth,
      monthIndex: this.monthIndex,
      year: this.year,
      gameOver: this.gameOver,
      gameOverMessage: this.gameOverMessage,
      won: this.won,
      winMessage: this.winMessage,
      masteryWon: this.masteryWon,
      masteryMessage: this.masteryMessage,
      consecutiveBarDays: this.consecutiveBarDays,
      maxConsecutiveBarDays: this.maxConsecutiveBarDays,
      lastLocationVisited: this.lastLocationVisited,
      lastRentDayOfMonth: this._lastRentDayOfMonth,
      lastRentJourneyDay: this._lastRentJourneyDay,
      rentPrepaidUntilDay: this.rentPrepaidUntilDay,
      rentPaidCount: this.rentPaidCount,
      recentHistory: [...this.recentHistory],
      perks: [...this.perks],
      achievements: [...this.achievements],
      visitedLocations: [...this.visitedLocations],
      nightDays: this.nightDays,
      festivalsSeen: this.festivalsSeen,
      weatherSeed: this.weatherSeed,
      pendingObservance: this.pendingObservance ? { ...this.pendingObservance } : null,
      observancesKept: this.observancesKept,
      affinity: { ...this.affinity },
    };
  }

  /** Restore from `toJSON()`. Unknown or malformed input is ignored. */
  loadFrom(data) {
    const migrated = migrateSave(data);
    if (!migrated || typeof migrated !== 'object' || !SUPPORTED_SAVE_VERSIONS.includes(migrated.v))
      return false;
    const num = (v, fallback) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
    const arr = (v) => (Array.isArray(v) ? v : []);

    this.sanity = clamp(num(migrated.sanity, START_SANITY), 0, MAX_STAT);
    this.money = clamp(num(migrated.money, START_MONEY), 0, MONEY_HARD_CEILING);
    this.energy = clamp(num(migrated.energy, START_ENERGY), 0, MAX_ENERGY);
    this.reputation = clamp(num(migrated.reputation, START_REPUTATION), 0, MAX_REPUTATION);
    this.insight = Math.max(num(migrated.insight, 0), 0);

    this.journeyDay = Math.max(num(migrated.journeyDay, 1), 1);
    this.dayOfMonth = clamp(num(migrated.dayOfMonth, 1), 1, 31);
    this.monthIndex = clamp(num(migrated.monthIndex, 0), 0, 11);
    this.year = num(migrated.year, 2026);
    this.gameOver = Boolean(migrated.gameOver);
    this.gameOverMessage =
      typeof migrated.gameOverMessage === 'string' ? migrated.gameOverMessage : '';
    this.won = Boolean(migrated.won);
    this.winMessage = typeof migrated.winMessage === 'string' ? migrated.winMessage : '';
    this.masteryWon = Boolean(migrated.masteryWon);
    this.masteryMessage =
      typeof migrated.masteryMessage === 'string' ? migrated.masteryMessage : '';

    this.consecutiveBarDays = num(migrated.consecutiveBarDays, 0);
    this.maxConsecutiveBarDays = num(migrated.maxConsecutiveBarDays, this.consecutiveBarDays);
    this.lastLocationVisited =
      typeof migrated.lastLocationVisited === 'string' ? migrated.lastLocationVisited : '';
    this._lastRentDayOfMonth = num(migrated.lastRentDayOfMonth, -1);
    this._lastRentJourneyDay = num(migrated.lastRentJourneyDay, -1);
    this.rentPrepaidUntilDay = num(migrated.rentPrepaidUntilDay, 0);
    this.rentPaidCount = num(migrated.rentPaidCount, 0);
    this.recentHistory = arr(migrated.recentHistory).slice(0, 5);

    this.perks = new Set(arr(migrated.perks).filter((id) => getPerk(id)));
    this.achievements = new Set(arr(migrated.achievements));
    this.visitedLocations = new Set(arr(migrated.visitedLocations));
    this.nightDays = num(migrated.nightDays, 0);
    this.festivalsSeen = num(migrated.festivalsSeen, 0);
    this.weatherSeed = num(migrated.weatherSeed, 0);
    this.pendingAchievements = [];

    // An observance from a save is only honoured if it names a real
    // observance and has a sane expiry; a renamed or removed one is dropped
    // rather than left pending forever.
    const obs = migrated.pendingObservance;
    this.pendingObservance =
      obs && typeof obs === 'object' && getObservance(obs.id) && Number.isFinite(obs.untilDay)
        ? { id: obs.id, untilDay: Math.max(0, Math.floor(obs.untilDay)) }
        : null;
    this.observancesKept = num(migrated.observancesKept, 0);

    // Affinity is a plain id -> count map. Filter to finite positives so a
    // hand-edited save cannot inject NaN into the People screen.
    this.affinity = {};
    if (migrated.affinity && typeof migrated.affinity === 'object') {
      for (const [id, n] of Object.entries(migrated.affinity)) {
        if (typeof n === 'number' && Number.isFinite(n) && n > 0) this.affinity[id] = Math.floor(n);
      }
    }

    this._statsChanged();
    this.emit(
      'day_changed',
      this.journeyDay,
      this.getWeekdayName(),
      this.getMonthName(),
      this.year,
      this.dayOfMonth,
    );
    return true;
  }
}

// ------------------------------------------------------------- persistence

/**
 * Migrate a save from any supported older schema to the current version.
 *
 * Migrations are **cumulative and forward-only**: each block upgrades one
 * version to the next and falls through, so a v3 save walks v3 → v5 → v6 and
 * every intermediate default is applied exactly once. Adding v7 later means
 * adding one block at the bottom, not editing the ones above it.
 *
 * The contract, which `tests/save-migration.test.js` enforces for every
 * supported version: migrating a save must never throw, never lose a field
 * the newer schema still uses, and always produce something `loadFrom()`
 * accepts.
 */
export function migrateSave(data) {
  // An array is an object, and `{...[]}` is `{}` — so without this guard a
  // pasted `[]` migrated cleanly into a blank v6 save and silently reset the
  // player's run to day one. Caught by the property test that asserts a
  // rejected import leaves the current run untouched.
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const currentVersion = data.v ?? 3;
  if (currentVersion >= CURRENT_SAVE_VERSION) return data;

  const migrated = { ...data, v: CURRENT_SAVE_VERSION };

  // v3/v4 -> v5: add missing fields with safe defaults
  if (currentVersion === 3 || currentVersion === 4) {
    if (typeof migrated.reputation !== 'number') migrated.reputation = 10;
    if (typeof migrated.energy !== 'number') migrated.energy = 100;
    if (typeof migrated.insight !== 'number') migrated.insight = 0;
    if (typeof migrated.visitedLocations === 'undefined') migrated.visitedLocations = [];
    if (typeof migrated.perks === 'undefined') migrated.perks = [];
    if (typeof migrated.achievements === 'undefined') migrated.achievements = [];
    if (typeof migrated.nightDays !== 'number') migrated.nightDays = 0;
    if (typeof migrated.festivalsSeen !== 'number') migrated.festivalsSeen = 0;
    if (typeof migrated.weatherSeed !== 'number')
      migrated.weatherSeed = Math.floor(Math.random() * 1e9);
    if (typeof migrated.masteryWon !== 'boolean') migrated.masteryWon = false;
    if (typeof migrated.masteryMessage !== 'string') migrated.masteryMessage = '';
    if (typeof migrated.maxConsecutiveBarDays !== 'number') {
      migrated.maxConsecutiveBarDays = migrated.consecutiveBarDays ?? 0;
    }
  }

  // v5 -> v6: the repeatable insight sink and the relationship counter. Both
  // are additive, so an older run resumes with no observance pending and an
  // empty affinity map rather than being rejected.
  if (currentVersion <= 5) {
    if (typeof migrated.pendingObservance === 'undefined') migrated.pendingObservance = null;
    if (typeof migrated.observancesKept !== 'number') migrated.observancesKept = 0;
    if (!migrated.affinity || typeof migrated.affinity !== 'object') migrated.affinity = {};
  }

  return migrated;
}

/**
 * Thin, failure-tolerant wrapper over localStorage. Private browsing, disabled
 * storage and quota errors must never take the game down, so every operation
 * is best-effort and reports a boolean.
 */
export const saveStore = {
  available(storage = globalThis.localStorage) {
    return Boolean(storage);
  },
  save(gs, storage = globalThis.localStorage, eventManager = null) {
    if (!storage) return false;
    try {
      const gameState = gs.toJSON();
      const snapshot = eventManager
        ? { v: CURRENT_SAVE_VERSION, gameState, eventManager: eventManager.toJSON() }
        : gameState;
      storage.setItem(SAVE_KEY, JSON.stringify(snapshot));
      // Prune superseded slots once the current one is safely written. A
      // migrated run previously left its old key behind forever, so two
      // divergent saves coexisted and the next schema bump would have had to
      // guess which was real.
      for (const key of LEGACY_SAVE_KEYS) {
        try {
          storage.removeItem(key);
        } catch {
          // A storage that rejects removal is still a storage we just wrote to.
        }
      }
      return true;
    } catch {
      return false;
    }
  },
  load(gs, storage = globalThis.localStorage, eventManager = null) {
    if (!storage) return false;
    try {
      // Keep v3 runs playable; task and journal fields are intentionally ignored
      // as part of the calmer v5 state shape.
      const raw = [SAVE_KEY, ...LEGACY_SAVE_KEYS].map((key) => storage.getItem(key)).find(Boolean);
      if (!raw) return false;
      const snapshot = JSON.parse(raw);
      const state = snapshot?.gameState ?? snapshot;
      const loaded = gs.loadFrom(state);
      if (loaded && eventManager && snapshot?.eventManager)
        eventManager.loadFrom(snapshot.eventManager);
      return loaded;
    } catch {
      return false;
    }
  },
  clear(storage = globalThis.localStorage) {
    if (!storage) return false;
    try {
      storage.removeItem(SAVE_KEY);
      for (const key of LEGACY_SAVE_KEYS) storage.removeItem(key);
      return true;
    } catch {
      return false;
    }
  },
  has(storage = globalThis.localStorage) {
    if (!storage) return false;
    try {
      return [SAVE_KEY, ...LEGACY_SAVE_KEYS].some((key) => storage.getItem(key) !== null);
    } catch {
      return false;
    }
  },

  /**
   * Serialise the current run to a string the player can keep.
   *
   * localStorage is convenient and it is not durable: clearing site data,
   * switching browser or using a private window all destroy a hundred-day
   * run with no warning. Export is the smallest honest answer — no accounts,
   * no server, no new failure modes, just the save as text.
   *
   * @returns {string} pretty-printed JSON, or '' if serialisation fails
   */
  export(gs, eventManager = null) {
    try {
      return JSON.stringify(
        {
          v: CURRENT_SAVE_VERSION,
          exportedAt: new Date().toISOString(),
          gameState: gs.toJSON(),
          eventManager: eventManager ? eventManager.toJSON() : null,
        },
        null,
        2,
      );
    } catch {
      return '';
    }
  },

  /**
   * Restore a run from an exported string.
   *
   * Deliberately tolerant about shape — it accepts a full export, a bare
   * snapshot, or a raw game-state object, because a player pasting text back
   * in should not have to know which of those they copied. It is *not*
   * tolerant about validity: anything `loadFrom()` rejects leaves the current
   * run untouched.
   *
   * @returns {boolean} true if the run was replaced
   */
  import(text, gs, eventManager = null) {
    if (typeof text !== 'string' || text.trim() === '') return false;
    try {
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
      // `??` would fall through to the wrapper when `gameState` is present but
      // null, importing the envelope as if it were a run. Distinguish "has no
      // gameState key" from "has an unusable one".
      const state = 'gameState' in parsed ? parsed.gameState : parsed;
      if (!state || typeof state !== 'object' || Array.isArray(state)) return false;
      if (!gs.loadFrom(state)) return false;
      if (eventManager && parsed.eventManager) eventManager.loadFrom(parsed.eventManager);
      return true;
    } catch {
      return false;
    }
  },
};
