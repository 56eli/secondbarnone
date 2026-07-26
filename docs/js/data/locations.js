/**
 * Location catalogue.
 *
 * The original game had exactly two places to spend a day. This module turns
 * that into a data-driven network of twenty-two locations spread over five
 * districts, each with its own effects, tags, unlock rule and flavour.
 *
 * The two original locations keep their exact numbers (+15/−10 and +12/−12) so
 * that the balance of an early run is unchanged.
 *
 * Nothing here touches the DOM — locations are pure data plus a couple of
 * predicate helpers, so the whole catalogue is testable headlessly.
 */

/** Tag vocabulary. Weather, perks, items and events all key off these. */
export const Tag = Object.freeze({
  SPIRITUAL: 'spiritual',
  WORK: 'work',
  COMMUNITY: 'community',
  OUTDOOR: 'outdoor',
  INDOOR: 'indoor',
  NIGHT: 'night',
  QUIET: 'quiet',
  SOCIAL: 'social',
  RIVAL: 'rival',
  REST: 'rest',
  MARKET: 'market',
  ADMIN: 'admin',
  STUDY: 'study',
  VOLUNTEER: 'volunteer',
  PILGRIMAGE: 'pilgrimage',
});

export const District = Object.freeze({
  RIVERSIDE: 'Canal Saint-Martin',
  OLD_TOWN: 'Le Marais',
  HOME: 'Belleville',
  UPTOWN: 'Saint-Germain',
  OUTSKIRTS: 'Paris Edges',
});

/** Districts in the order the map screen shows them. */
export const DISTRICT_ORDER = [
  District.HOME, District.RIVERSIDE, District.OLD_TOWN, District.UPTOWN, District.OUTSKIRTS,
];

const eff = (sanity = 0, money = 0, energy = 0, reputation = 0, insight = 0) =>
  ({ sanity, money, energy, reputation, insight });

/**
 * @param {object} cfg
 * @returns {object} a frozen location definition
 */
function loc(cfg) {
  return Object.freeze({
    tags: [],
    unlock: {},
    special: null,
    bg: '',
    /** Side character who "keeps" this place — shown on the location card. */
    host: '',
    ...cfg,
    effects: { sanity: 0, money: 0, energy: 0, reputation: 0, insight: 0, ...cfg.effects },
    unlock: { minDay: 1, minReputation: 0, ...cfg.unlock },
  });
}

