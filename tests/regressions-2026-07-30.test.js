import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

import { GameState } from '../docs/js/core/game-state.js';
import { EventManager } from '../docs/js/core/event-manager.js';
import { createRng } from '../docs/js/core/rng.js';
import { buildEventPool, eventsForCharacter } from '../docs/js/data/events.js';
import { createAllProfiles } from '../docs/js/data/characters.js';
import { LOCATIONS } from '../docs/js/data/locations.js';
import { RENOVATIONS } from '../docs/js/data/renovations.js';
import { evaluateAchievements, getAchievement } from '../docs/js/data/achievements.js';
import { resolveTurn } from '../docs/js/core/turn.js';
import { locationFocusResources } from '../docs/js/ui/screens.js';

const ROOT = new URL('..', import.meta.url);

test('out-of-turn purchases can never spend the wallet to zero', () => {
  const prepay = new GameState({ seed: 1 });
  prepay.journeyDay = 6;
  prepay.money = prepay.rentDue();
  const exactRent = prepay.money;
  assert.equal(prepay.prepayRent(1), false);
  assert.equal(prepay.money, exactRent);
  assert.deepEqual([...prepay.rentPrepaidDays], []);

  const project = new GameState({ seed: 1 });
  project.journeyDay = 60;
  project.insight = 15;
  project.money = 20;
  assert.equal(project.buyRenovation('roof_repair'), false);
  assert.equal(project.money, 20);
  assert.equal(project.renovations.size, 0);
});

test('repeated prepayments extend cover instead of charging for one Sunday twice', () => {
  const gs = new GameState({ seed: 1 });
  gs.journeyDay = 6;
  gs.money = 100;
  const cost = gs.rentDue();
  assert.equal(gs.prepayRent(1), true);
  assert.equal(gs.prepayRent(1), true);
  assert.deepEqual(
    [...gs.rentPrepaidDays].sort((a, b) => a - b),
    [11, 18],
  );
  assert.equal(gs.money, 100 - cost * 2);
  assert.equal(gs.prepayRent(0), false);
  assert.equal(gs.prepayRent(-1), false);
});

test('the endurance milestone stays earned after a later death', () => {
  const gs = new GameState({ seed: 1 });
  gs.journeyDay = 60;
  assert.equal(gs.checkWin(), true);
  gs.journeyDay = 80;
  gs.money = 0;
  assert.equal(gs.checkGameOver(), true);
  assert.equal(gs.won, true);
  assert.match(gs.winMessage, /60 days/);
});

test('restart reseeding reproduces a fresh run event schedule exactly', () => {
  for (const seed of [1, 77, 4242, 90210]) {
    const gs = new GameState({ seed });
    const fresh = new EventManager(createRng(seed));
    fresh.initialize(gs.getCharacterNames());

    const used = new EventManager(createRng(seed));
    used.initialize(gs.getCharacterNames());
    used._scheduleNextEvent(50);
    used.reset(seed);

    assert.equal(used.toJSON().nextEventDay, fresh.toJSON().nextEventDay);
    assert.deepEqual(used.toJSON().rng, fresh.toJSON().rng);
  }
});

test('rival and nemesis arcs declare ordered prerequisites and one-shot beats', () => {
  const expected = {
    sato: ['sato_offer', 'sato_poach', 'sato_truce'],
    alex: ['alex_respect', 'alex_raid', 'alex_toast'],
    kaden: ['kaden_paperwork', 'kaden_survey', 'kaden_setback', 'kaden_buyout'],
  };
  for (const [character, order] of Object.entries(expected)) {
    const byId = new Map(eventsForCharacter(character).map((event) => [event.id, event]));
    for (let index = 0; index < order.length; index += 1) {
      const event = byId.get(order[index]);
      assert.ok(event, `${character}: missing ${order[index]}`);
      assert.equal(event.oncePerRun, true);
      assert.deepEqual(event.requiresEvents, index === 0 ? [] : [order[index - 1]]);
    }
  }
});

test('events seen in this run are excluded from future selection', () => {
  const em = new EventManager(createRng(8));
  em.initialize(['A']);
  const only = buildEventPool().find((event) => event.id === 'inspiring_meditation');
  em._allEvents = [only];
  em._nextEventDay = 1;
  const first = em.selectEvent(1, 0, 'spiritual_community', 0, {
    tags: [],
    weatherId: 'clear',
    seenEvents: new Set(),
  });
  assert.equal(first.id, only.id);
  em._nextEventDay = 2;
  const second = em.selectEvent(2, 1, 'spiritual_community', 0, {
    tags: [],
    weatherId: 'clear',
    seenEvents: new Set([only.id]),
  });
  assert.equal(second, null);
});

