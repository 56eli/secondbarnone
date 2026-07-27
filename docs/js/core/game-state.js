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

/** Cap for gauge stats (sanity / energy / reputation). Money is uncapped. */
export const MAX_STAT = 100.0;
export const START_SANITY = 50.0;
export const START_MONEY = 50.0;

/**
 * Money is a wallet, not a gauge. It has no ceiling — you can earn past 100 —
 * but still bottoms out at 0 and ends the run. `MONEY_SOFT_CAP` is only used by
 * the HUD bar so a full track still means "comfortable", not "maxed".
 */
export const MONEY_SOFT_CAP = 100.0;
/** Practical upper bound so a corrupted save cannot overflow display maths. */
export const MONEY_HARD_CEILING = 99999.0;

/** Third resource: spent by every action, restored by rest. */
export const MAX_ENERGY = 100.0;
export const START_ENERGY = 100.0;
/**
 * Energy recovered automatically at the start of each new day.
 *
 * This was 16, which made the core bar/community alternation *exactly*
 * break-even on energy (−20 and −12 across two days against +32 recovered).
 * Energy therefore never bound anything and the exhaustion penalty never
 * fired. At 14 a sustained grind slowly runs the tank down, so resting is a
 * real decision rather than a dominated one — and the third resource finally
 * participates in the balance.
 */
export const ENERGY_RECOVERY = 14.0;
/** Below this, actions bite harder (see `exhaustionPenalty`). */
export const EXHAUSTION_THRESHOLD = 25.0;

/** Fourth resource: standing in the neighbourhood. Gates places. */
export const MAX_REPUTATION = 100.0;
export const START_REPUTATION = 10.0;

/** Currency of the perk tree. Uncapped, spent not lost. */
export const START_INSIGHT = 0;

/** Soft win: hold the community this many journey days without breaking. */
export const ENDURANCE_GOAL_DAYS = 100;

/** Offset so journey day 1 maps to Thursday (Jan 1, 2026). Mon=0 … Sun=6. */
export const START_WEEKDAY_OFFSET = 3;

/** Base rent deducted every Sunday. */
export const RENT_AMOUNT = 18.0;

/**
 * Rent escalation — the sink that makes a long run cost something.
 *
 * Flat rent was the balance bug at the heart of the game: every location and
 * the event pool drift slightly positive, so against a fixed −18/week a
 * competent player's money and sanity only ever ratcheted upward and the run
 * could not be lost. Rent now rises by `RENT_ESCALATION` every
 * `RENT_ESCALATION_PERIOD_DAYS`, so the city slowly asks for more and a
 * strategy that merely breaks even eventually stops breaking even.
 *
 * Tuned against scripts/simulate.js: the goal is that a greedy player is
 * comfortable for the first few weeks, feels real pressure around day 60-100,
 * and has to actively manage the back half of a 200-day run.
 */
export const RENT_ESCALATION = 3.0;
export const RENT_ESCALATION_PERIOD_DAYS = 24;
/** Rent stops climbing here so a very long run stays playable, not absurd. */
export const RENT_MAX = 42.0;

