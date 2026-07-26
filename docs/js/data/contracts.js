/**
 * Contracts — multi-day commitments.
 *
 * A contract is offered at a location, accepted from the hub, and asks for N
 * qualifying days inside a deadline. Meeting it pays; missing it costs
 * reputation. This is what gives a run something to aim at beyond "do not
 * die", and it is the main reason to plan a week rather than a day.
 *
 * Requirements are expressed as a location id or a tag, never as bespoke
 * logic, so `qualifies()` stays a two-line pure function.
 */

import { Tag } from './locations.js';

const c = (cfg) => Object.freeze({
  need: 3,
  days: 7,
  reward: {},
  penalty: { reputation: -6 },
  requireTag: null,
  requireLocation: null,
  minDay: 1,
  ...cfg,
});

export const CONTRACTS = [
  c({
    id: 'winter_fuel',
    name: 'Winter Fuel Fund',
    emoji: '🪵',
    offeredAt: 'spiritual_community',
    desc: 'The hall\u2019s boiler wants replacing before it gets properly cold. Raise the money the honest way.',
    requireTag: Tag.WORK,
    need: 4,
    days: 9,
    reward: { money: 22, reputation: 8 },
    penalty: { reputation: -8, sanity: -4 },
  }),
  c({
    id: 'barrets_books',
    name: 'Barret\u2019s Books',
    emoji: '📒',
    offeredAt: 'bar',
    desc: 'Barret has not reconciled a till since spring. Work enough shifts to dig him out of it.',
    requireLocation: 'bar',
    need: 4,
    days: 8,
    reward: { money: 18, reputation: 5, item: 'tip_jar' },
    penalty: { reputation: -5 },
  }),
  c({
    id: 'ninety_day_sit',
    name: 'The Ninety-Day Sit',
    emoji: '🕰️',
    offeredAt: 'spiritual_community',
    desc: 'Geo has proposed a formal practice period. You do not have ninety days. You have twelve.',
    requireTag: Tag.SPIRITUAL,
    need: 6,
    days: 12,
    minDay: 6,
    reward: { insight: 8, sanity: 12, reputation: 6 },
    penalty: { sanity: -8, reputation: -4 },
  }),
  c({
    id: 'market_season',
    name: 'Market Season',
    emoji: '🏷️',
    offeredAt: 'farmers_market',
    desc: 'Hold the stall through the busy weeks and the pitch is yours next year.',
    requireTag: Tag.MARKET,
    need: 4,
    days: 10,
    minDay: 4,
    reward: { money: 24, reputation: 6 },
    penalty: { money: -6, reputation: -5 },
  }),
  c({
    id: 'clinic_rota',
    name: 'The Clinic Rota',
    emoji: '🧾',
    offeredAt: 'free_clinic',
    desc: 'They are three volunteers short. Put your name down for a proper stretch of it.',
    requireTag: Tag.VOLUNTEER,
    need: 4,
    days: 11,
    minDay: 8,
    reward: { reputation: 16, sanity: 6, item: 'herbal_tonic' },
    penalty: { reputation: -10 },
  }),
  c({
    id: 'the_pilgrimage',
    name: 'The Pilgrimage',
    emoji: '🧭',
    offeredAt: 'temple_ruins',
    desc: 'Walk out to the ruins three times in a fortnight and Geo will vouch for you at the retreat.',
    requireTag: Tag.PILGRIMAGE,
    need: 3,
    days: 14,
    minDay: 12,
    reward: { insight: 10, reputation: 12, item: 'good_boots' },
    penalty: { sanity: -6 },
  }),
  c({
    id: 'quiet_month',
    name: 'A Quiet Month',
    emoji: '🤫',
    offeredAt: 'public_library',
    desc: 'You promised yourself you would stop filling every hour. Prove it.',
    requireTag: Tag.QUIET,
    need: 5,
    days: 10,
    minDay: 5,
    reward: { insight: 7, sanity: 10 },
    penalty: { sanity: -5 },
  }),
  c({
    id: 'the_broadcast',
    name: 'Six Weeks on Air',
    emoji: '🎚️',
    offeredAt: 'radio_station',
    desc: 'The station will give you a permanent slot if you can actually turn up for it.',
    requireLocation: 'radio_station',
    need: 3,
    days: 12,
    minDay: 7,
    reward: { reputation: 18, money: 10, insight: 3 },
    penalty: { reputation: -9 },
  }),
];

const BY_ID = new Map(CONTRACTS.map((x) => [x.id, x]));

export function getContract(id) {
  return BY_ID.get(id) ?? null;
}

export function contractsOfferedAt(locationId, journeyDay = 1) {
  return CONTRACTS.filter((x) => x.offeredAt === locationId && journeyDay >= x.minDay);
}

/** Does a day spent at `location` count toward `contract`? */
export function qualifies(contract, location) {
  if (!contract || !location) return false;
  if (contract.requireLocation) return location.id === contract.requireLocation;
  if (contract.requireTag) return location.tags.includes(contract.requireTag);
  return false;
}

/**
 * Create the mutable progress record stored on GameState.
 * @returns {{id:string, progress:number, need:number, expiresOn:number}}
 */
export function startContract(contract, journeyDay) {
  return {
    id: contract.id,
    progress: 0,
    need: contract.need,
    expiresOn: journeyDay + contract.days,
  };
}
