/**
 * Festivals — fixed points in the calendar.
 *
 * Unlike events, festivals are not rolled: they happen on a specific
 * month/day, every year, whether the player is ready or not. They colour the
 * hub, modify the day's takings, and a couple of them move money around
 * whether you show up or not.
 */

const f = (cfg) => Object.freeze({
  effects: {},
  tagEffects: {},
  waivesRent: false,
  ...cfg,
});

/** monthIndex is 0-based, matching GameState.monthIndex. */
export const FESTIVALS = [
  f({
    id: 'new_year_vigil',
    name: 'New Year Vigil',
    emoji: '🕯️',
    monthIndex: 0,
    dayOfMonth: 1,
    line: 'The hall keeps a candle lit from midnight to midnight. Nobody has to speak.',
    effects: { sanity: 6, insight: 2 },
  }),
  f({
    id: 'lantern_night',
    name: 'Lantern Night',
    emoji: '🏮',
    monthIndex: 1,
    dayOfMonth: 14,
    line: 'Paper lanterns down the whole length of the towpath. The market runs till two.',
    tagEffects: { market: { money: 6 }, outdoor: { sanity: 4 } },
  }),
  f({
    id: 'thaw_walk',
    name: 'The Thaw Walk',
    emoji: '🥾',
    monthIndex: 2,
    dayOfMonth: 20,
    line: 'The community walks the river out and back. It has happened every year since before Léon.',
    effects: { sanity: 5, energy: -8, reputation: 3 },
  }),
  f({
    id: 'founders_day',
    name: 'Founders\u2019 Day',
    emoji: '🎗️',
    monthIndex: 4,
    dayOfMonth: 2,
    line: 'The anniversary of the hall\u2019s first sit. Old members come back and leave money in the bowl.',
    effects: { money: 12, reputation: 6, sanity: 4 },
  }),
  f({
    id: 'midsummer',
    name: 'Midsummer',
    emoji: '🌞',
    monthIndex: 5,
    dayOfMonth: 21,
    line: 'The light goes on and on. Everybody is outside and nobody is going home.',
    tagEffects: { outdoor: { sanity: 6 }, night: { money: 5 } },
  }),
  f({
    id: 'rent_amnesty',
    name: 'Rent Amnesty Day',
    emoji: '🕊️',
    monthIndex: 7,
    dayOfMonth: 8,
    line: 'A dead statute the tenants\u2019 union revived. Kaden is furious and legally powerless.',
    waivesRent: true,
    effects: { sanity: 5 },
  }),
  f({
    id: 'harvest_supper',
    name: 'Harvest Supper',
    emoji: '🍎',
    monthIndex: 8,
    dayOfMonth: 29,
    line: 'Everything the garden produced, cooked at once, eaten at one long table.',
    effects: { sanity: 8, money: 4, reputation: 4 },
  }),
  f({
    id: 'day_of_the_dead_bench',
    name: 'Bench Day',
    emoji: '🪑',
    monthIndex: 10,
    dayOfMonth: 2,
    line: 'The memorial garden opens all night and the community reads every plaque aloud.',
    effects: { sanity: 3, insight: 4 },
  }),
  f({
    id: 'longest_night',
    name: 'The Longest Night',
    emoji: '🌑',
    monthIndex: 11,
    dayOfMonth: 21,
    line: 'Sixteen hours of dark. The bar is full and the hall is fuller.',
    tagEffects: { night: { money: 7 }, spiritual: { sanity: 7 } },
  }),
];

const BY_DATE = new Map(FESTIVALS.map((x) => [`${x.monthIndex}:${x.dayOfMonth}`, x]));

export function getFestival(id) {
  return FESTIVALS.find((x) => x.id === id) ?? null;
}

/** The festival on a given calendar date, if any. */
export function festivalOn(monthIndex, dayOfMonth) {
  return BY_DATE.get(`${monthIndex}:${dayOfMonth}`) ?? null;
}

/** Festivals still to come this calendar year, soonest first. */
export function upcomingFestivals(monthIndex, dayOfMonth, count = 2) {
  const after = FESTIVALS
    .filter((x) => x.monthIndex > monthIndex
      || (x.monthIndex === monthIndex && x.dayOfMonth > dayOfMonth));
  const wrapped = [...after, ...FESTIVALS];
  return wrapped.slice(0, count);
}