export const WEEKDAY_NAMES = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
];

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
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
    /**
     * Journey day whose turn has already been resolved, or -1.
     *
     * The UI disables the action button on click, but that made "one action
     * per day" a property of a DOM event handler rather than of the model —
     * calling resolveTurn() twice without advanceDay() in between happily
     * applied a full second day of effects. The guard lives here now so the
     * rule holds for tests, the console and any future caller.
     */
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
    this.emit('day_changed', this.journeyDay, this.getWeekdayName(), this.getMonthName(), this.year, this.dayOfMonth);
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
    this.emit('day_changed', this.journeyDay, this.getWeekdayName(), this.getMonthName(), this.year, this.dayOfMonth);
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
    return (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0);
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

  /** Overnight energy recovery, boosted by Second Wind. */
  recoverEnergy() {
    const perks = this.getPerkEffects();
    const amount = ENERGY_RECOVERY + perks.restBonus * 0.5;
    this.energy = clamp(this.energy + amount, 0, MAX_ENERGY);
    return amount;
  }

  /**
   * Extra sanity cost when running on empty. Zero above the threshold,
   * scaling to −6 at zero energy, reduced by Second Wind.
   */
  exhaustionPenalty() {
    const resist = this.getPerkEffects().exhaustionResist;
    const threshold = EXHAUSTION_THRESHOLD + resist;
    if (this.energy >= threshold) return 0;
    const depth = (threshold - this.energy) / threshold;
    // Ceil, not round: being below the threshold at all must cost at least 1,
    // otherwise `isExhausted` can be true while the penalty is silently zero.
    return -Math.max(1, Math.ceil(depth * 6));
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

  /**
   * Base rent for the current point in the run, before the union card.
   * Rises one step every RENT_ESCALATION_PERIOD_DAYS, capped at RENT_MAX.
   */
  baseRentForToday() {
    const steps = Math.floor((this.journeyDay - 1) / RENT_ESCALATION_PERIOD_DAYS);
    return Math.min(RENT_AMOUNT + steps * RENT_ESCALATION, RENT_MAX);
  }

  /** What rent actually costs today, after the union card. */
  rentDue() {
    return Math.max(this.baseRentForToday() - this.getPerkEffects().rentRelief, 0);
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
    // Cover `weeks` of *future* Sundays.
    //
    // This used to read `Math.max(rentPrepaidUntilDay, journeyDay) + weeks*7`,
    // which meant prepaying ON a Sunday that rent was already due for waived
    // that Sunday as well as the next — one 18-money payment bought two weeks
    // (measured: 144 vs 180 money over 70 days). Anchoring to `journeyDay - 1`
    // makes today the last *unpaid* day, so a week of prepay is exactly a week.
    const anchor = Math.max(this.rentPrepaidUntilDay, this.journeyDay - 1);
    this.rentPrepaidUntilDay = anchor + weeks * 7;
    this._statsChanged();
    return true;
  }

  /** Has today's turn already been resolved? */
  get isTurnResolved() {
    return this._turnResolvedOnDay === this.journeyDay;
  }

  /** Mark today's turn as resolved. Called by resolveTurn(). */
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
   * Soft win: survive ENDURANCE_GOAL_DAYS without breaking. Does not end the
   * run — the player may keep going — but flags the moment once.
   * @returns {boolean} true the first time the goal is reached
   */
  checkWin() {
    if (this.won || this.gameOver) return false;
    if (this.journeyDay < ENDURANCE_GOAL_DAYS) return false;
    this.won = true;
    this.winMessage = 'One hundred days. The community still stands, the bar still opens, and you are still here. That is enough.';
    this.emit('win_triggered', this.winMessage);
    return true;
  }

  /** Time-of-day greeting based on weekday and season — pure flavour. */
  getGreeting() {
    const day = this.getWeekdayName();
    const season = this.getSeason();
    if (day === 'Sunday') return 'Sunday morning. The city is quieter. So is the rent notice on the fridge.';
    if (day === 'Monday') return 'Monday. The week opens its hands and asks what you will put in them.';
    if (day === 'Friday') return 'Friday evening light. People are kinder to themselves, and to you.';
    if (day === 'Saturday') return 'Saturday. Markets, open mics, and the kind of tired that feels earned.';
    if (season === 'Winter') return `${day}. Cold enough that the kettle feels like a small kindness.`;
    if (season === 'Spring') return `${day}. Something is beginning, whether you are ready or not.`;
    if (season === 'Summer') return `${day}. The light lasts longer than your patience, some days.`;
    return `${day}. Autumn air, and the sense that the year is keeping score.`;
  }

  /** Léon himself — always available for the HUD portrait. */
  getProtagonist() {
    return this.characterProfiles.find((p) => p.id === 'leon')
      ?? { id: 'leon', name: 'Léon', portrait: 'assets/portraits/leon.webp', role: 'protagonist' };
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
      return { emoji: '🫶', label: 'Take it gently', text: 'Both your head and wallet are under pressure. One careful day is enough.' };
    }
    if (this.sanity < 25) {
      return { emoji: '🫧', label: 'A little room', text: 'Your sanity is low. A quieter plan may help you come back to yourself.' };
    }
    if (this.energy < EXHAUSTION_THRESHOLD) {
      return { emoji: '🫖', label: 'Pace yourself', text: 'Your energy is running thin. Small, restorative plans still count.' };
    }
    if (this.isRentDue()) {
      return { emoji: '🧾', label: 'Sunday rent', text: `Rent is due today: ${this.rentDue()} money. You can settle it at the letting office ahead of time.` };
    }
    if (this.money < 25) {
      return { emoji: '🪙', label: 'Keep an eye on the wallet', text: 'Money is low. A paid day can make the next choice less urgent.' };
    }
    const daysToSunday = (6 - this.getWeekdayIndex() + 7) % 7;
    if (daysToSunday > 0 && daysToSunday <= 2 && this.rentPrepaidUntilDay < this.journeyDay + daysToSunday) {
      return { emoji: '📅', label: 'Looking ahead', text: `Sunday rent is ${daysToSunday === 1 ? 'tomorrow' : 'in two days'}. A little cushion can make it quieter.` };
    }
    return { emoji: '🏠', label: 'No rush', text: 'Nothing is on fire. Choose the kind of day you can return from.' };
  }

  /**
   * The snapshot `evaluateUnlock()` needs, in one place.
   *
   * The hub and the map used to hand-build this object independently, so a
   * new gate field had to be added in two UI call sites and neither would
   * fail a test if one were missed. Owning it here keeps every consumer —
   * hub, map, previews and headless tests — agreeing by construction.
   */
  getUnlockSnapshot() {
    return {
      journeyDay: this.journeyDay,
      reputation: this.reputation,
      weekday: this.getWeekdayIndex(),
      perks: this.perks,
      closedTags: this.getClosedTags(),
    };
  }

  /** Friend-event name pool — everyone except the protagonist. */
  getCharacterNames() {
    return this.characterProfiles
      .filter((p) => p.id !== 'leon')
      .map((p) => p.name);
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
      lastRentJourneyDay: this._lastRentJourneyDay,
      turnResolvedOnDay: this._turnResolvedOnDay,
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
    if (!data || typeof data !== 'object' || ![3, 4].includes(data.v)) return false;
    const num = (v, fallback) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
    const arr = (v) => (Array.isArray(v) ? v : []);

    this.sanity = clamp(num(data.sanity, START_SANITY), 0, MAX_STAT);
    this.money = clamp(num(data.money, START_MONEY), 0, MONEY_HARD_CEILING);
    this.energy = clamp(num(data.energy, START_ENERGY), 0, MAX_ENERGY);
    this.reputation = clamp(num(data.reputation, START_REPUTATION), 0, MAX_REPUTATION);
    this.insight = Math.max(num(data.insight, 0), 0);

    this.journeyDay = Math.max(num(data.journeyDay, 1), 1);
    this.dayOfMonth = clamp(num(data.dayOfMonth, 1), 1, 31);
    this.monthIndex = clamp(num(data.monthIndex, 0), 0, 11);
    this.year = num(data.year, 2026);
    this.gameOver = Boolean(data.gameOver);
    this.gameOverMessage = typeof data.gameOverMessage === 'string' ? data.gameOverMessage : '';
    this.won = Boolean(data.won);
    this.winMessage = typeof data.winMessage === 'string' ? data.winMessage : '';

    this.consecutiveBarDays = num(data.consecutiveBarDays, 0);
    this.lastLocationVisited = typeof data.lastLocationVisited === 'string' ? data.lastLocationVisited : '';
    this._lastRentJourneyDay = num(data.lastRentJourneyDay, -1);
    this._turnResolvedOnDay = num(data.turnResolvedOnDay, -1);
    this.rentPrepaidUntilDay = num(data.rentPrepaidUntilDay, 0);
    this.rentPaidCount = num(data.rentPaidCount, 0);
    this.recentHistory = arr(data.recentHistory).slice(0, 5);

    this.perks = new Set(arr(data.perks).filter((id) => getPerk(id)));
    this.achievements = new Set(arr(data.achievements));
    this.visitedLocations = new Set(arr(data.visitedLocations));
    this.nightDays = num(data.nightDays, 0);
    this.festivalsSeen = num(data.festivalsSeen, 0);
    this.weatherSeed = num(data.weatherSeed, 0);
    this.pendingAchievements = [];

    this._statsChanged();
    this.emit('day_changed', this.journeyDay, this.getWeekdayName(), this.getMonthName(), this.year, this.dayOfMonth);
    return true;
  }
}

// ------------------------------------------------------------- persistence

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
