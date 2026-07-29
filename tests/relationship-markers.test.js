import test from 'node:test';
import assert from 'node:assert/strict';
import { GameState } from '../docs/js/core/game-state.js';
import { getRelationshipMarker } from '../docs/js/ui/screens.js';
import { createAllProfiles } from '../docs/js/data/characters.js';

test('getRelationshipMarker reports first meeting pending for unmet antagonist', () => {
  const gs = new GameState();
  const profiles = createAllProfiles();
  const sato = profiles.find((p) => p.id === 'sato');
  assert.equal(getRelationshipMarker(gs, sato), 'First meeting pending');
});

test('getRelationshipMarker updates when antagonist event is recorded', () => {
  const gs = new GameState();
  const profiles = createAllProfiles();
  const sato = profiles.find((p) => p.id === 'sato');

  gs.recordEventSeen({ id: 'sato_offer', character: 'sato' });
  assert.equal(getRelationshipMarker(gs, sato), 'Acquainted · First conversation');

  gs.recordEventSeen({ id: 'sato_truce', character: 'sato' });
  assert.equal(getRelationshipMarker(gs, sato), 'Arc deepening · Second beat fired');
});

test('getRelationshipMarker reports standard status for side characters', () => {
  const gs = new GameState();
  const profiles = createAllProfiles();
  const brock = profiles.find((p) => p.id === 'brock_lee');
  assert.equal(getRelationshipMarker(gs, brock), 'Unmet in conversation');

  gs.recordEventSeen({ id: 'brock_lee_puns', character: 'brock_lee' });
  assert.equal(getRelationshipMarker(gs, brock), 'First conversation had');
});
