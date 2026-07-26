/**
 * EventManager.
 *
 * Scheduling model (unchanged): after a reset the first event is scheduled
 * 2-5 journey-days ahead; after each event the next is scheduled another 2-5
 * days ahead. No probability roll happens once the scheduled day is reached.
 *
 * Gating has grown with the world. An event may require a location id (as
 * before), a location *tag*, or a specific weather id — so one definition can
 * cover "anywhere quiet" or "only in a storm" without a combinatorial pool.
 *
 * Fixed vs. the GDScript original: friend-event `{friend}` substitution used to
 * write back into the shared event object, permanently baking one character's
 * name into the pool for the rest of the session. We return a shallow copy.
 */

import { buildEventPool, Category } from '../data/events.js';
import { defaultRng } from './rng.js';

export const MIN_EVENT_GAP_DAYS = 2;
export const MAX_EVENT_GAP_DAYS = 5;

/** Consecutive bar days required before the burnout event unlocks. */
export const BURNOUT_THRESHOLD = 3;

/** How many recent event ids to avoid repeating. */
export const RECENT_MEMORY = 4;

export class EventManager {
  constructor(rng = defaultRng) {
    this.rng = rng;
    this._allEvents = [];
    this._previousEventId = null;
    this._recentIds = [];
    this._consecutiveBarDays = 0;
    this._nextEventDay = 1;
    this._characterNames = [];
  }

  initialize(characterNames) {
    this._characterNames = [...characterNames];
    this._allEvents = buildEventPool();
    this._recentIds = [];
    this._scheduleNextEvent(1);
  }

  /**
   * Return an event if the scheduled day has arrived, else null.
   *
   * @param {number} journeyDay
   * @param {number} weekday 0=Mon … 6=Sun
   * @param {string} currentLocation location id
   * @param {number} consecutiveBar
   * @param {{tags?:string[], weatherId?:string}} [context]
   * @returns {object|null} a copy of the chosen event, safe to mutate.
   */
  selectEvent(journeyDay, weekday, currentLocation, consecutiveBar, context = {}) {
    this._consecutiveBarDays = consecutiveBar;

    if (journeyDay < this._nextEventDay) return null;

    let pool = this._buildPool(journeyDay, weekday, currentLocation, context);
    if (pool.length === 0) {
      this._scheduleNextEvent(journeyDay);
      return null;
    }

    // Avoid repeating anything from recent memory, but never empty the pool.
    if (pool.length > 1) {
      const filtered = pool.filter((e) => !this._recentIds.includes(e.id));
      if (filtered.length > 0) pool = filtered;
    }

    const selected = this._weightedSelect(pool);
    this._remember(selected.id);
    this._scheduleNextEvent(journeyDay);

    // Copy before any substitution so the shared pool stays clean.
    const result = { ...selected };
    if (result.category === Category.FRIEND && this._characterNames.length > 0) {
      const friend = this.rng.pick(this._characterNames);
      result.description = result.description.replace('{friend}', friend);
    }
    return result;
  }

  _remember(id) {
    this._previousEventId = id;
    this._recentIds.push(id);
    if (this._recentIds.length > RECENT_MEMORY) this._recentIds.shift();
  }

  _scheduleNextEvent(fromDay) {
    this._nextEventDay = fromDay + this.rng.randInt(MIN_EVENT_GAP_DAYS, MAX_EVENT_GAP_DAYS);
  }

  _buildPool(journeyDay, weekday, location, context = {}) {
    const tags = context.tags ?? [];
    const weatherId = context.weatherId ?? '';
    return this._allEvents.filter((e) => {
      if (e.minimumDay > journeyDay) return false;
      if (e.allowedWeekdays.length > 0 && !e.allowedWeekdays.includes(weekday)) return false;
      if (e.requiredLocation !== '' && e.requiredLocation !== location) return false;
      if (e.requiredTag && !tags.includes(e.requiredTag)) return false;
      if (e.requiredWeather && e.requiredWeather !== weatherId) return false;
      if (e.id === 'burnout' && this._consecutiveBarDays < BURNOUT_THRESHOLD) return false;
      if (e.category === Category.FRIEND && this._characterNames.length === 0) return false;
      return true;
    });
  }

  _weightedSelect(pool) {
    const total = pool.reduce((sum, e) => sum + e.weight, 0);
    const roll = this.rng.random() * total;
    let cumulative = 0;
    for (const e of pool) {
      cumulative += e.weight;
      if (roll <= cumulative) return e;
    }
    return pool[pool.length - 1];
  }

  reset() {
    this._previousEventId = null;
    this._recentIds = [];
    this._consecutiveBarDays = 0;
    this._nextEventDay = 1;
    this._scheduleNextEvent(0);
  }
}
