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
  RENT_ESCALATION,
  RENT_ESCALATION_PERIOD_DAYS,
  RENT_MAX,
  START_WEEKDAY_OFFSET,
  RENT_DISCOUNT_REP_THRESHOLD,
  RENT_DISCOUNT_REP_BONUS,
  RENT_DISCOUNT_REP_HIGH,
  RENT_DISCOUNT_REP_HIGH_BONUS,
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
  RENT_ESCALATION,
  RENT_ESCALATION_PERIOD_DAYS,
  RENT_MAX,
  START_WEEKDAY_OFFSET,
  RENT_DISCOUNT_REP_THRESHOLD,
  RENT_DISCOUNT_REP_BONUS,
  RENT_DISCOUNT_REP_HIGH,
  RENT_DISCOUNT_REP_HIGH_BONUS,
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

/** localStorage key for the save slot. */
export const SAVE_KEY = 'secondbarnone.save.v4';
const LEGACY_SAVE_KEY = 'secondbarnone.save.v3';

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

    this.consecutiveBarDays = 0;
    this.lastLocationVisited = '';
    this._turnResolvedOnDay = -1;
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
    const resist = this.getPerkEffects().exhaustionResist;
    const threshold = EXHAUSTION_THRESHOLD + resist;
    if (this.energy >= threshold) return 0;
    const depth = (threshold - this.energy) / threshold;
    // Ceil, not round: being below the threshold at all must cost at least 1,
    // otherwise `isExhausted` can be true while the penalty is silently zero.
    return -Math.max(1, Math.ceil(depth * depth * EXHAUSTION_MAX_PENALTY));
  }

  get isExhausted() {
    return this.energy < EXHAUSTION_THRESHOLD + this.getPerkEffects().exhaustionResist;
  }

  /** Rent due today? Sundays only, once each, unless prepaid or waived. */
  isRentDue() {
    if (this.getWeekdayIndex() !== 6) return false;
    if (this._lastRentJourneyDay === this.journeyDay) return false;
    if (this.journeyDay <= this.rentPrepaidUntilDay) return false;
    if (this.getFestival()?.waivesRent) return false;
    return true;
  }

  /** Base rent rises through a long run, then stops at a playable ceiling. */
  baseRentForToday() {
    const steps = Math.floor((this.journeyDay - 1) / RENT_ESCALATION_PERIOD_DAYS);
    return Math.min(RENT_AMOUNT + steps * RENT_ESCALATION, RENT_MAX);
  }

  /** What rent actually costs after perks and reputation discounts. */
  rentDue() {
    const perkRelief = this.getPerkEffects().rentRelief;
    let repDiscount = 0;
    if (this.reputation >= RENT_DISCOUNT_REP_HIGH) repDiscount = RENT_DISCOUNT_REP_HIGH_BONUS;
    else if (this.reputation >= RENT_DISCOUNT_REP_THRESHOLD) repDiscount = RENT_DISCOUNT_REP_BONUS;
    return Math.max(this.baseRentForToday() - perkRelief - repDiscount, 0);
  }

  /** Charge rent once per Sunday. Returns the amount charged (0 if none). */
  applyRentIfSunday() {
    if (!this.isRentDue()) return 0;
    this._lastRentJourneyDay = this.journeyDay;
    const amount = this.rentDue();
    this.money = Math.max(this.money - amount, 0);
    this.rentPaidCount += 1;
    this._statsChanged();
    return amount;
  }

  /** Pay ahead at the letting office: covers `weeks` of Sundays. */
  prepayRent(weeks = 1) {
    const cost = this.rentDue() * weeks;
    if (this.money < cost) return false;
    this.money -= cost;
    this.rentPrepaidUntilDay = Math.max(this.rentPrepaidUntilDay, this.journeyDay - 1) + weeks * 7;
    this._statsChanged();
    return true;
  }

  /** Has the current journey day already received its action? */
  get isTurnResolved() {
    return this._turnResolvedOnDay === this.journeyDay;
  }

  markTurnResolved() {
    this._turnResolvedOnDay = this.journeyDay;
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
    }
    this.lastLocationVisited = location;
    this._statsChanged();
  }

  /** Record that a day was spent somewhere. */
  noteVisit(locationId) {
    const location = getLocation(locationId);
    this.lastLocationVisited = locationId;
    this.visitedLocations.add(locationId);
    if (locationId === 'bar') this.consecutiveBarDays += 1;
    else this.consecutiveBarDays = 0;
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

  /** Second mastery layer: survive 100 days with reputation, exploration and stability. */
  checkSecondWin() {
    if (this.gameOver || this.journeyDay < 100) return false;
    if (this.reputation < 80) return false;
    if (this.money < 200) return false;
    if (this.visitedLocations.size < 18) return false;
    // No more than 5 consecutive bar days in this run
    if (this.consecutiveBarDays > 5) return false;
    this.winMessage =
      "A hundred days, well-known, well-traveled, and still standing. The city is yours as much as anyone's.";
    this.emit('win_triggered', this.winMessage);
    return true;
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
      v: 4,
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
      consecutiveBarDays: this.consecutiveBarDays,
      lastLocationVisited: this.lastLocationVisited,
      turnResolvedOnDay: this._turnResolvedOnDay,
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
    };
  }

  /** Restore from `toJSON()`. Unknown or malformed input is ignored. */
  loadFrom(data) {
    const migrated = migrateSave(data);
    if (!migrated || typeof migrated !== 'object' || ![3, 4].includes(migrated.v)) return false;
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

    this.consecutiveBarDays = num(migrated.consecutiveBarDays, 0);
    this.lastLocationVisited =
      typeof migrated.lastLocationVisited === 'string' ? migrated.lastLocationVisited : '';
    this._turnResolvedOnDay = num(migrated.turnResolvedOnDay, -1);
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

/** Migrate a save from older schema versions to current v4. */
export function migrateSave(data) {
  if (!data || typeof data !== 'object') return null;
  const currentVersion = data.v ?? 3;
  if (currentVersion >= 4) return data;

  const migrated = { ...data, v: 4 };

  // v3 -> v4: add missing fields with safe defaults
  if (currentVersion === 3) {
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
  save(gs, storage = globalThis.localStorage) {
    if (!storage) return false;
    try {
      storage.setItem(SAVE_KEY, JSON.stringify(gs.toJSON()));
      return true;
    } catch {
      return false;
    }
  },
  load(gs, storage = globalThis.localStorage) {
    if (!storage) return false;
    try {
      // Keep v3 runs playable; task and journal fields are intentionally ignored
      // as part of the calmer v4 state shape.
      const raw = storage.getItem(SAVE_KEY) ?? storage.getItem(LEGACY_SAVE_KEY);
      if (!raw) return false;
      return gs.loadFrom(JSON.parse(raw));
    } catch {
      return false;
    }
  },
  clear(storage = globalThis.localStorage) {
    if (!storage) return false;
    try {
      storage.removeItem(SAVE_KEY);
      storage.removeItem(LEGACY_SAVE_KEY);
      return true;
    } catch {
      return false;
    }
  },
  has(storage = globalThis.localStorage) {
    if (!storage) return false;
    try {
      return storage.getItem(SAVE_KEY) !== null || storage.getItem(LEGACY_SAVE_KEY) !== null;
    } catch {
      return false;
    }
  },
};
