/**
 * EventManager.
 *
 * Scheduling model: after a reset the first event is scheduled
 * 1-3 journey-days ahead; after each event the next is scheduled another 1-3
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
import { createRng } from './rng.js';

export const MIN_EVENT_GAP_DAYS = 1;
export const MAX_EVENT_GAP_DAYS = 3;

/** Catalogue-discovery weights. A faster cadence shows more days, and these
 * multipliers make sure those slots widen the cast rather than repeating the
 * same familiar faces. */
export const RUN_UNSEEN_EVENT_WEIGHT = 2.2;
export const EVER_UNSEEN_EVENT_WEIGHT = 1.6;

/** Consecutive bar days required before the burnout event unlocks. */
export const BURNOUT_THRESHOLD = 3;

/** How many recent event ids to avoid repeating. */
export const RECENT_MEMORY = 4;

export class EventManager {
  constructor(rng = createRng()) {
    this.rng = rng;
    this._allEvents = [];
    this._previousEventId = null;
    this._recentIds = [];
    this._seenIds = new Set();
    this._globalSeenIds = new Set();
    this._consecutiveBarDays = 0;
    this._nextEventDay = 1;
    this._characterNames = [];
  }

  initialize(characterNames) {
    this._characterNames = [...characterNames];
    this._allEvents = buildEventPool();
    this._recentIds = [];
    this._seenIds = new Set();
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

    // Character frequency filter: if a character fired recently,
    // gently deprioritize their other events (not block).
    const recentChars = new Set(
      this._recentIds
        .map((id) => {
          const ev = this._allEvents.find((e) => e.id === id);
          return ev ? ev.character : null;
        })
        .filter(Boolean),
    );

    const weightedPool = pool.map((e) => {
      let weight = e.weight;
      if (recentChars.has(e.character)) weight *= 0.7;
      if (!this._seenIds.has(e.id)) weight *= RUN_UNSEEN_EVENT_WEIGHT;
      if (!this._globalSeenIds.has(e.id)) weight *= EVER_UNSEEN_EVENT_WEIGHT;
      return { ...e, weight };
    });

    const selected = this._weightedSelect(weightedPool);
    this._remember(selected.id);
    this._seenIds.add(selected.id);
    this._globalSeenIds.add(selected.id);
    this._scheduleNextEvent(journeyDay);

    // Copy before any substitution so the shared pool stays clean.
    const result = { ...selected };
    if (result.category === Category.FRIEND && this._characterNames.length > 0) {
      const friend = this.rng.pick(this._characterNames);
      result.description = result.description.replace('{friend}', friend);
    }
    return result;
  }

  /** JSON-safe scheduler snapshot. Custom test RNGs remain supported; when a
   * RNG exposes state (the production RNG does), future picks resume exactly. */
  toJSON() {
    return {
      nextEventDay: this._nextEventDay,
      recentIds: [...this._recentIds],
      previousEventId: this._previousEventId,
      seenIds: [...this._seenIds],
      rngState: typeof this.rng.getState === 'function' ? this.rng.getState() : null,
    };
  }

  /** Restore scheduler state after initialize() has rebuilt the event pool. */
  loadFrom(data) {
    if (!data || typeof data !== 'object') return false;
    const validIds = new Set(this._allEvents.map((event) => event.id));
    if (Number.isFinite(data.nextEventDay) && data.nextEventDay >= 1) {
      this._nextEventDay = Math.floor(data.nextEventDay);
    }
    this._recentIds = Array.isArray(data.recentIds)
      ? data.recentIds.filter((id) => validIds.has(id)).slice(-RECENT_MEMORY)
      : [];
    this._previousEventId = validIds.has(data.previousEventId) ? data.previousEventId : null;
    this._seenIds = Array.isArray(data.seenIds)
      ? new Set(data.seenIds.filter((id) => validIds.has(id)))
      : this._seenIds;
    if (typeof this.rng.setState === 'function' && Number.isFinite(data.rngState)) {
      this.rng.setState(data.rngState);
    }
    return true;
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
      if ((e.minAffinity ?? 0) > 0) {
        const affinity = context.affinity ?? {};
        const count = affinity[e.character] ?? 0;
        if (count < e.minAffinity) return false;
      }
      if ((e.minReputation ?? 0) > (context.reputation ?? 0)) return false;
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

  setGlobalSeenIds(ids = []) {
    const validIds = new Set(this._allEvents.map((event) => event.id));
    this._globalSeenIds = new Set([...ids].filter((id) => validIds.has(id)));
  }

  seenEventIds() {
    return [...new Set([...this._globalSeenIds, ...this._seenIds])];
  }

  reset() {
    this._previousEventId = null;
    this._recentIds = [];
    this._seenIds = new Set();
    this._consecutiveBarDays = 0;
    this._nextEventDay = 1;
    this._scheduleNextEvent(0);
  }
}
