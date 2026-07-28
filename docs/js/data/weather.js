/**
 * Weather.
 *
 * Weather is *derived*, not stored: `weatherForDay(day, seed, season)` is a
 * pure function of the journey day, the run seed and the season, so the whole
 * forecast is reproducible and can be read ahead of time by the almanac
 * without needing to roll anything.
 *
 * Each type carries flat modifiers keyed by location tag, plus an optional
 * list of tags it closes outright (a storm shuts the outdoor places).
 */

import { Tag } from './locations.js';

const w = (cfg) =>
  Object.freeze({
    closes: [],
    tagEffects: {},
    weight: 10,
    seasons: null, // null = any
    ...cfg,
  });

export const WEATHER_TYPES = [
  w({
    id: 'clear',
    name: 'Clear',
    emoji: '☀️',
    line: 'A clean, high sky. The kind of day that makes the walk worth it.',
    weight: 22,
    tagEffects: { [Tag.OUTDOOR]: { sanity: 3 }, [Tag.MARKET]: { money: 2 } },
  }),
  w({
    id: 'overcast',
    name: 'Overcast',
    emoji: '☁️',
    line: 'Flat grey light and no wind. Nothing in the sky is deciding anything.',
    weight: 20,
    tagEffects: {},
  }),
  w({
    id: 'rain',
    name: 'Rain',
    emoji: '🌧️',
    line: 'Steady rain since before dawn. The gutters are singing.',
    weight: 18,
    tagEffects: {
      [Tag.OUTDOOR]: { sanity: -3, energy: -4 },
      [Tag.MARKET]: { money: -3 },
      [Tag.QUIET]: { sanity: 2 },
      [Tag.INDOOR]: { sanity: 1 },
    },
  }),
  w({
    id: 'storm',
    name: 'Storm',
    emoji: '⛈️',
    line: 'Wind coming off the water hard enough to move the bins. Everything outdoors is shut.',
    weight: 7,
    closes: [Tag.OUTDOOR],
    tagEffects: { [Tag.INDOOR]: { sanity: 2 }, [Tag.NIGHT]: { money: -3 } },
  }),
  w({
    id: 'fog',
    name: 'Fog',
    emoji: '🌫️',
    line: 'The river fog came up the streets overnight and never left.',
    weight: 11,
    tagEffects: {
      [Tag.QUIET]: { insight: 1, sanity: 2 },
      [Tag.SOCIAL]: { money: -2 },
      [Tag.PILGRIMAGE]: { insight: 1 },
    },
  }),
  w({
    id: 'snow',
    name: 'Snow',
    emoji: '❄️',
    line: 'Snow settling on the parked cars. The whole district has gone quiet and careful.',
    weight: 12,
    seasons: ['Winter'],
    closes: [Tag.PILGRIMAGE],
    tagEffects: {
      [Tag.OUTDOOR]: { energy: -6, sanity: 1 },
      [Tag.REST]: { sanity: 3 },
      [Tag.WORK]: { money: -2 },
    },
  }),
  w({
    id: 'heatwave',
    name: 'Heatwave',
    emoji: '🔥',
    line: 'Thirty-four degrees by ten in the morning and no shade worth the name.',
    weight: 12,
    seasons: ['Summer'],
    tagEffects: {
      [Tag.OUTDOOR]: { energy: -8 },
      [Tag.WORK]: { sanity: -2 },
      [Tag.NIGHT]: { money: 3 },
      [Tag.REST]: { energy: -4 },
    },
  }),
  w({
    id: 'first_frost',
    name: 'Hard Frost',
    emoji: '🧊',
    line: 'Everything metal is white and the pipes have opinions about it.',
    weight: 8,
    seasons: ['Autumn', 'Winter'],
    tagEffects: { [Tag.OUTDOOR]: { energy: -5 }, [Tag.INDOOR]: { sanity: 2 } },
  }),
  w({
    id: 'blossom',
    name: 'Blossom Wind',
    emoji: '🌸',
    line: 'The limes along the towpath let go all at once. It is briefly ridiculous outside.',
    weight: 9,
    seasons: ['Spring'],
    tagEffects: {
      [Tag.OUTDOOR]: { sanity: 5, insight: 1 },
      [Tag.SPIRITUAL]: { sanity: 2 },
    },
  }),
];

const BY_ID = new Map(WEATHER_TYPES.map((t) => [t.id, t]));

export function getWeather(id) {
  return BY_ID.get(id) ?? null;
}

/** FNV-1a over a string — same helper the avatar generator uses. */
function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Types legal in a given season. */
export function eligibleWeather(season) {
  return WEATHER_TYPES.filter((t) => t.seasons === null || t.seasons.includes(season));
}

/**
 * The weather for a specific journey day. Pure — same inputs, same answer.
 *
 * @param {number} day journey day (1-based)
 * @param {number} seed per-run seed
 * @param {string} season 'Winter' | 'Spring' | 'Summer' | 'Autumn'
 */
export function weatherForDay(day, seed = 0, season = 'Winter') {
  const pool = eligibleWeather(season);
  const total = pool.reduce((sum, t) => sum + t.weight, 0);
  let roll = ((hash(`w:${seed}:${day}:${season}`) % 100000) / 100000) * total;
  for (const t of pool) {
    roll -= t.weight;
    if (roll <= 0) return t;
  }
  return pool[pool.length - 1];
}

/** Three-day outlook used by the almanac panel. */
export function forecast(fromDay, seed, season, count = 3) {
  return Array.from({ length: count }, (_, i) => ({
    day: fromDay + i,
    weather: weatherForDay(fromDay + i, seed, season),
  }));
}

/** Tags a weather type closes down for the day. */
export function closedTags(weather) {
  return weather ? [...weather.closes] : [];
}