test('Sato is male everywhere player-facing', () => {
  const sato = createAllProfiles().find((profile) => profile.id === 'sato');
  assert.ok(sato);
  assert.match(`${sato.bio} ${sato.relationship}`, /\bhe\b/i);
  assert.doesNotMatch(`${sato.bio} ${sato.relationship}`, /\b(she|her|hers)\b/i);
  for (const event of eventsForCharacter('sato')) {
    assert.doesNotMatch(`${event.title} ${event.description}`, /\b(she|her|hers)\b/i, event.id);
  }
});

test('Oh is fully retired and Ahyeon Oh is the sole canonical character', () => {
  const profiles = createAllProfiles();
  const pool = buildEventPool();
  assert.equal(profiles.length, 77);
  assert.equal(
    profiles.some((profile) => profile.id === 'oh'),
    false,
  );
  assert.equal(
    pool.some((event) => event.character === 'oh'),
    false,
  );
  assert.equal(profiles.find((profile) => profile.id === 'ahyeon')?.name, 'Ahyeon Oh');
  assert.equal(existsSync(new URL('assets/portraits/oh.png', ROOT)), false);
  assert.equal(existsSync(new URL('docs/assets/portraits/oh.webp', ROOT)), false);
  assert.equal(existsSync(new URL('docs/assets/portraits/hi/oh.webp', ROOT)), false);
});

test('every location exposes at least one positive fog focus, without signs', () => {
  for (const location of LOCATIONS) {
    const focus = locationFocusResources(location);
    assert.ok(focus.length >= 1, `${location.id} has no positive focus`);
    assert.ok(
      focus.every((entry) => entry.value > 0),
      `${location.id} exposes a non-positive focus`,
    );
  }
  assert.deepEqual(
    locationFocusResources('bar').map((entry) => entry.key),
    ['money'],
  );
  assert.deepEqual(
    locationFocusResources('spiritual_community').map((entry) => entry.key),
    ['sanity'],
  );
});

