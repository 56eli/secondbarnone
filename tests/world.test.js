/**
 * Tests for the expanded world: locations, weather, items, perks, festivals
 * and achievements.
 *
 * Everything in `docs/js/data/` is pure data plus pure helpers, so all of it
 * is deterministic and all of it is asserted here rather than sampled.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LOCATIONS, CORE_LOCATION_IDS, DISTRICT_ORDER, District, Tag,
  getLocation, locationIds, locationsInDistrict, hasTag,
  evaluateUnlock, availableLocations,
} from '../docs/js/data/locations.js';
import {
  WEATHER_TYPES, getWeather, weatherForDay, forecast, eligibleWeather, closedTags,
} from '../docs/js/data/weather.js';
import {
  ITEMS, ItemKind, getItem, itemIds, aggregateModifiers,
} from '../docs/js/data/items.js';
import {
  PERKS, getPerk, perkIds, canBuyPerk, aggregatePerks,
} from '../docs/js/data/perks.js';
import {
  FESTIVALS, getFestival, festivalOn, upcomingFestivals,
} from '../docs/js/data/festivals.js';
import {
  ACHIEVEMENTS, getAchievement, evaluateAchievements,
} from '../docs/js/data/achievements.js';
import { createAllProfiles, Role, SMALL_TALK, smallTalkFor } from '../docs/js/data/characters.js';
import { buildEventPool } from '../docs/js/data/events.js';

// ============================================================== locations

test('the catalogue holds twenty-two locations with unique ids', () => {
  assert.equal(LOCATIONS.length, 22);
  const ids = locationIds();
  assert.equal(new Set(ids).size, ids.length);
});

test('the two founding locations are present and open from day one', () => {
  for (const id of CORE_LOCATION_IDS) {
    const location = getLocation(id);
    assert.ok(location, `${id} missing`);
    assert.equal(location.unlock.minDay, 1);
    assert.equal(location.unlock.minReputation, 0);
  }
});

test('the original two locations keep their original numbers', () => {
  // The whole expansion is worthless if it quietly rebalances the opening.
  const sc = getLocation('spiritual_community');
  assert.equal(sc.effects.sanity, 15);
  assert.equal(sc.effects.money, -10);

  const bar = getLocation('bar');
  assert.equal(bar.effects.money, 12);
  assert.equal(bar.effects.sanity, -12);
});

test('every location is fully specified', () => {
  for (const l of LOCATIONS) {
    assert.match(l.id, /^[a-z0-9_]+$/, `${l.id} is not a slug`);
    assert.ok(l.name.length > 2, `${l.id} name`);
    assert.ok(l.emoji.length > 0, `${l.id} emoji`);
    assert.ok(l.desc.length > 40, `${l.id} desc too short`);
    assert.ok(l.actionLabel.length > 3, `${l.id} action label`);
    assert.ok(l.actionDesc.length > 30, `${l.id} action desc`);
    assert.ok(l.historyLabel.length > 3, `${l.id} history label`);
    assert.ok(l.tags.length > 0, `${l.id} has no tags`);
    assert.ok(DISTRICT_ORDER.includes(l.district), `${l.id} district ${l.district}`);
  }
});

test('every location tag is part of the shared vocabulary', () => {
  const known = new Set(Object.values(Tag));
  for (const l of LOCATIONS) {
    for (const t of l.tags) assert.ok(known.has(t), `${l.id} uses unknown tag ${t}`);
  }
});

test('every location effect bundle has all five keys', () => {
  for (const l of LOCATIONS) {
    for (const k of ['sanity', 'money', 'energy', 'reputation', 'insight']) {
      assert.equal(typeof l.effects[k], 'number', `${l.id}.${k}`);
    }
  }
});

test('no location is a free lunch', () => {
  // Every place must cost something — money, energy or sanity — or the
  // decision of where to spend a day stops being a decision.
  for (const l of LOCATIONS) {
    const { sanity, money, energy } = l.effects;
    assert.ok(sanity < 0 || money < 0 || energy < 0, `${l.id} costs nothing`);
  }
});

test('every location has a dedicated webp background under assets/', () => {
  for (const l of LOCATIONS) {
    assert.match(l.bg, /^assets\/backgrounds\/[a-z0-9_]+\.webp$/, `${l.id} bg ${l.bg}`);
  }
});

test('every district in the order has at least one location', () => {
  for (const d of DISTRICT_ORDER) {
    assert.ok(locationsInDistrict(d).length > 0, `${d} is empty`);
  }
});

test('every location belongs to a district in the display order', () => {
  const placed = DISTRICT_ORDER.flatMap((d) => locationsInDistrict(d));
  assert.equal(placed.length, LOCATIONS.length);
});

test('locationsInDistrict returns nothing for an unknown district', () => {
  assert.deepEqual(locationsInDistrict('Atlantis'), []);
});

test('getLocation returns null for an unknown id', () => {
  assert.equal(getLocation('nowhere'), null);
  assert.equal(getLocation(undefined), null);
});

test('hasTag is safe on null and reports correctly', () => {
  assert.equal(hasTag(getLocation('bar'), Tag.NIGHT), true);
  assert.equal(hasTag(getLocation('bar'), Tag.PILGRIMAGE), false);
  assert.equal(hasTag(null, Tag.NIGHT), false);
});

// ---------------------------------------------------------------- unlocks

test('a day-gated location is shut before its day and open after', () => {
  const rooftop = getLocation('rooftop');
  const base = { journeyDay: 1, reputation: 100, weekday: 0 };
  const early = evaluateUnlock(rooftop, base);
  assert.equal(early.unlocked, false);
  assert.match(early.reason, /day 4/);
  assert.equal(evaluateUnlock(rooftop, { ...base, journeyDay: 4 }).unlocked, true);
});

test('a reputation-gated location reports what it wants', () => {
  const ruins = getLocation('temple_ruins');
  const snap = { journeyDay: 99, reputation: 0, weekday: 0 };
  const shut = evaluateUnlock(ruins, snap);
  assert.equal(shut.unlocked, false);
  assert.match(shut.reason, /30 reputation/);
  assert.equal(evaluateUnlock(ruins, { ...snap, reputation: 30 }).unlocked, true);
});

test('a weekday-gated location only opens on its days', () => {
  const openMic = getLocation('open_mic');
  const snap = { journeyDay: 99, reputation: 99 };
  assert.equal(evaluateUnlock(openMic, { ...snap, weekday: 0 }).unlocked, false);
  assert.equal(evaluateUnlock(openMic, { ...snap, weekday: 4 }).unlocked, true);
  assert.equal(evaluateUnlock(openMic, { ...snap, weekday: 5 }).unlocked, true);
});

test('closed tags shut a location regardless of every other gate', () => {
  const river = getLocation('river_walk');
  const snap = { journeyDay: 99, reputation: 99, weekday: 0 };
  assert.equal(evaluateUnlock(river, snap).unlocked, true);
  const shut = evaluateUnlock(river, { ...snap, closedTags: [Tag.OUTDOOR] });
  assert.equal(shut.unlocked, false);
  assert.match(shut.reason, /weather/i);
});

test('perk and item unlock rules are honoured when present', () => {
  const fake = { ...getLocation('bar'), unlock: { minDay: 1, minReputation: 0, requiresPerk: 'night_owl' } };
  assert.equal(evaluateUnlock(fake, { journeyDay: 1, reputation: 0, weekday: 0 }).unlocked, false);
  assert.equal(evaluateUnlock(fake, { journeyDay: 1, reputation: 0, weekday: 0, perks: ['night_owl'] }).unlocked, true);
  assert.equal(evaluateUnlock(fake, { journeyDay: 1, reputation: 0, weekday: 0, perks: new Set(['night_owl']) }).unlocked, true);

  const needsItem = { ...getLocation('bar'), unlock: { minDay: 1, minReputation: 0, requiresItem: 'good_boots' } };
  assert.equal(evaluateUnlock(needsItem, { journeyDay: 1, reputation: 0, weekday: 0 }).unlocked, false);
  assert.equal(evaluateUnlock(needsItem, { journeyDay: 1, reputation: 0, weekday: 0, items: ['good_boots'] }).unlocked, true);
});

test('evaluateUnlock tolerates a missing snapshot entirely', () => {
  const bar = getLocation('bar');
  assert.equal(evaluateUnlock(bar, undefined).unlocked, true);
  assert.equal(evaluateUnlock(bar, null).unlocked, true);
});

test('a fresh run opens with the two founding locations plus home', () => {
  const open = availableLocations({ journeyDay: 1, reputation: 10, weekday: 3 });
  assert.deepEqual(open.map((l) => l.id).sort(), ['bar', 'home_loft', 'spiritual_community']);
  for (const id of CORE_LOCATION_IDS) {
    assert.ok(open.some((l) => l.id === id), `${id} should be open on day one`);
  }
});

test('the city opens up as the run goes on', () => {
  const early = availableLocations({ journeyDay: 1, reputation: 10, weekday: 3 }).length;
  const mid = availableLocations({ journeyDay: 12, reputation: 40, weekday: 4 }).length;
  const late = availableLocations({ journeyDay: 60, reputation: 100, weekday: 4 }).length;
  assert.ok(mid > early, `mid ${mid} should exceed early ${early}`);
  assert.ok(late > mid, `late ${late} should exceed mid ${mid}`);
  assert.equal(late, LOCATIONS.length, 'everything should eventually open');
});

// ================================================================ weather

test('weather types are unique, weighted and captioned', () => {
  const ids = WEATHER_TYPES.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const t of WEATHER_TYPES) {
    assert.ok(t.weight > 0, `${t.id} weight`);
    assert.ok(t.name.length > 2, `${t.id} name`);
    assert.ok(t.line.length > 20, `${t.id} line`);
    assert.ok(Array.isArray(t.closes), `${t.id} closes`);
  }
});

test('getWeather resolves known ids and refuses unknown ones', () => {
  assert.equal(getWeather('storm').id, 'storm');
  assert.equal(getWeather('sharknado'), null);
});

test('weatherForDay is pure: same inputs always give the same sky', () => {
  for (let day = 1; day <= 50; day++) {
    const a = weatherForDay(day, 1234, 'Spring');
    const b = weatherForDay(day, 1234, 'Spring');
    assert.equal(a.id, b.id, `day ${day} was not stable`);
  }
});

test('different seeds produce different weather histories', () => {
  const a = Array.from({ length: 40 }, (_, i) => weatherForDay(i + 1, 1, 'Autumn').id);
  const b = Array.from({ length: 40 }, (_, i) => weatherForDay(i + 1, 2, 'Autumn').id);
  assert.notDeepEqual(a, b);
});

test('seasonal weather never appears out of season', () => {
  const seasons = ['Winter', 'Spring', 'Summer', 'Autumn'];
  for (const season of seasons) {
    for (let day = 1; day <= 300; day++) {
      const t = weatherForDay(day, day, season);
      if (t.seasons !== null) {
        assert.ok(t.seasons.includes(season), `${t.id} appeared in ${season}`);
      }
    }
  }
});

test('every season can actually produce weather', () => {
  for (const season of ['Winter', 'Spring', 'Summer', 'Autumn', 'Unknown']) {
    assert.ok(eligibleWeather(season).length > 0, `${season} has no eligible weather`);
  }
});

test('snow is winter-only and heatwaves are summer-only', () => {
  assert.deepEqual(getWeather('snow').seasons, ['Winter']);
  assert.deepEqual(getWeather('heatwave').seasons, ['Summer']);
  const winter = new Set(eligibleWeather('Winter').map((t) => t.id));
  assert.ok(winter.has('snow'));
  assert.ok(!winter.has('heatwave'));
});

test('the forecast reads forward from the given day and matches the day query', () => {
  const days = forecast(10, 99, 'Summer', 5);
  assert.equal(days.length, 5);
  assert.deepEqual(days.map((d) => d.day), [10, 11, 12, 13, 14]);
  for (const { day, weather } of days) {
    assert.equal(weather.id, weatherForDay(day, 99, 'Summer').id);
  }
});

test('a storm closes outdoor places and clear weather closes nothing', () => {
  assert.deepEqual(closedTags(getWeather('storm')), [Tag.OUTDOOR]);
  assert.deepEqual(closedTags(getWeather('clear')), []);
  assert.deepEqual(closedTags(null), []);
});

test('weather tag effects only reference real tags', () => {
  const known = new Set(Object.values(Tag));
  for (const t of WEATHER_TYPES) {
    for (const tag of Object.keys(t.tagEffects)) {
      assert.ok(known.has(tag), `${t.id} modifies unknown tag ${tag}`);
    }
    for (const tag of t.closes) {
      assert.ok(known.has(tag), `${t.id} closes unknown tag ${tag}`);
    }
  }
});

test('over many days every eligible weather type turns up', () => {
  const seen = new Set();
  for (let day = 1; day <= 2000; day++) seen.add(weatherForDay(day, 7, 'Winter').id);
  const expected = new Set(eligibleWeather('Winter').map((t) => t.id));
  assert.deepEqual([...seen].sort(), [...expected].sort());
});

// ================================================================== items

test('items are unique, priced and described', () => {
  const ids = itemIds();
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ITEMS.length >= 12);
  for (const i of ITEMS) {
    assert.match(i.id, /^[a-z0-9_]+$/);
    assert.ok(i.name.length > 2, `${i.id} name`);
    assert.ok(i.emoji.length > 0, `${i.id} emoji`);
    assert.ok(i.desc.length > 20, `${i.id} desc`);
    assert.ok(i.value > 0, `${i.id} value`);
    assert.ok(Object.values(ItemKind).includes(i.kind), `${i.id} kind`);
  }
});

test('consumables have a use effect and passives have modifiers', () => {
  for (const i of ITEMS) {
    if (i.kind === ItemKind.CONSUMABLE) {
      assert.ok(i.use, `${i.id} is consumable with nothing to do`);
      assert.ok(Object.keys(i.use).length > 0);
    }
    if (i.kind === ItemKind.PASSIVE) {
      assert.ok(Object.keys(i.modifiers).length > 0, `${i.id} is passive with no modifiers`);
    }
    if (i.kind === ItemKind.KEEPSAKE) {
      assert.equal(Object.keys(i.modifiers).length, 0, `${i.id} keepsake should be inert`);
    }
  }
});

test('every item kind is represented', () => {
  const kinds = new Set(ITEMS.map((i) => i.kind));
  for (const k of Object.values(ItemKind)) assert.ok(kinds.has(k), `no ${k} items`);
});

test('getItem resolves known ids and refuses unknown ones', () => {
  assert.equal(getItem('thermos').id, 'thermos');
  assert.equal(getItem('excalibur'), null);
});

test('aggregateModifiers sums carried passives and ignores the rest', () => {
  const mods = aggregateModifiers(['prayer_beads', 'thermos', 'notebook']);
  assert.equal(mods.sanityPerTurn, 1);
  assert.equal(mods.energyPerTurn, 3);
  assert.equal(mods.insightPerTurn, 1);
  assert.equal(mods.moneyPerWorkTurn, 0);
});

test('aggregateModifiers tolerates junk, keepsakes and nothing at all', () => {
  const empty = aggregateModifiers([]);
  assert.equal(Object.values(empty).reduce((a, b) => a + b, 0), 0);
  assert.deepEqual(aggregateModifiers(['not_a_thing', 'river_stone']), empty);
  assert.deepEqual(aggregateModifiers(undefined), empty);
  assert.deepEqual(aggregateModifiers(new Set(['river_stone'])), empty);
});

// ================================================================== perks

test('perks are unique, priced and described', () => {
  const ids = perkIds();
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(PERKS.length >= 10);
  for (const p of PERKS) {
    assert.match(p.id, /^[a-z0-9_]+$/);
    assert.ok(p.cost > 0, `${p.id} cost`);
    assert.ok(p.desc.length > 20, `${p.id} desc`);
    assert.ok(Object.keys(p.effects).length > 0, `${p.id} does nothing`);
  }
});

test('every perk prerequisite names a real perk and the tree is acyclic', () => {
  const known = new Set(perkIds());
  for (const p of PERKS) {
    for (const r of p.requires) {
      assert.ok(known.has(r), `${p.id} requires unknown ${r}`);
      assert.notEqual(r, p.id, `${p.id} requires itself`);
    }
  }
  // Every perk must be reachable by buying prerequisites in declaration order.
  const owned = new Set();
  for (const p of PERKS) {
    for (const r of p.requires) {
      assert.ok(owned.has(r), `${p.id} is declared before its prerequisite ${r}`);
    }
    owned.add(p.id);
  }
});

test('canBuyPerk refuses unknown, owned, unaffordable and un-prerequisited perks', () => {
  assert.equal(canBuyPerk('nope', { insight: 99, perks: [] }).ok, false);

  const owned = canBuyPerk('steady_breath', { insight: 99, perks: ['steady_breath'] });
  assert.equal(owned.ok, false);
  assert.match(owned.reason, /Already/);

  const poor = canBuyPerk('steady_breath', { insight: 0, perks: [] });
  assert.equal(poor.ok, false);
  assert.match(poor.reason, /insight/);

  const locked = canBuyPerk('thick_skin', { insight: 99, perks: [] });
  assert.equal(locked.ok, false);
  assert.match(locked.reason, /Steady Breath/);

  assert.equal(canBuyPerk('steady_breath', { insight: 4, perks: [] }).ok, true);
  assert.equal(canBuyPerk('thick_skin', { insight: 99, perks: new Set(['steady_breath']) }).ok, true);
});

test('canBuyPerk copes with a snapshot missing its perk list', () => {
  assert.equal(canBuyPerk('steady_breath', { insight: 99 }).ok, true);
  assert.equal(canBuyPerk('steady_breath', {}).ok, false);
});

test('getPerk resolves known ids and refuses unknown ones', () => {
  assert.equal(getPerk('night_owl').id, 'night_owl');
  assert.equal(getPerk('flight'), null);
});

test('aggregatePerks sums owned effects and ignores junk', () => {
  const total = aggregatePerks(['steady_breath', 'open_hand', 'not_real']);
  assert.equal(total.barSanityRelief, 3);
  assert.equal(total.communityCostRelief, 4);
  assert.equal(total.rentRelief, 0);

  const none = aggregatePerks([]);
  assert.equal(Object.values(none).reduce((a, b) => a + b, 0), 0);
  assert.deepEqual(aggregatePerks(undefined), none);
});

test('owning every perk never produces a nonsensical aggregate', () => {
  const all = aggregatePerks(perkIds());
  assert.ok(all.hurtfulDampening > 0 && all.hurtfulDampening < 1,
    'dampening must stay a fraction or hurtful events would flip sign');
  assert.ok(all.rentRelief < 18, 'rent relief must not make rent free');
});

// ============================================================== festivals

test('festivals sit on unique, real calendar dates', () => {
  const seen = new Set();
  for (const f of FESTIVALS) {
    const key = `${f.monthIndex}:${f.dayOfMonth}`;
    assert.ok(!seen.has(key), `two festivals on ${key}`);
    seen.add(key);
    assert.ok(f.monthIndex >= 0 && f.monthIndex <= 11, `${f.id} month`);
    // A festival on 31 September, or on 29 February, would simply never fire.
    const shortest = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][f.monthIndex];
    assert.ok(f.dayOfMonth >= 1 && f.dayOfMonth <= shortest,
      `${f.id} falls on ${f.dayOfMonth} of a ${shortest}-day month`);
    assert.ok(f.line.length > 20, `${f.id} line`);
  }
});

test('festivalOn finds a festival on its date and nothing on others', () => {
  assert.equal(festivalOn(0, 1).id, 'new_year_vigil');
  assert.equal(festivalOn(11, 21).id, 'longest_night');
  assert.equal(festivalOn(0, 2), null);
  assert.equal(festivalOn(6, 6), null);
});

test('exactly one festival waives the rent', () => {
  const waivers = FESTIVALS.filter((f) => f.waivesRent);
  assert.equal(waivers.length, 1);
  assert.equal(waivers[0].id, 'rent_amnesty');
});

test('festival tag effects reference real tags', () => {
  const known = new Set(Object.values(Tag));
  for (const f of FESTIVALS) {
    for (const tag of Object.keys(f.tagEffects)) {
      assert.ok(known.has(tag), `${f.id} modifies unknown tag ${tag}`);
    }
  }
});

test('upcomingFestivals looks forward and wraps around the year', () => {
  const early = upcomingFestivals(0, 1, 2);
  assert.equal(early.length, 2);
  assert.equal(early[0].id, 'lantern_night');

  // Past the last festival of the year, it must wrap rather than come up empty.
  const late = upcomingFestivals(11, 31, 2);
  assert.equal(late.length, 2);
  assert.equal(late[0].id, 'new_year_vigil');
});

test('getFestival resolves by id', () => {
  assert.equal(getFestival('midsummer').monthIndex, 5);
  assert.equal(getFestival('nope'), null);
});

// =========================================================== achievements

test('achievements are unique and fully described', () => {
  const ids = ACHIEVEMENTS.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ACHIEVEMENTS.length, 22);
  for (const a of ACHIEVEMENTS) {
    assert.ok(a.name.length > 2, `${a.id} name`);
    assert.ok(a.emoji.length > 0, `${a.id} emoji`);
    assert.ok(a.desc.length > 10, `${a.id} desc`);
    assert.equal(typeof a.test, 'function', `${a.id} test`);
  }
});

/** A snapshot in which nothing has been achieved. */
const blankSnapshot = () => ({
  journeyDay: 1,
  sanity: 50,
  money: 50,
  energy: 100,
  reputation: 10,
  insight: 0,
  perks: new Set(),
  items: [],
  visitedLocations: new Set(),
  totalLocations: LOCATIONS.length,
  rentPaidCount: 0,
  nightDays: 0,
  festivalsSeen: 0,
  weatherId: 'clear',
  locationTags: [],
});

