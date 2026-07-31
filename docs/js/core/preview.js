/**
 * Player-observable location previews.
 *
 * This module is deliberately DOM-free and shared by the browser UI and the
 * balance simulator. A model must never make decisions from arithmetic the
 * player cannot see:
 *
 * - clear/ordinary weather exposes the adjusted average;
 * - rain and snow expose only weak/strong signed bands;
 * - fog exposes only a location's strongest positive focus.
 */

import { getLocation } from '../data/locations.js';

export const PREVIEW_RESOURCES = Object.freeze([
  Object.freeze({ key: 'sanity', emoji: '🧘', label: 'Sanity' }),
  Object.freeze({ key: 'money', emoji: '💰', label: 'Money' }),
  Object.freeze({ key: 'energy', emoji: '⚡', label: 'Energy' }),
  Object.freeze({ key: 'reputation', emoji: '🤝', label: 'Rep' }),
  Object.freeze({ key: 'insight', emoji: '🔮', label: 'Insight' }),
]);

/** |delta| at or above this renders as the double band. */
export const BAND_STRONG = 6;

/** How much arithmetic today's weather lets the player observe. */
export function previewMode(weather) {
  if (weather?.id === 'fog') return 'veiled';
  if (weather?.id === 'rain' || weather?.id === 'snow') return 'banded';
  return 'exact';
}

/** Convert a numeric delta into the qualitative band shown by the UI. */
export function previewBand(value) {
  const v = Math.round(value ?? 0);
  if (v === 0) return '';
  if (Math.abs(v) >= BAND_STRONG) return v > 0 ? '++' : '--';
  return v > 0 ? '+' : '-';
}

/**
 * A location's clearest positive purpose, derived from its base contract.
 * Resources within two points of the strongest gain are peers.
 */
export function locationFocusResources(locationOrId) {
  const location = typeof locationOrId === 'string' ? getLocation(locationOrId) : locationOrId;
  if (!location) return [];
  const positive = PREVIEW_RESOURCES.map(({ key, emoji, label }) => ({
    key,
    emoji,
    label,
    value: location.effects[key] ?? 0,
  })).filter((entry) => entry.value > 0);
  if (positive.length === 0) return [];
  const strongest = Math.max(...positive.map((entry) => entry.value));
  return positive.filter((entry) => entry.value >= strongest - 2);
}

const emptyBundle = () => ({ sanity: 0, money: 0, energy: 0, reputation: 0, insight: 0 });

/**
 * Convert the honest numeric average into exactly the information visible to a
 * player. `bundle` is a scoring representation, not hidden arithmetic:
 * qualitative bands become +/-1 or +/-6 and fog focus icons become +1.
 */
export function observablePreview(weather, total, locationOrId) {
  const mode = previewMode(weather);
  const bundle = emptyBundle();

  if (mode === 'exact') {
    for (const { key } of PREVIEW_RESOURCES) bundle[key] = total?.[key] ?? 0;
    return { mode, bundle, focus: [] };
  }

  if (mode === 'banded') {
    for (const { key } of PREVIEW_RESOURCES) {
      const band = previewBand(total?.[key]);
      bundle[key] =
        band === '++'
          ? BAND_STRONG
          : band === '+'
            ? 1
            : band === '--'
              ? -BAND_STRONG
              : band === '-'
                ? -1
                : 0;
    }
    return { mode, bundle, focus: [] };
  }

  const focus = locationFocusResources(locationOrId);
  for (const entry of focus) bundle[entry.key] = 1;
  return { mode, bundle, focus };
}
