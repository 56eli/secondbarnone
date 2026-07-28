/**
 * Achievements.
 *
 * Each is a pure predicate over a state snapshot, evaluated once per turn.
 * Keeping them predicates (rather than things the turn code has to remember to
 * fire) means adding one is a data change and every one of them is trivially
 * testable.
 */

import { ENDURANCE_GOAL_DAYS } from '../core/balance.js';

const a = (id, name, emoji, desc, test) => Object.freeze({ id, name, emoji, desc, test });

export const ACHIEVEMENTS = [
  a('first_week', 'One Week Down', '📆', 'Survive seven journey days.', (s) => s.journeyDay >= 7),
  a(
    'first_month',
    'A Whole Month',
    '🗓️',
    'Survive thirty journey days.',
    (s) => s.journeyDay >= 30,
  ),
  a(
    'wanderer',
    'Wanderer',
    '🧭',
    'Spend a day in eight different locations.',
    (s) => s.visitedLocations.size >= 8,
  ),
  a(
    'cartographer',
    'Cartographer',
    '🗺️',
    'Spend a day in every location in the city.',
    (s) => s.visitedLocations.size >= s.totalLocations,
  ),
  a(
    'flush',
    'Flush',
    '💵',
    'Hold 90 money at once — the wallet has no ceiling, but ninety still feels like something.',
    (s) => s.money >= 90,
  ),
  a(
    'war_chest',
    'War Chest',
    '🏦',
    'Stack 150 money. Proof the tips kept coming.',
    (s) => s.money >= 150,
  ),
  a('serene', 'Serene', '🪷', 'Reach 90% sanity.', (s) => s.sanity >= 90),
  a(
    'in_balance',
    'In Balance',
    '⚖️',
    'Hold sanity above 70 and money above 70 at once.',
    (s) => s.sanity > 70 && s.money > 70,
  ),
  a(
    'endurance',
    'The Long Hold',
    '🏅',
    `Hold the community for ${ENDURANCE_GOAL_DAYS} journey days — the endurance goal.`,
    (s) => s.journeyDay >= ENDURANCE_GOAL_DAYS,
  ),
  a('well_known', 'Well Known', '📣', 'Reach 60 reputation.', (s) => s.reputation >= 60),
  a(
    'pillar',
    'Pillar of the Neighbourhood',
    '🏛️',
    'Reach 90 reputation.',
    (s) => s.reputation >= 90,
  ),
  a('student', 'Student of the Thing', '🎓', 'Learn three perks.', (s) => s.perks.size >= 3),
  a('adept', 'Adept', '🌟', 'Learn six perks.', (s) => s.perks.size >= 6),
  a(
    'neighbour',
    'A Familiar Face',
    '🏡',
    'Reach 30 reputation in the neighbourhood.',
    (s) => s.reputation >= 30,
  ),
  a('pilgrim', 'Pilgrim', '⛰️', 'Reach the mountain retreat.', (s) =>
    s.visitedLocations.has('mountain_retreat'),
  ),
  a(
    'weathered',
    'Weathered',
    '⛈️',
    'Work through a storm.',
    (s) => s.weatherId === 'storm' && s.locationTags.includes('work'),
  ),
  a(
    'night_shift',
    'Night Shift',
    '🌙',
    'Spend five days in night locations.',
    (s) => s.nightDays >= 5,
  ),
  a(
    'almost_broke',
    'Down to the Wire',
    '🪫',
    'Survive a turn ending below 8 in either stat.',
    (s) => (s.sanity > 0 && s.sanity < 8) || (s.money > 0 && s.money < 8),
  ),
  a('rent_master', 'Never Late', '🧾', 'Pay rent six times.', (s) => s.rentPaidCount >= 6),
  a(
    'festival_goer',
    'Festival Goer',
    '🎊',
    'Be out in the city on three festival days.',
    (s) => s.festivalsSeen >= 3,
  ),
];

const BY_ID = new Map(ACHIEVEMENTS.map((x) => [x.id, x]));

export function getAchievement(id) {
  return BY_ID.get(id) ?? null;
}

/**
 * Which achievements does this snapshot newly satisfy?
 * @param {object} snap
 * @param {Set<string>} already
 * @returns {object[]} newly-earned definitions, in declaration order
 */
export function evaluateAchievements(snap, already) {
  const earned = already instanceof Set ? already : new Set(already ?? []);
  return ACHIEVEMENTS.filter((x) => !earned.has(x.id) && Boolean(x.test(snap)));
}