test('a blank snapshot earns nothing', () => {
  assert.deepEqual(evaluateAchievements(blankSnapshot(), new Set()), []);
});

test('every achievement has a snapshot that earns it', () => {
  // If a predicate can never be satisfied it is decoration, not an achievement.
  const cases = {
    first_week: { journeyDay: 7 },
    first_month: { journeyDay: 30 },
    the_year: { journeyDay: 200 },
    wanderer: { visitedLocations: new Set(locationIds().slice(0, 8)) },
    cartographer: { visitedLocations: new Set(locationIds()) },
    flush: { money: 90 },
    war_chest: { money: 150 },
    serene: { sanity: 90 },
    in_balance: { sanity: 71, money: 71 },
    hundred_days: { journeyDay: 100 },
    well_known: { reputation: 60 },
    pillar: { reputation: 90 },
    student: { perks: new Set(perkIds().slice(0, 3)) },
    adept: { perks: new Set(perkIds().slice(0, 6)) },
    collector: { items: itemIds().slice(0, 5) },
    neighbour: { reputation: 30 },
    pilgrim: { visitedLocations: new Set(['mountain_retreat']) },
    weathered: { weatherId: 'storm', locationTags: ['work'] },
    night_shift: { nightDays: 5 },
    almost_broke: { sanity: 4 },
    rent_master: { rentPaidCount: 6 },
    festival_goer: { festivalsSeen: 3 },
  };

  for (const a of ACHIEVEMENTS) {
    assert.ok(cases[a.id], `no test case written for ${a.id}`);
    const snap = { ...blankSnapshot(), ...cases[a.id] };
    assert.equal(a.test(snap), true, `${a.id} could not be earned`);
  }
});

