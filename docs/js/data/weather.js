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

/** Month lengths, for projecting the calendar forward inside a forecast. */
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const isLeapYear = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/** The season a given month index falls in. Mirrors `GameState.getSeason()`. */
export function seasonForMonth(monthIndex) {
  if (monthIndex === 11 || monthIndex === 0 || monthIndex === 1) return 'Winter';
  if (monthIndex >= 2 && monthIndex <= 4) return 'Spring';
  if (monthIndex >= 5 && monthIndex <= 7) return 'Summer';
  return 'Autumn';
}

/**
 * The multi-day outlook the almanac panel shows.
 *
 * ## Why this takes a calendar date
 *
 * `weatherForDay()` hashes the **season** along with the day, and the season
 * is a property of the calendar date, not of the journey day. The old
 * signature took a single `season` and applied today's to all four cells, so
 * every forecast that spanned 1 March, 1 June, 1 September or 1 December
 * predicted the wrong weather for the days on the far side of the boundary.
 *
 * That was 1.45% of all forecast cells — small in aggregate, and it landed
 * squarely on the day that matters most: **journey day 60, the endurance
 * goal, falls on 1 March 2026** in a default run, so the forecast lied on the
 * run's most important morning. It also broke the game's own stated contract
 * that "weather is written down four days in advance".
 *
 * Passing the date lets the projection roll the calendar forward per cell and
 * derive each day's season honestly. The legacy `(fromDay, seed, season,
 * count)` shape is still accepted so old callers and tests keep working; it
 * simply cannot be correct across a boundary, which is why every caller in
 * the game now passes a date.
 *
 * @param {number} fromDay journey day of the first cell
 * @param {number} seed run seed
 * @param {string|{monthIndex:number, dayOfMonth:number, year:number}} seasonOrDate
 * @param {number} [count]
 */
export function forecast(fromDay, seed, seasonOrDate, count = 3) {
  // Legacy call: a bare season string. Correct except across a boundary.
  if (typeof seasonOrDate === 'string' || !seasonOrDate) {
    const season = seasonOrDate || 'Winter';
    return Array.from({ length: count }, (_, i) => ({
      day: fromDay + i,
      season,
      weather: weatherForDay(fromDay + i, seed, /** @type {string} */ (season)),
    }));
  }

  let { monthIndex, dayOfMonth, year } =
    /** @type {{monthIndex:number, dayOfMonth:number, year:number}} */ (seasonOrDate);
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const season = seasonForMonth(monthIndex);
    out.push({ day: fromDay + i, season, weather: weatherForDay(fromDay + i, seed, season) });
    // Roll one calendar day forward, exactly as GameState does.
    dayOfMonth += 1;
    let maxDay = DAYS_IN_MONTH[monthIndex];
    if (monthIndex === 1 && isLeapYear(year)) maxDay = 29;
    if (dayOfMonth > maxDay) {
      dayOfMonth = 1;
      monthIndex += 1;
      if (monthIndex >= 12) {
        monthIndex = 0;
        year += 1;
      }
    }
  }
  return out;
}

/** Tags a weather type closes down for the day. */
export function closedTags(weather) {
  return weather ? [...weather.closes] : [];
}
