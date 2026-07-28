/**
 * Presentation tests — the rules the stylesheet has to keep.
 *
 * ## Why a test file for CSS
 *
 * jsdom has no layout engine, so these cannot assert rendered geometry. What
 * they *can* do is assert the **invariants the CSS is written around**, by
 * parsing the stylesheet as text. That is enough to catch the class of bug
 * that put them here:
 *
 * `.avatar` declared `width: 56px; height: 56px; flex: 0 0 42px`. Every place
 * an avatar appears is a flex row, where flex-basis wins on the main axis — so
 * portraits rendered 42x56 and `border-radius: 50%` drew a neat **oval**. No
 * test could see it, because every individual declaration was reasonable.
 *
 * The fix was to derive width, height and flex-basis from one custom
 * property. These tests exist to keep it that way: they fail if a variant
 * re-introduces a separate width/height/flex, which is the only way the oval
 * can come back.
 *
 * @see docs/DESIGN_PRINCIPLES.md — "One source of truth per visual dimension"
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const CSS = readFileSync(join(ROOT, 'docs', 'css', 'style.css'), 'utf8');

/** Extract the body of a top-level rule, e.g. `.avatar { … }`. */
function ruleBody(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = CSS.match(new RegExp(`(^|\\n)${escaped}\\s*\\{([^}]*)\\}`));
  return match ? match[2] : null;
}

/** Every avatar variant that sets its own size. */
const AVATAR_VARIANTS = [
  '.avatar',
  '.detail-avatar',
  '.host-avatar',
  '.host-avatar-lg',
  '.event-avatar',
];

// ================================================== portraits stay circular

test('every avatar variant sizes itself through --avatar-size', () => {
  for (const selector of AVATAR_VARIANTS) {
    const body = ruleBody(selector);
    assert.ok(body, `${selector} should exist in the stylesheet`);
    assert.match(
      body,
      /--avatar-size:\s*\d+px/,
      `${selector} must set --avatar-size rather than raw dimensions`,
    );
  }
});

test('no avatar variant declares its own width, height or flex-basis', () => {
  // This is the regression guard for the oval bug. A variant that sets width
  // and flex separately can desynchronise them again, and the result is only
  // visible to a human looking at a flex row.
  for (const selector of AVATAR_VARIANTS.filter((s) => s !== '.avatar')) {
    const body = ruleBody(selector);
    assert.doesNotMatch(body, /(^|\s|;)width:/, `${selector} must not set width directly`);
    assert.doesNotMatch(body, /(^|\s|;)height:/, `${selector} must not set height directly`);
    assert.doesNotMatch(body, /(^|\s|;)flex:/, `${selector} must not set flex directly`);
  }
});

test('the base avatar derives all three dimensions from the one property', () => {
  const body = ruleBody('.avatar');
  assert.match(body, /width:\s*var\(--avatar-size\)/, 'width must come from --avatar-size');
  assert.match(body, /height:\s*var\(--avatar-size\)/, 'height must come from --avatar-size');
  assert.match(body, /flex:\s*0 0 var\(--avatar-size\)/, 'flex-basis must come from --avatar-size');
  assert.match(body, /border-radius:\s*50%/, 'avatars are circles');
  assert.match(body, /aspect-ratio:\s*1\s*\/\s*1/, 'a square box cannot render as an oval');
});

// ============================================ side characters read clearly

test('portraits of people in a location are the prominent ones', () => {
  // The host banner and the day-result event card are the two places a side
  // character has a face in front of the player. Both were bumped ~10% so
  // they carry the screen rather than sitting under the effect chips.
  const size = (selector) => {
    const body = ruleBody(selector);
    const match = body && body.match(/--avatar-size:\s*(\d+)px/);
    return match ? Number(match[1]) : null;
  };

  const host = size('.host-avatar-lg');
  const event = size('.event-avatar');
  const listRow = size('.avatar');

  assert.ok(host >= 57, `host portrait should be at least 57px, is ${host}`);
  assert.ok(event >= 52, `event portrait should be at least 52px, is ${event}`);
  assert.ok(
    host > listRow && event > listRow,
    'a person you are meeting should read larger than a row in a list',
  );
  // The two "meeting someone" contexts should stay close to each other: it is
  // the same character, and a jump between them looks like a mistake.
  assert.ok(
    Math.abs(host - event) <= 8,
    `host (${host}px) and event (${event}px) portraits should be comparable`,
  );
});

// ==================================================== accessibility helpers

test('the visually-hidden helper hides without removing from the tree', () => {
  const body = ruleBody('.visually-hidden');
  assert.ok(body, 'a visually-hidden utility should exist for the document h1');
  assert.doesNotMatch(
    body,
    /display:\s*none/,
    'display:none would hide it from screen readers too',
  );
  assert.doesNotMatch(
    body,
    /visibility:\s*hidden/,
    'visibility:hidden hides it from screen readers',
  );
  assert.match(body, /position:\s*absolute/);
});

test('the skip link becomes visible when focused', () => {
  assert.ok(ruleBody('.skip-link'), 'a skip link style should exist');
  const focused = ruleBody('.skip-link:focus');
  assert.ok(focused, 'the skip link must reveal itself on focus or it is useless');
  assert.match(focused, /left:\s*0/);
});

test('reduced motion is still respected', () => {
  assert.match(CSS, /@media \(prefers-reduced-motion: reduce\)/, 'the media query must survive');
});

// ============================================================ asset budget

test('the asset budget gates on what a player actually downloads', () => {
  // Roadmap 1.1. The eager and on-demand tiers used to share an 8 MB ceiling,
  // which left 17 KB of headroom while one new character costs ~72 KB —
  // adding a single person to the cast failed the build for a reason
  // unrelated to page weight. The eager tier keeps a hard cap; the lightbox
  // tier is capped per file and reported in aggregate.
  const script = readFileSync(join(ROOT, 'scripts', 'check-assets.js'), 'utf8');
  assert.match(script, /MAX_EAGER_BYTES/, 'the eager tier must have a hard budget');
  assert.match(script, /MAX_HI_FILE_BYTES/, 'hi sheets must be capped per file');
  assert.doesNotMatch(
    script,
    /if \(total > MAX_TOTAL_BYTES\)/,
    'the summed payload must not be a build gate — see roadmap 1.1',
  );
  assert.match(
    script,
    /budget: room for/,
    'the check should report remaining content headroom, not just pass or fail',
  );
});
