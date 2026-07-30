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
import { RENOVATIONS, getRenovation } from '../data/renovations.js';
import { LOCATIONS, getLocation } from '../data/locations.js';
import {
  MAX_STAT,
  START_SANITY,
  START_MONEY,
  MONEY_HARD_CEILING,
  MAX_ENERGY,
  START_ENERGY,
  ENERGY_RECOVERY,
  EXHAUSTION_THRESHOLD,
  EXHAUSTION_MAX_PENALTY,
  EXHAUSTION_MONEY_BURN_MAX,
  MAX_REPUTATION,
  START_REPUTATION,
  KADEN_SMEAR_REPUTATION,
  ENLIGHTENMENT_GOAL_DAYS,
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
  WEEKDAY_NAMES,
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
  MAX_ENERGY,
  START_ENERGY,
  ENERGY_FULL_RECOVERY_DAYS,
  ENERGY_RECOVERY,
  EXHAUSTION_THRESHOLD,
  EXHAUSTION_MAX_PENALTY,
  EXHAUSTION_MONEY_BURN_MAX,
  MAX_REPUTATION,
  START_REPUTATION,
  KADEN_SMEAR_REPUTATION,
  ENLIGHTENMENT_GOAL_DAYS,
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
  WEEKDAY_NAMES,
} from './balance.js';

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
export const SAVE_VERSION = 6;
export const SAVE_KEY = 'secondbarnone.save.v6';
const LEGACY_KEYS = ['secondbarnone.save.v5', 'secondbarnone.save.v4', 'secondbarnone.save.v3'];

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
    /** Set once when the day-150 House of Middleway enlightenment ending fires. */
    this.masteryWon = false;
    this.masteryMessage = '';
    // The day-two Kaden story beat is stateful so reload cannot evade or repeat it.
    this.kadenSmearSeen = false;
    this.kadenSmearAcknowledged = false;

    this.consecutiveBarDays = 0;
    this.lastLocationVisited = '';
    this._turnResolvedOnDay = -1;
    this._rentChargedOnDay = -1;
    /** Set of journeyDay values for Sundays that have been pre-paid.
     *  Prepaying on a due Sunday never adds today to this set. */
    this.rentPrepaidDays = new Set();
    this.rentPaidCount = 0;
    this.recentHistory = [];

    this.perks = new Set();
    this.renovations = new Set();
    this.eventsSeen = new Set();
    this.achievements = new Set();
    this.visitedLocations = new Set();
    this.nightDays = 0;
    this.festivalsSeen = 0;

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
    const kadenSmear = this.triggerKadenSmearIfDue();
    this.emit(
      'day_changed',
      this.journeyDay,
      this.getWeekdayName(),
      this.getMonthName(),
      this.year,
      this.dayOfMonth,
    );
    this._statsChanged();
    return kadenSmear;
  }

  /** Kaden's opening move lands on the second playable morning, exactly once. */
  triggerKadenSmearIfDue() {
    if (this.kadenSmearSeen || this.journeyDay !== 2) return false;
    this.kadenSmearSeen = true;
    this.reputation = KADEN_SMEAR_REPUTATION;
    this.emit('kaden_smear_triggered');
    return true;
  }

  acknowledgeKadenSmear() {
    if (!this.kadenSmearSeen || this.kadenSmearAcknowledged) return false;
    this.kadenSmearAcknowledged = true;
    return true;
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

  /**
   * Today's weather. Derived, never stored. The month index is passed so
   * fringe-month weather (snow in November, frost in March) can appear even
   * when the calendar season disagrees.
   */
  getWeather() {
    return weatherForDay(this.journeyDay, this.weatherSeed, this.getSeason(), this.monthIndex);
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

  isRenovationUnlocked() {
    return this.journeyDay >= ENDURANCE_GOAL_DAYS || this.perks.size >= 10;
  }

  getRenovations() {
    return RENOVATIONS.map((r) => {
      const owned = this.renovations.has(r.id);
      const canBuy =
        !owned &&
        this.isRenovationUnlocked() &&
        this.insight >= r.cost.insight &&
        // Money reaching zero ends a run; a project may not spend the last coin.
        this.money > r.cost.money;
      return { ...r, owned, canBuy };
    });
  }

  buyRenovation(id) {
    if (!this.isRenovationUnlocked()) return false;
    const ren = getRenovation(id);
    if (!ren || this.renovations.has(id)) return false;
    if (this.insight < ren.cost.insight || this.money <= ren.cost.money) return false;

    this.insight = Math.max(0, this.insight - ren.cost.insight);
    this.money = Math.max(0, this.money - ren.cost.money);
    this.renovations.add(id);

    this.applyDeltas({
      reputation: ren.reward.reputation,
      sanity: ren.reward.sanity,
    });

    this.emit('renovations_changed', id);
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

  /** Overnight energy recovery, boosted by Second Wind. */
  recoverEnergy() {
    const perks = this.getPerkEffects();
    const amount = ENERGY_RECOVERY + perks.restBonus * 0.5;
    this.energy = clamp(this.energy + amount, 0, MAX_ENERGY);
    return amount;
  }

  /**
   * The energy level below which exhaustion bites. Second Wind's
   * `exhaustionResist` lowers this: exhaustion really does arrive later.
   */
  get exhaustionThreshold() {
    return Math.max(5, EXHAUSTION_THRESHOLD - this.getPerkEffects().exhaustionResist);
  }

  /**
   * Extra sanity cost when running on empty. Zero above the threshold,
   * scaling to −EXHAUSTION_MAX_PENALTY at zero energy, postponed by Second Wind.
   *
   * The curve is quadratic rather than linear on purpose. A shallow dip below
   * the threshold costs almost nothing, so a single hard day is survivable
   * and does not need punishing; the cost then climbs steeply as the tank
   * empties, so *ignoring* energy for a week is what actually kills you. That
   * is the shape that makes topping up a live consideration on the way down
   * rather than a panic at the bottom.
   */
  exhaustionPenalty() {
    const threshold = this.exhaustionThreshold;
    if (this.energy >= threshold) return 0;
    const depth = (threshold - this.energy) / threshold;
    // Ceil, not round: being below the threshold at all must cost at least 1,
    // otherwise `isExhausted` can be true while the penalty is silently zero.
    return -Math.max(1, Math.ceil(depth * depth * EXHAUSTION_MAX_PENALTY));
  }

  /**
   * Money cost of running on empty — takeaway instead of cooking, cabs
   * instead of walking. Same quadratic shape as the sanity penalty, scaling
   * to −EXHAUSTION_MONEY_BURN_MAX at zero energy, postponed by Second Wind
   * with the same shifted threshold.
   */
  exhaustionBurn() {
    const threshold = this.exhaustionThreshold;
    if (this.energy >= threshold) return 0;
    const depth = (threshold - this.energy) / threshold;
    return -Math.max(1, Math.ceil(depth * depth * EXHAUSTION_MONEY_BURN_MAX));
  }

  get isExhausted() {
    return this.energy < this.exhaustionThreshold;
  }

  /**
   * Rent due today? Sundays only, once each, unless prepaid or waived.
   *
   * Prepaid Sundays are tracked explicitly in `rentPrepaidDays` so that
   * paying ahead on a rent-due Sunday doesn't accidentally cover the
   * morning's notice — only future Sundays are added to the set.
   */
  isRentDue() {
    if (this.getWeekdayIndex() !== 6) return false;
    if (this._rentChargedOnDay === this.journeyDay) return false;
    if (this.rentPrepaidDays.has(this.journeyDay)) return false;
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

  /**
   * Charge rent once per Sunday. Returns the amount charged (0 if the day
   * is prepaid, waived, or already charged). Consumes the prepayment for
   * today so it doesn't silently double-cover.
   */
  applyRentIfSunday() {
    if (this.getWeekdayIndex() !== 6) return 0;
    if (this._rentChargedOnDay === this.journeyDay) return 0;
    if (this.getFestival()?.waivesRent) return 0;
    this._rentChargedOnDay = this.journeyDay;
    const amount = this.rentPrepaidDays.has(this.journeyDay) ? 0 : this.rentDue();
    this.rentPrepaidDays.delete(this.journeyDay);
    if (amount > 0) {
      this.money = Math.max(this.money - amount, 0);
      this.rentPaidCount += 1;
      this._statsChanged();
    }
    return amount;
  }

  /** Back-compat accessor used by saves and older tests. */
  get rentPrepaidUntilDay() {
    // Largest prepaid Sunday on or after today, or 0 if none.
    let max = 0;
    for (const d of this.rentPrepaidDays) if (d >= this.journeyDay && d > max) max = d;
    return max;
  }

  /**
   * Pay ahead at the letting office: covers `weeks` of *future* Sundays.
   *
   * Cost is the current `rentDue()` amount per week. Prepaying never covers
   * a Sunday whose rent is due today — you settle today out of pocket and
   * the payment buys the next week(s) forward. This prevents an exploit
   * where a single Sunday payment erased both today and the next Sunday.
   */
  prepayRent(weeks = 1) {
    if (!Number.isInteger(weeks) || weeks < 1) return false;
    const cost = this.rentDue() * weeks;
    // The last coin is not spendable: reaching zero is the run's loss state,
    // and an out-of-turn transaction must never create a recoverable zero.
    if (this.money <= cost) return false;

    // First Sunday covered by the payment. If rent is due today, today is
    // explicitly excluded (you can't buy your way out of the morning's
    // notice with the same payment that covers next week) — cover starts in
    // seven days. Otherwise cover starts at the next upcoming Sunday.
    const wi = this.getWeekdayIndex();
    const daysUntilNextSunday = this.isRentDue() ? 7 : (6 - wi + 7) % 7 || 7;
    let sunday = this.journeyDay + daysUntilNextSunday;
    for (let w = 0; w < weeks; w += 1) {
      // Repeated payments extend cover instead of charging for the same Set
      // entry again.
      while (this.rentPrepaidDays.has(sunday)) sunday += 7;
      this.rentPrepaidDays.add(sunday);
      sunday += 7;
    }
    this.money -= cost;
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

  recordEventSeen(event) {
    if (!event || !event.id) return;
    this.eventsSeen.add(event.id);
  }

  checkGameOver() {
    if (this.gameOver) return true;
    if (this.sanity <= 0) {
      this.gameOver = true;
      // `won` records that the endurance milestone was reached. A later death
      // ends the run but cannot un-earn sixty days of survival.
      this.gameOverMessage = 'Your sanity has crumbled. The spiritual path was neglected too long.';
      this.emit('game_over_triggered', this.gameOverMessage);
      return true;
    }
    if (this.energy <= 0) {
      this.gameOver = true;
      this.gameOverMessage = 'Léon drops down due to exhaustion.';
      this.emit('game_over_triggered', this.gameOverMessage);
      return true;
    }
    if (this.money <= 0) {
      this.gameOver = true;
      // Preserve the monotonic endurance milestone; game-over state is tracked
      // separately from what the player already achieved.
      this.gameOverMessage = "You're broke. The bills pile up and you can't sustain the community.";
      this.emit('game_over_triggered', this.gameOverMessage);
      return true;
    }
    return false;
  }

  /** Enlightenment: carry the fully restored House of Middleway through day 150. */
  checkSecondWin() {
    if (this.masteryWon || this.gameOver || this.journeyDay < ENLIGHTENMENT_GOAL_DAYS) return false;
    if (this.renovations.size !== RENOVATIONS.length) return false;
    this.masteryWon = true;
    this.masteryMessage =
      'You are enlightened! The House of Middleway is whole, and so is the life you built around it.';
    this.emit('mastery_triggered', this.masteryMessage);
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
    return GameState.seasonForMonth(this.monthIndex);
  }

  /**
   * The calendar date `daysAhead` days from today, without mutating state.
   * Used by the almanac so a forecast that crosses a month boundary computes
   * each day with its own season *and* its own fringe-month eligibility.
   */
  peekDay(daysAhead = 0) {
    let { dayOfMonth, monthIndex, year } = this;
    for (let i = 0; i < daysAhead; i += 1) {
      dayOfMonth += 1;
      let maxDay = DAYS_IN_MONTH[monthIndex];
      if (monthIndex === 1 && this._isLeapYear(year)) maxDay = 29;
      if (dayOfMonth > maxDay) {
        dayOfMonth = 1;
        monthIndex += 1;
        if (monthIndex >= 12) {
          monthIndex = 0;
          year += 1;
        }
      }
    }
    return { dayOfMonth, monthIndex, year };
  }

  /** The season `daysAhead` calendar days from today — see `peekDay`. */
  peekSeason(daysAhead = 0) {
    return GameState.seasonForMonth(this.peekDay(daysAhead).monthIndex);
  }

  static seasonForMonth(m) {
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
    if (this.isExhausted) {
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
    if (daysToSunday > 0 && daysToSunday <= 2) {
      const sundayDay = this.journeyDay + daysToSunday;
      if (!this.rentPrepaidDays.has(sundayDay)) {
        return {
          emoji: '📅',
          label: 'Looking ahead',
          text: `Sunday rent is ${daysToSunday === 1 ? 'tomorrow' : 'in two days'}. A little cushion can make it quieter.`,
        };
      }
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
      v: SAVE_VERSION,
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
      kadenSmearSeen: this.kadenSmearSeen,
      kadenSmearAcknowledged: this.kadenSmearAcknowledged,
      consecutiveBarDays: this.consecutiveBarDays,
      lastLocationVisited: this.lastLocationVisited,
      turnResolvedOnDay: this._turnResolvedOnDay,
      rentPrepaidDays: [...this.rentPrepaidDays],
      rentPaidCount: this.rentPaidCount,
      recentHistory: [...this.recentHistory],
      perks: [...this.perks],
      renovations: [...this.renovations],
      eventsSeen: [...this.eventsSeen],
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
    if (!migrated || typeof migrated !== 'object' || ![3, 4, 5, 6].includes(migrated.v))
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
    this.kadenSmearSeen = Boolean(migrated.kadenSmearSeen);
    this.kadenSmearAcknowledged = Boolean(migrated.kadenSmearAcknowledged);

    this.consecutiveBarDays = num(migrated.consecutiveBarDays, 0);
    this.lastLocationVisited =
      typeof migrated.lastLocationVisited === 'string' ? migrated.lastLocationVisited : '';
    this._turnResolvedOnDay = num(migrated.turnResolvedOnDay, -1);
    this.rentPaidCount = num(migrated.rentPaidCount, 0);
    // Rent prepayments: v5 stores an explicit set of Sundays; older saves
    // used a single "prepaidUntilDay" number. Import both.
    this.rentPrepaidDays = new Set();
    if (Array.isArray(migrated.rentPrepaidDays)) {
      for (const d of migrated.rentPrepaidDays) {
        const n = Number(d);
        if (Number.isFinite(n) && n >= this.journeyDay) this.rentPrepaidDays.add(n);
      }
    } else if (
      typeof migrated.rentPrepaidUntilDay === 'number' &&
      migrated.rentPrepaidUntilDay > 0
    ) {
      // Translate the old exclusive cutoff into explicit Sundays.
      const wi = this.getWeekdayIndex();
      let d = this.journeyDay + ((6 - wi + 7) % 7 || 7);
      while (d < migrated.rentPrepaidUntilDay) {
        this.rentPrepaidDays.add(d);
        d += 7;
      }
    }
    this.recentHistory = arr(migrated.recentHistory).slice(0, 5);

    this.perks = new Set(arr(migrated.perks).filter((id) => getPerk(id)));
    this.renovations = new Set(arr(migrated.renovations).filter((id) => getRenovation(id)));
    this.eventsSeen = new Set(arr(migrated.eventsSeen).filter((id) => typeof id === 'string'));
    this.achievements = new Set(arr(migrated.achievements));
    this.visitedLocations = new Set(arr(migrated.visitedLocations));
    this.nightDays = num(migrated.nightDays, 0);
    this.festivalsSeen = num(migrated.festivalsSeen, 0);
    this.weatherSeed = num(migrated.weatherSeed, 0);

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

/** Migrate a save from older schema versions to current SAVE_VERSION. */
export function migrateSave(data) {
  if (!data || typeof data !== 'object') return null;
  const v = data.v ?? 3;
  if (v > SAVE_VERSION) return null; // don't load from the future
  if (v === SAVE_VERSION) return data;

  const migrated = { ...data };

  // v3 -> v4: first energy/rep/insight expansion
  if (v < 4) {
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

  // v5 -> v6: existing runs have already passed Kaden's opening morning.
  if (v < 6) {
    migrated.kadenSmearSeen = migrated.journeyDay >= 2;
    migrated.kadenSmearAcknowledged = migrated.journeyDay >= 2;
  }

  // v4 -> v5: add mastery state + event-manager + RNG serialisation slot
  if (v < 5) {
    if (typeof migrated.masteryWon !== 'boolean') migrated.masteryWon = false;
    if (typeof migrated.masteryMessage !== 'string') migrated.masteryMessage = '';
    if (!migrated.events) migrated.events = null;
  }

  migrated.v = SAVE_VERSION;
  return migrated;
}

/**
 * Thin, failure-tolerant wrapper over localStorage. Private browsing, disabled
 * storage and quota errors must never take the game down, so every operation
 * is best-effort and reports a boolean.
 */
/**
 * Persistence wrapper.
 *
 * Saves are written as a single object containing both GameState and
 * EventManager (+ RNG) state, so that event timing and recent-event memory
 * survive reloads. We still accept legacy single-blob saves from v3/v4.
 */
export const saveStore = {
  available(storage = globalThis.localStorage) {
    return Boolean(storage);
  },
  save(gs, storage = globalThis.localStorage, extra = {}) {
    if (!storage) return false;
    try {
      const blob = { ...gs.toJSON(), ...extra };
      storage.setItem(SAVE_KEY, JSON.stringify(blob));
      return true;
    } catch {
      return false;
    }
  },
  load(gs, storage = globalThis.localStorage) {
    if (!storage) return false;
    try {
      let raw = storage.getItem(SAVE_KEY);
      for (const k of LEGACY_KEYS) if (!raw) raw = storage.getItem(k);
      if (!raw) return false;
      return gs.loadFrom(JSON.parse(raw));
    } catch {
      return false;
    }
  },
  loadExtra(storage = globalThis.localStorage) {
    if (!storage) return null;
    try {
      const raw = storage.getItem(SAVE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },
  clear(storage = globalThis.localStorage) {
    if (!storage) return false;
    try {
      storage.removeItem(SAVE_KEY);
      for (const k of LEGACY_KEYS) storage.removeItem(k);
      return true;
    } catch {
      return false;
    }
  },
  has(storage = globalThis.localStorage) {
    if (!storage) return false;
    try {
      if (storage.getItem(SAVE_KEY) !== null) return true;
      for (const k of LEGACY_KEYS) if (storage.getItem(k) !== null) return true;
      return false;
    } catch {
      return false;
    }
  },
};