test('evaluateAchievements skips ones already held', () => {
  const snap = { ...blankSnapshot(), journeyDay: 40 };
  const first = evaluateAchievements(snap, new Set()).map((a) => a.id);
  assert.ok(first.includes('first_week'));
  assert.ok(first.includes('first_month'));

  const second = evaluateAchievements(snap, new Set(first)).map((a) => a.id);
  assert.deepEqual(second, []);
});

test('evaluateAchievements accepts an array as well as a Set, and nothing at all', () => {
  const snap = { ...blankSnapshot(), journeyDay: 7 };
  assert.equal(evaluateAchievements(snap, ['first_week']).length, 0);
  assert.equal(evaluateAchievements(snap, undefined).length, 1);
});

test('getAchievement resolves by id', () => {
  assert.equal(getAchievement('pilgrim').emoji, '⛰️');
  assert.equal(getAchievement('nope'), null);
});

test('almost_broke does not fire on a dead run', () => {
  // Zero is game over, not a near miss — the predicate must exclude it.
  assert.equal(getAchievement('almost_broke').test({ ...blankSnapshot(), sanity: 0, money: 0 }), false);
});

test('District constants are all used by the order list', () => {
  for (const d of Object.values(District)) {
    assert.ok(DISTRICT_ORDER.includes(d), `${d} is declared but never displayed`);
  }
});

