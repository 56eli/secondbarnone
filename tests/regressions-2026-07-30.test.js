import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

import { GameState } from '../docs/js/core/game-state.js';
import { EventManager } from '../docs/js/core/event-manager.js';
import { createRng } from '../docs/js/core/rng.js';
import { buildEventPool, eventsForCharacter } from '../docs/js/data/events.js';
import { createAllProfiles } from '../docs/js/data/characters.js';
import { LOCATIONS } from '../docs/js/data/locations.js';
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