export const LOCATIONS = [
  // ------------------------------------------------------------- core two
  loc({
    id: 'spiritual_community',
    host: 'geo',
    name: 'La Maison Calme',
    emoji: '🧘',
    district: District.RIVERSIDE,
    desc: 'A former locksmith’s atelier near Canal Saint-Martin, softened by candles, floor cushions and rain ticking at the tall windows. Here, connection feels possible without becoming a performance.',
    actionLabel: 'Meditate & Connect',
    actionDesc: 'You spent the day meditating and connecting with your spiritual community. Sanity restored, but donations cost you.',
    historyLabel: 'Visited La Maison Calme',
    tags: [Tag.SPIRITUAL, Tag.COMMUNITY, Tag.INDOOR],
    effects: eff(15, -10, -12, 2, 1),
    bg: 'assets/backgrounds/paris_spiritual_community.webp',
  }),
  loc({
    id: 'bar',
    host: 'barret',
    name: 'Le Dernier Verre',
    emoji: '🍻',
    district: District.OLD_TOWN,
    desc: 'A narrow Belleville bar with a zinc counter, amber lamps and wet pavement beyond the door. Glasses clink beneath the low, forgiving murmur of the neighbourhood.',
    actionLabel: 'Work a Shift',
    actionDesc: 'You worked a shift at the bar. The tips are good, but the late nights are wearing on your spirit.',
    historyLabel: 'Worked at Le Dernier Verre',
    tags: [Tag.WORK, Tag.NIGHT, Tag.INDOOR, Tag.SOCIAL],
    effects: eff(-12, 12, -20, 0, 0),
    bg: 'assets/backgrounds/paris_bar.webp',
  }),

  // --------------------------------------------------------- Home Quarter
  loc({
    id: 'home_loft',
    host: 'leon',
    name: 'Home Loft',
    emoji: '🛏️',
    district: District.HOME,
    desc: 'Two rooms above a shuttered print shop. A mattress, a kettle, a window that rattles. It is not much, but the door locks and nobody needs anything from you here.',
    actionLabel: 'Rest the Whole Day',
    actionDesc: 'You slept until the light moved across the floor, then slept some more. Nothing was accomplished. Everything hurt slightly less.',
    historyLabel: 'Rested at the loft',
    tags: [Tag.REST, Tag.INDOOR, Tag.QUIET],
    // A rest day still costs you: you eat, and you earn nothing.
    effects: eff(4, -3, 34, 0, 0),
    bg: 'assets/backgrounds/home_loft.webp',
  }),
  loc({
    id: 'rooftop',
    host: 'yume',
    name: 'Rooftop',
    emoji: '🌃',
    district: District.HOME,
    desc: 'Tar paper, a folding chair, and the whole grid of streetlights laid out below. The city sounds like a held breath from up here.',
    actionLabel: 'Sit Out the Night',
    actionDesc: 'You climbed up with a blanket and watched the city breathe. Some knots loosened without you naming them.',
    historyLabel: 'Watched the city from the rooftop',
    tags: [Tag.OUTDOOR, Tag.QUIET, Tag.NIGHT],
    effects: eff(9, 0, -4, 0, 1),
    unlock: { minDay: 4 },
    bg: 'assets/backgrounds/rooftop.webp',
  }),
  loc({
    id: 'free_clinic',
    host: 'susan',
    name: 'Community Clinic',
    emoji: '🩺',
    district: District.HOME,
    desc: 'A converted storefront with mismatched chairs and a permanent queue. Two nurses, one doctor, and whoever else turns up willing to work.',
    actionLabel: 'Volunteer a Shift',
    actionDesc: 'You spent the day filing, translating and holding hands in a waiting room. Exhausting, unpaid, and unambiguously good.',
    historyLabel: 'Volunteered at the free clinic',
    tags: [Tag.COMMUNITY, Tag.VOLUNTEER, Tag.INDOOR],
    effects: eff(6, -4, -14, 7, 1),
    unlock: { minDay: 8 },
    bg: 'assets/backgrounds/free_clinic.webp',
  }),
  loc({
    id: 'soup_kitchen',
    host: 'siekamcebule',
    name: 'La Cantine Solidaire',
    emoji: '🍲',
    district: District.HOME,
    desc: 'Basement of the old union hall. Two hundred covers a night, industrial pots, and a radio nobody is allowed to change.',
    actionLabel: 'Cook the Service',
    actionDesc: 'You chopped onions for four hours and served two hundred people. Your back aches. The neighbourhood noticed.',
    historyLabel: 'Cooked at the soup kitchen',
    tags: [Tag.COMMUNITY, Tag.VOLUNTEER, Tag.INDOOR, Tag.SOCIAL],
    effects: eff(5, -5, -16, 9, 0),
    unlock: { minDay: 11, minReputation: 25 },
    bg: 'assets/backgrounds/soup_kitchen.webp',
  }),

  // ------------------------------------------------------------ Riverside
  loc({
    id: 'river_walk',
    host: 'joar',
    name: 'Canal Walk',
    emoji: '🌊',
    district: District.RIVERSIDE,
    desc: 'Iron footbridges, plane trees and dark water under the Canal Saint-Martin. A walk here makes Paris feel briefly small enough to cross on foot.',
    actionLabel: 'Walk the Towpath',
    actionDesc: 'You walked until the thinking stopped and only the walking was left.',
    historyLabel: 'Walked the river path',
    tags: [Tag.OUTDOOR, Tag.QUIET],
    // Restorative, and still a whole day not earning — plus the coffee at the turn.
    effects: eff(8, -2, 6, 0, 0),
    unlock: { minDay: 2 },
    bg: 'assets/backgrounds/paris_canal.webp',
  }),
  loc({
    id: 'community_garden',
    host: 'brock_lee',
    name: 'Community Garden',
    emoji: '🌱',
    district: District.RIVERSIDE,
    desc: 'Twelve raised beds on a lot the council forgot. Tomatoes, chard, one determined fig tree, and an unwritten rota everybody follows.',
    actionLabel: 'Work the Beds',
    actionDesc: 'You weeded, watered and argued gently about slugs. There was produce to take home and a little to sell.',
    historyLabel: 'Worked the community garden',
    tags: [Tag.OUTDOOR, Tag.COMMUNITY],
    effects: eff(7, 2, -8, 4, 0),
    unlock: { minDay: 5 },
    bg: 'assets/backgrounds/community_garden.webp',
  }),
  loc({
    id: 'farmers_market',
    host: 'ahyeon',
    name: 'Saturday Market',
    emoji: '🥬',
    district: District.RIVERSIDE,
    desc: 'Saturday trestle tables under a leaking awning. The community sells honey, jam and meditation cushions nobody has the heart to price properly.',
    actionLabel: 'Run the Stall',
    actionDesc: 'You stood behind a trestle table for six hours and sold most of it. Somebody left you something in the crate.',
    historyLabel: 'Ran the market stall',
    tags: [Tag.MARKET, Tag.OUTDOOR, Tag.COMMUNITY, Tag.WORK],
    effects: eff(2, 8, -10, 2, 0),
    unlock: { minDay: 3 },
    bg: 'assets/backgrounds/farmers_market.webp',
  }),
  loc({
    id: 'bathhouse',
    host: 'renata',
    name: 'Bathhouse',
    emoji: '♨️',
    district: District.RIVERSIDE,
    desc: 'Edwardian tile, water at three temperatures, and a strict rule of silence enforced by a woman who has never explained her name.',
    actionLabel: 'Soak and Say Nothing',
    actionDesc: 'Hot, cold, hot again, then twenty minutes flat on a wooden bench. You came out feeling reassembled.',
    historyLabel: 'Soaked at the bathhouse',
    tags: [Tag.REST, Tag.INDOOR, Tag.QUIET],
    effects: eff(10, -6, 24, 0, 0),
    unlock: { minDay: 9 },
    bg: 'assets/backgrounds/bathhouse.webp',
  }),

  // ------------------------------------------------------------- Old Town
  loc({
    id: 'night_market',
    host: 'cheezl',
    name: 'Night Market',
    emoji: '🏮',
    district: District.OLD_TOWN,
    desc: 'Six streets of grills, generators and paper lanterns, running from dusk until the police pretend to notice.',
    actionLabel: 'Trade Till Dawn',
    actionDesc: 'You helped a friend of a friend run a griddle, ate standing up, and pocketed a share of the night.',
    historyLabel: 'Traded at the night market',
    tags: [Tag.MARKET, Tag.NIGHT, Tag.SOCIAL, Tag.OUTDOOR, Tag.WORK],
    effects: eff(3, 7, -12, 1, 0),
    unlock: { minDay: 3 },
    bg: 'assets/backgrounds/night_market.webp',
  }),
  loc({
    id: 'flea_market',
    host: 'baris',
    name: 'Puces de Saint-Ouen',
    emoji: '🧺',
    district: District.OLD_TOWN,
    desc: 'Sunday tarpaulins over other people\u2019s history. Everything is negotiable and nothing is guaranteed to work.',
    actionLabel: 'Haggle All Day',
    actionDesc: 'You sold a box of the community\u2019s surplus and haggled for eleven hours. Profitable. Corrosive.',
    historyLabel: 'Haggled at the flea market',
    tags: [Tag.MARKET, Tag.OUTDOOR, Tag.WORK],
    effects: eff(-4, 11, -12, 0, 0),
    unlock: { minDay: 6 },
    bg: 'assets/backgrounds/flea_market.webp',
  }),
  loc({
    id: 'public_library',
    host: 'lou',
    name: 'Bibliothèque Forney',
    emoji: '📚',
    district: District.OLD_TOWN,
    desc: 'Third floor, east window, the reference section nobody has needed since 1997. The radiators tick. Nothing is asked of you.',
    actionLabel: 'Read Until Closing',
    actionDesc: 'You read four chapters, took notes you will actually reread, and dozed once in the good chair.',
    historyLabel: 'Read at the library',
    tags: [Tag.STUDY, Tag.INDOOR, Tag.QUIET],
    effects: eff(5, 0, -8, 0, 3),
    unlock: { minDay: 4 },
    bg: 'assets/backgrounds/paris_library.webp',
  }),
  loc({
    id: 'pawn_shop',
    host: 'stephen',
    name: 'Verrier, Antiquaire',
    emoji: '💍',
    district: District.OLD_TOWN,
    desc: 'A grille, a scale, and a man who has heard every story twice. He is not unkind. He simply knows what things are worth.',
    actionLabel: 'Sell Something You Own',
    actionDesc: 'You handed something over the counter and took the notes without counting them in front of him.',
    historyLabel: 'Sold something at the pawnbroker',
    tags: [Tag.MARKET, Tag.INDOOR, Tag.ADMIN],
    effects: eff(-6, 8, -6, 0, 0),
    unlock: { minDay: 6 },
    bg: 'assets/backgrounds/pawn_shop.webp',
  }),
  loc({
    id: 'radio_station',
    host: 'hawkinstv',
    name: 'Radio Station',
    emoji: '📻',
    district: District.OLD_TOWN,
    desc: 'A studio in a converted bedroom above a kebab shop, broadcasting to maybe four hundred people who all know each other.',
    actionLabel: 'Take the Late Slot',
    actionDesc: 'You talked for an hour about grief, rent and breathing exercises. Three people phoned in. One of them cried.',
    historyLabel: 'Broadcast on 88.3',
    tags: [Tag.COMMUNITY, Tag.INDOOR, Tag.NIGHT, Tag.SOCIAL],
    effects: eff(4, 3, -10, 12, 1),
    unlock: { minDay: 7, minReputation: 40 },
    bg: 'assets/backgrounds/radio_station.webp',
  }),
  loc({
    id: 'open_mic',
    host: 'klaudia',
    name: 'Caveau des Poètes',
    emoji: '🎤',
    district: District.OLD_TOWN,
    desc: 'Back room of the Ferryman, Friday and Saturday only. Three poets, a mediocre guitarist, and a crowd that is generous on purpose.',
    actionLabel: 'Take the Stage',
    actionDesc: 'You read something you had not meant to read out loud. The room went quiet in the good way.',
    historyLabel: 'Played the open mic',
    tags: [Tag.SOCIAL, Tag.NIGHT, Tag.INDOOR],
    effects: eff(8, 4, -14, 5, 1),
    unlock: { minDay: 10, weekdays: [4, 5] },
    bg: 'assets/backgrounds/open_mic.webp',
  }),

  // --------------------------------------------------------------- Uptown
  loc({
    id: 'landlord_office',
    host: 'kaden',
    name: 'Agence du Quartier',
    emoji: '📄',
    district: District.UPTOWN,
    desc: 'Grey carpet tiles, a ticket machine, and a laminated notice about respecting staff. Somewhere behind it all, Kaden\u2019s paperwork.',
    actionLabel: 'Settle the Rent Early',
    actionDesc: 'You paid ahead, got a stamped receipt, and walked out lighter than the amount you handed over would suggest.',
    historyLabel: 'Settled rent at the letting office',
    tags: [Tag.ADMIN, Tag.INDOOR],
    effects: eff(9, 0, -8, 0, 0),
    unlock: { minDay: 5 },
    special: 'prepay_rent',
    bg: 'assets/backgrounds/landlord_office.webp',
  }),
  loc({
    id: 'sato_studio',
    host: 'sato',
    name: 'Sato\u2019s Studio',
    emoji: '🕯️',
    district: District.UPTOWN,
    desc: 'Blonde wood, filtered water, a price list in a serif font. Sato keeps offering you a guest class and keeps meaning it.',
    actionLabel: 'Teach a Guest Class',
    actionDesc: 'You taught forty minutes of breathwork to people who paid a great deal for it, and took your cut without enjoying it.',
    historyLabel: 'Taught at Sato\u2019s studio',
    tags: [Tag.WORK, Tag.RIVAL, Tag.INDOOR, Tag.SPIRITUAL],
    effects: eff(-8, 15, -16, -3, 1),
    unlock: { minDay: 10 },
    bg: 'assets/backgrounds/sato_studio.webp',
  }),
  loc({
    id: 'alex_cocktail_bar',
    host: 'alex',
    name: 'Vermillion',
    emoji: '🍸',
    district: District.UPTOWN,
    desc: 'Clarified milk punch, a nine-page menu, and a doorman. Alex pays better than Barret and never lets you forget it.',
    actionLabel: 'Cover a Cocktail Shift',
    actionDesc: 'You worked a shift under Alex\u2019s rules: no shortcuts, no sitting, no talking to the guests unprompted. The money was real.',
    historyLabel: 'Covered a shift at Vermillion',
    tags: [Tag.WORK, Tag.RIVAL, Tag.NIGHT, Tag.INDOOR],
    effects: eff(-16, 19, -24, -2, 0),
    unlock: { minDay: 14 },
    bg: 'assets/backgrounds/alex_cocktail_bar.webp',
  }),

  // ------------------------------------------------------------ Outskirts
  loc({
    id: 'memorial_garden',
    host: 'marlies',
    name: 'Père Lachaise Garden',
    emoji: '🕊️',
    district: District.OUTSKIRTS,
    desc: 'A walled acre behind the crematorium. Benches with names on them. The community tends the north beds for free.',
    actionLabel: 'Tend the North Beds',
    actionDesc: 'You cut back the roses and read the bench plaques, which is the whole point of the roses.',
    historyLabel: 'Tended the memorial garden',
    tags: [Tag.OUTDOOR, Tag.QUIET, Tag.SPIRITUAL, Tag.VOLUNTEER],
    effects: eff(6, -2, -10, 4, 3),
    unlock: { minDay: 12 },
    bg: 'assets/backgrounds/memorial_garden.webp',
  }),
  loc({
    id: 'temple_ruins',
    host: 'iulian',
    name: 'Saint-Denis Basilica Crypt',
    emoji: '⛩️',
    district: District.OUTSKIRTS,
    desc: 'An hour on the bus, then forty minutes uphill. Four standing walls, no roof, and an acoustic that makes one voice sound like several.',
    actionLabel: 'Make the Climb',
    actionDesc: 'You climbed to the ruins and sat in the roofless nave until the light went orange. Something in you reset.',
    historyLabel: 'Sat in the temple ruins',
    tags: [Tag.SPIRITUAL, Tag.OUTDOOR, Tag.PILGRIMAGE, Tag.QUIET],
    effects: eff(22, -8, -26, 3, 4),
    unlock: { minDay: 12, minReputation: 30 },
    bg: 'assets/backgrounds/temple_ruins.webp',
  }),
  loc({
    id: 'mountain_retreat',
    host: 'geo',
    name: 'Fontainebleau Retreat',
    emoji: '🏔️',
    district: District.OUTSKIRTS,
    desc: 'Geo\u2019s teacher\u2019s teacher built it. Silent, freezing, three days minimum, and they will not take you unless somebody vouches.',
    actionLabel: 'Go on Retreat',
    actionDesc: 'Three days of silence, thin soup and thinner blankets. You came back down changed and considerably poorer.',
    historyLabel: 'Went on retreat in the mountains',
    tags: [Tag.SPIRITUAL, Tag.PILGRIMAGE, Tag.OUTDOOR, Tag.REST],
    effects: eff(32, -22, -30, 6, 6),
    unlock: { minDay: 20, minReputation: 55 },
    special: 'long_trip',
    bg: 'assets/backgrounds/mountain_retreat.webp',
  }),
];