test('every location has a host who is a real character', () => {
  const ids = new Set(createAllProfiles().map((c) => c.id));
  for (const l of LOCATIONS) {
    assert.ok(l.host, `${l.id} has no host`);
    assert.ok(ids.has(l.host), `${l.id} host ${l.host} missing from cast`);
  }
});

test('every location host has several deterministic character-specific small-talk lines', () => {
  for (const location of LOCATIONS) {
    const lines = SMALL_TALK[location.host];
    assert.ok(lines, `${location.id} host ${location.host} needs small talk`);
    assert.ok(lines.length >= 3, `${location.host} needs a list of lines`);
    assert.equal(smallTalkFor(location.host, 3), smallTalkFor(location.host, 3), 'same visit is stable');
    assert.ok(lines.includes(smallTalkFor(location.host, 1)), `${location.host} line comes from their list`);
  }
  assert.equal(smallTalkFor('nobody', 1), 'It is good to see you.');
});

test('retired task rewards remain discoverable through ordinary events', () => {
  const grants = new Set(buildEventPool().map((event) => event.grantsItem).filter(Boolean));
  for (const item of ['tip_jar', 'herbal_tonic', 'good_boots']) {
    assert.ok(grants.has(item), `${item} must remain discoverable`);
  }
});

test('every event is tied to a real character', () => {
  const ids = new Set(createAllProfiles().map((c) => c.id));
  const pool = buildEventPool();
  assert.ok(pool.length >= 64);
  for (const e of pool) {
    assert.ok(e.character, `${e.id} has no character`);
    assert.ok(ids.has(e.character), `${e.id} → ${e.character}`);
  }
});