test('side-character portrait CSS stays round and larger than the retired squeezed size', () => {
  const css = readFileSync(new URL('docs/css/style.css', ROOT), 'utf8');
  const avatarRule = css.match(/\.avatar\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';
  assert.match(avatarRule, /width:\s*72px/);
  assert.match(avatarRule, /height:\s*72px/);
  assert.match(avatarRule, /flex:\s*0 0 72px/);
  assert.match(avatarRule, /border-radius:\s*50%/);
  assert.doesNotMatch(avatarRule, /flex:\s*0 0 42px/);
  assert.match(css, /\.detail-avatar[\s\S]*?width:\s*96px[\s\S]*?height:\s*96px/);
  assert.match(css, /\.hud-portrait[\s\S]*?width:\s*110px[\s\S]*?height:\s*110px/);
});

test('the Enlightened achievement fires when every renovation is owned on or after day 150', () => {
  const gs = new GameState({ seed: 1 });
  // Walk to day 150 with sufficient resources, owning every renovation.
  gs.sanity = 80;
  gs.money = 200;
  gs.energy = 80;
  gs.reputation = 90;
  gs.journeyDay = 150;
  gs._turnResolvedOnDay = 149;
  for (const r of RENOVATIONS) gs.renovations.add(r.id);
  const snap = gs.achievementSnapshot();
  assert.equal(snap.renovations, RENOVATIONS.length);
  assert.equal(snap.totalRenovations, RENOVATIONS.length);
  const earned = evaluateAchievements(snap, new Set());
  assert.ok(
    earned.some((a) => a.id === 'enlightened'),
    'enlightened must fire',
  );
  // A pre-day-150 snapshot must not fire it, even with all renovations.
  const early = { ...snap, journeyDay: 149 };
  assert.equal(
    evaluateAchievements(early, new Set()).some((a) => a.id === 'enlightened'),
    false,
    'enlightened must not fire before day 150',
  );
});

test('resolveTurn leaves isTurnResolved true even after a long-trip (mountain retreat)', () => {
  const gs = new GameState({ seed: 1 });
  const events = new EventManager(createRng(gs.weatherSeed));
  events.initialize(gs.getCharacterNames());
  // Walk to retreat unlock day with a playable state.
  gs.reputation = 80;
  while (gs.journeyDay < 20) {
    gs.advanceDay();
    gs._turnResolvedOnDay = gs.journeyDay;
  }
  gs._turnResolvedOnDay = gs.journeyDay - 1; // one action still open
  const before = gs.journeyDay;
  const result = resolveTurn(gs, events, 'mountain_retreat');
  assert.equal(result.longTrip, true);
  assert.equal(result.extraDays, 2);
  assert.equal(gs.journeyDay, before + 2);
  assert.equal(
    gs.isTurnResolved,
    true,
    'after resolving a long trip the turn must be marked resolved on the return day',
  );
  // A second call in the same resolved state must come back as alreadyResolved.
  const again = resolveTurn(gs, events, 'bar');
  assert.equal(again.alreadyResolved, true, 'must not double-resolve on the same state');
});

test('"fragile fraud" label is hidden on day 1 and shown after the Kaden smear on day 2', () => {
  const fresh = new GameState({ seed: 1 });
  assert.equal(fresh.kadenSmearSeen, false);
  assert.equal(fresh.getWeekdayName(), 'Thursday');
  // The label must stay hidden until advanceDay fires the smear.
  assert.equal(!fresh.kadenSmearSeen || fresh.reputation >= 80, true, 'label hidden on day 1');
  fresh.advanceDay(); // journeys to day 2
  assert.equal(fresh.journeyDay, 2);
  assert.equal(fresh.kadenSmearSeen, true, 'Kaden smear fires on day 2 morning');
  assert.equal(fresh.reputation, 15);
  assert.equal(fresh.kadenSmearSeen && fresh.reputation < 80, true, 'label visible while smear is active');
});

test('"fragile fraud" label CSS lets the [hidden] attribute win and renders lower-case', () => {
  // The label's `.fragile-fraud { display: block }` (author origin) overrides
  // the browser's user-agent `[hidden] { display: none }`, which is what made
  // the slur leak onto day 1. jsdom's getComputedStyle cannot model that
  // cascade, so this asserts the CSS rules directly: there must be an author
  // rule forcing display:none on [hidden], and the label must not be
  // upper-cased.
  const css = readFileSync(new URL('docs/css/style.css', ROOT), 'utf8');
  assert.match(
    css,
    /\.fragile-fraud\[hidden\]\s*\{[^}]*display:\s*none/,
    '.fragile-fraud[hidden] must force display:none so the attribute beats the author display:block',
  );
  const fraudRule = css.match(/\.fragile-fraud\s*\{([\s\S]*?)\}/)?.[1] ?? '';
  assert.doesNotMatch(
    fraudRule,
    /text-transform:\s*uppercase/,
    'the label must render as lower-case "fragile fraud", not upper-cased',
  );
});

test('programmatically-focused headings hide their focus ring (no box on "Where will you spend today?")', () => {
  // The hub title is focused on every screen change for screen-reader
  // announcement (tabindex="-1", never in the Tab order). Without suppressing
  // the default outline that programmatic focus leaves a visible box around
  // "Where will you spend today?" on every load. Assert an author rule removes
  // the outline for these headings.
  const css = readFileSync(new URL('docs/css/style.css', ROOT), 'utf8');
  assert.match(
    css,
    /h2\[tabindex[^\]]*\]:focus[\s\S]*?outline:\s*none/,
    'headings focused for announcement must not show a default focus outline',
  );
});


test('Kaden smear story modal can preview Kaden, whose portrait asset exists', () => {
  // The smear modal renders Kaden's avatar at the top, exactly like the event
  // popups do. Both tiers of his portrait must exist so the avatar — and its
  // enlarge-on-tap lightbox — resolve.
  const gs = new GameState({ seed: 1 });
  const kaden = gs.getAllCharacters().find((c) => c.id === 'kaden');
  assert.ok(kaden, 'Kaden exists in the cast');
  assert.equal(kaden.role, 'arch_nemesis');
  assert.equal(existsSync(new URL('docs/assets/portraits/kaden.webp', ROOT)), true);
  assert.equal(existsSync(new URL('docs/assets/portraits/hi/kaden.webp', ROOT)), true);
});