/** Ids of the two locations the game opens with. */
export const CORE_LOCATION_IDS = Object.freeze(['spiritual_community', 'bar']);

const BY_ID = new Map(LOCATIONS.map((l) => [l.id, l]));

/** @returns {object|null} */
export function getLocation(id) {
  return BY_ID.get(id) ?? null;
}

export function locationIds() {
  return LOCATIONS.map((l) => l.id);
}

export function locationsInDistrict(district) {
  return LOCATIONS.filter((l) => l.district === district);
}

export function hasTag(location, tag) {
  return Boolean(location) && location.tags.includes(tag);
}

/**
 * Evaluate a location's unlock rule against a state snapshot.
 *
 * @param {object} location
 * @param {{journeyDay:number, reputation:number, weekday:number,
 *          perks?:Set<string>|string[], closedTags?:string[]}} snap
 * @returns {{unlocked:boolean, reason:string}}
 */
export function evaluateUnlock(location, snap) {
  const {
    journeyDay = 1, reputation = 0, weekday = 0,
    perks = [], closedTags = [],
  } = snap ?? {};
  const perkSet = perks instanceof Set ? perks : new Set(perks);
  const u = location.unlock;

  if (journeyDay < u.minDay) {
    return { unlocked: false, reason: `Opens on journey day ${u.minDay}` };
  }
  if (reputation < u.minReputation) {
    return { unlocked: false, reason: `Needs ${u.minReputation} reputation` };
  }
  if (u.requiresPerk && !perkSet.has(u.requiresPerk)) {
    return { unlocked: false, reason: `Needs the ${u.requiresPerk} perk` };
  }
  if (Array.isArray(u.weekdays) && u.weekdays.length > 0 && !u.weekdays.includes(weekday)) {
    return { unlocked: false, reason: 'Not on today of all days' };
  }
  for (const tag of closedTags) {
    if (location.tags.includes(tag)) {
      return { unlocked: false, reason: 'Closed by the weather' };
    }
  }
  return { unlocked: true, reason: '' };
}

/** All locations currently open, in catalogue order. */
export function availableLocations(snap) {
  return LOCATIONS.filter((l) => evaluateUnlock(l, snap).unlocked);
}