test('at least half of all events belong to side characters', () => {
  const profiles = new Map(createAllProfiles().map((person) => [person.id, person]));
  const pool = buildEventPool();
  const sideEvents = pool.filter((event) => profiles.get(event.character)?.role === Role.SIDE_CHARACTER);
  assert.ok(sideEvents.length * 2 >= pool.length,
    `${sideEvents.length}/${pool.length} events are side-character events`);
});

test('Sato and Alex each have multi-beat arcs', () => {
  const pool = buildEventPool();
  const sato = pool.filter((e) => e.character === 'sato');
  const alex = pool.filter((e) => e.character === 'alex');
  assert.ok(sato.length >= 3, `sato events: ${sato.length}`);
  assert.ok(alex.length >= 3, `alex events: ${alex.length}`);
});

test('hundred_days and war_chest achievements exist and fire', () => {
  assert.ok(getAchievement('hundred_days'));
  assert.ok(getAchievement('war_chest'));
  const earned = evaluateAchievements({
    journeyDay: 100, sanity: 50, money: 150, energy: 50, reputation: 10,
    insight: 0, perks: new Set(), items: [], visitedLocations: new Set(),
    totalLocations: 22, rentPaidCount: 0,
    nightDays: 0, festivalsSeen: 0, weatherId: 'clear', locationTags: [],
  }, new Set());
  const ids = earned.map((a) => a.id);
  assert.ok(ids.includes('hundred_days'));
  assert.ok(ids.includes('war_chest'));
});
