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
 *
 * ## Fringe months
 *
 * Some weather belongs *around* its season, not only inside it. Snow stops
 * being believable the day spring starts on the calendar — but early March
 * still snows, and November already can. A type may therefore list
 * `fringeMonths` (0-based month indexes, so 10 = November, 2 = March): on
 * those months it joins the pool even when its season does not match, at
 * `fringeWeightFactor` of its normal weight. The pool weight is halved, not
 * the effect — a November snowfall is every bit as cold as a January one,
 * just rarer.
 *
 * Season-only calls (no month index given) behave exactly as before the
 * fringe existed; the month only widens the pool, it never narrows it.
 */

import { Tag } from './locations.js';

const w = (cfg) =>
  Object.freeze({
    closes: [],
    tagEffects: {},
    weight: 10,
    seasons: null, // null = any
    fringeMonths: [], // 0-based month indexes where the type may bleed over
    fringeWeightFactor: 0.5, // share of the normal weight during fringe months
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
    fringeMonths: [10, 2], // November snows early, March snows late
    fringeWeightFactor: 0.5,
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
    fringeMonths: [2], // the late frost of early March
    fringeWeightFactor: 0.5,
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

/**
 * Types legal in a given season, with fringe months widening the pool.
 *
 * Fringe entries are returned as shallow copies carrying their reduced
 * weight, so the frozen catalogue is never mutated and callers can treat
 * every entry the same.
 *
 * @param {string} season
 * @param {number|null} [monthIndex] 0-based month (0 = January); omit to get
 *   the strict pre-fringe pool for the season alone
 */
export function eligibleWeather(season, monthIndex = null) {
  const inSeason = (t) => t.seasons === null || t.seasons.includes(season);
  const inFringe = (t) => monthIndex !== null && t.fringeMonths.includes(monthIndex);
  return WEATHER_TYPES.filter((t) => inSeason(t) || inFringe(t)).map((t) =>
    !inSeason(t) && inFringe(t) ? { ...t, weight: t.weight * t.fringeWeightFactor } : t,
  );
}

/**
 * The weather for a specific journey day. Pure — same inputs, same answer.
 *
 * The roll itself is hashed from (day, seed, season) only; a fringe month
 * widens the pool the roll lands on but does not reshuffle the sequence, so
 * giving the month for a mid-season day reproduces the pre-fringe weather.
 *
 * @param {number} day journey day (1-based)
 * @param {number} seed per-run seed
 * @param {string} season 'Winter' | 'Spring' | 'Summer' | 'Autumn'
 * @param {number|null} [monthIndex] 0-based month, for fringe-month weather
 */
export function weatherForDay(day, seed = 0, season = 'Winter', monthIndex = null) {
  const pool = eligibleWeather(season, monthIndex);
  const total = pool.reduce((sum, t) => sum + t.weight, 0);
  let roll = ((hash(`w:${seed}:${day}:${season}`) % 100000) / 100000) * total;
  for (const t of pool) {
    roll -= t.weight;
    if (roll <= 0) return t;
  }
  return pool[pool.length - 1];
}

/**
 * Outlook used by the almanac panel. `season` may be a single season string
 * (every day in the window shares it) or an array with one entry per day —
 * the almanac passes per-day `{ season, monthIndex }` objects so a forecast
 * that crosses a season boundary (e.g. late February into March) is honest
 * about each day's own season, including fringe-month snow. Plain season
 * strings in the array are still accepted.
 */
export function forecast(fromDay, seed, season, count = 3) {
  return Array.from({ length: count }, (_, i) => {
    const entry = Array.isArray(season) ? season[i] : season;
    const daySeason = typeof entry === 'object' && entry !== null ? entry.season : entry;
    const monthIndex =
      typeof entry === 'object' && entry !== null ? (entry.monthIndex ?? null) : null;
    return { day: fromDay + i, weather: weatherForDay(fromDay + i, seed, daySeason, monthIndex) };
  });
}

/** Tags a weather type closes down for the day. */
export function closedTags(weather) {
  return weather ? [...weather.closes] : [];
}
