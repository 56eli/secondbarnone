/**
 * GameState — ported 1:1 from scripts/game_state.gd.
 *
 * Holds stats, the in-game Gregorian calendar, history and the character
 * database. Godot signals become a tiny event emitter so the UI layer can
 * subscribe the same way it did with `stats_changed.connect(...)`.
 */

import { createAllProfiles } from '../data/characters.js';

export const MAX_STAT = 100.0;
export const START_SANITY = 50.0;
export const START_MONEY = 50.0;

export const SANITY_GAIN = 15.0;
export const SANITY_LOSS = 12.0;
export const MONEY_GAIN = 12.0;
export const MONEY_LOSS = 10.0;

/** Offset so journey day 1 maps to Thursday (Jan 1, 2026). Mon=0 … Sun=6. */
export const START_WEEKDAY_OFFSET = 3;

/** Rent deducted every Sunday. */
export const RENT_AMOUNT = 18.0;

export const WEEKDAY_NAMES = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
];

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

export class GameState {
  constructor() {
    this._listeners = new Map();
    this.characterProfiles = createAllProfiles();
    this._initStats();
  }

  _initStats() {
    this.sanity = START_SANITY;
    this.money = START_MONEY;
    this.journeyDay = 1;
    this.dayOfMonth = 1;
    this.monthIndex = 0;
    this.year = 2026;
    this.gameOver = false;
    this.consecutiveBarDays = 0;
    this.lastLocationVisited = '';
    this._lastRentDayOfMonth = -1;
    this.recentHistory = [];
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

  // ---------------- lifecycle ----------------

  resetGame() {
    this._initStats();
    this.emit('stats_changed', this.sanity, this.money);
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
    this.emit('day_changed', this.journeyDay, this.getWeekdayName(), this.getMonthName(), this.year, this.dayOfMonth);
    this.emit('stats_changed', this.sanity, this.money);
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

  // ---------------- stat mutation ----------------

  /** Charge rent once per Sunday. Returns true if charged this call. */
  applyRentIfSunday() {
    if (this.getWeekdayIndex() !== 6) return false;
    if (this._lastRentDayOfMonth === this.dayOfMonth) return false;
    this._lastRentDayOfMonth = this.dayOfMonth;
    this.money = Math.max(this.money - RENT_AMOUNT, 0);
    this.emit('stats_changed', this.sanity, this.money);
    return true;
  }

  applyLocationAction(location) {
    if (location === 'spiritual_community') {
      this.sanity = Math.min(this.sanity + SANITY_GAIN, MAX_STAT);
      this.money = Math.max(this.money - MONEY_LOSS, 0);
      this.consecutiveBarDays = 0;
    } else if (location === 'bar') {
      this.money = Math.min(this.money + MONEY_GAIN, MAX_STAT);
      this.sanity = Math.max(this.sanity - SANITY_LOSS, 0);
      this.consecutiveBarDays += 1;
    }
    this.lastLocationVisited = location;
    this.emit('stats_changed', this.sanity, this.money);
  }

  applyEventDeltas(sanityDelta, moneyDelta) {
    this.sanity = clamp(this.sanity + sanityDelta, 0, MAX_STAT);
    this.money = clamp(this.money + moneyDelta, 0, MAX_STAT);
    this.emit('stats_changed', this.sanity, this.money);
  }

  checkGameOver() {
    if (this.gameOver) return true;
    if (this.sanity <= 0) {
      this.gameOver = true;
      this.emit('game_over_triggered', 'Your sanity has crumbled. The spiritual path was neglected too long.');
      return true;
    }
    if (this.money <= 0) {
      this.gameOver = true;
      this.emit('game_over_triggered', 'You\u2019re broke. The bills pile up and you can\u2019t sustain the community.');
      return true;
    }
    return false;
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

  getMood() {
    const s = this.sanity;
    const m = this.money;
    if (s < 25 && m < 25) return 'Everything feels precarious. The walls are closing in.';
    if (s < 25) return 'Your spirit is fraying. You need to return to the community.';
    if (m < 25) return 'The bills are piling up. Financial pressure weighs heavily.';
    if (s > 80 && m > 80) return 'Life feels balanced and full of possibility.';
    if (s > 80) return 'Your spirit soars. The community work is deeply fulfilling.';
    if (m > 80) return 'Financially comfortable, but the soul needs tending too.';
    return 'You are managing. Not thriving, but surviving.';
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
}
