import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BAND_STRONG,
  locationFocusResources,
  observablePreview,
  previewBand,
  previewMode,
} from '../docs/js/core/preview.js';
import { getLocation } from '../docs/js/data/locations.js';

test('preview modes are one shared weather contract', () => {
  assert.equal(previewMode({ id: 'clear' }), 'exact');
  assert.equal(previewMode({ id: 'rain' }), 'banded');
  assert.equal(previewMode({ id: 'snow' }), 'banded');
  assert.equal(previewMode({ id: 'fog' }), 'veiled');
});

test('rain and snow expose direction and scale without exact arithmetic', () => {
  assert.equal(previewBand(0), '');
  assert.equal(previewBand(1), '+');
  assert.equal(previewBand(BAND_STRONG), '++');
  assert.equal(previewBand(-1), '-');
  assert.equal(previewBand(-BAND_STRONG), '--');

  const observed = observablePreview(
    { id: 'rain' },
    { sanity: 14, money: -8, energy: -2, reputation: 1, insight: 0 },
    'spiritual_community',
  );
  assert.equal(observed.mode, 'banded');
  assert.deepEqual(observed.bundle, {
    sanity: BAND_STRONG,
    money: -BAND_STRONG,
    energy: -1,
    reputation: 1,
    insight: 0,
  });
  assert.notEqual(observed.bundle.sanity, 14, 'the exact average must remain hidden');
});

test('fog exposes only the location focus and no costs', () => {
  const bar = getLocation('bar');
  const focus = locationFocusResources(bar);
  const observed = observablePreview({ id: 'fog' }, bar.effects, bar);

  assert.equal(observed.mode, 'veiled');
  assert.deepEqual(
    observed.focus.map((entry) => entry.key),
    ['money'],
  );
  assert.deepEqual(observed.bundle, {
    sanity: 0,
    money: 1,
    energy: 0,
    reputation: 0,
    insight: 0,
  });
});

test('ordinary weather preserves the honest adjusted average', () => {
  const total = { sanity: 7, money: -4, energy: 2, reputation: 1, insight: 0 };
  const observed = observablePreview({ id: 'clear' }, total, 'home_loft');
  assert.equal(observed.mode, 'exact');
  assert.deepEqual(observed.bundle, total);
});
