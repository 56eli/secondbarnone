# Development roadmap

The single ordered list of what is **not** done, with the reasoning attached.
If you defer something, add it here rather than to a comment nobody greps for.

- **How the game is built and why:** [docs/DESIGN_PRINCIPLES.md](docs/DESIGN_PRINCIPLES.md)
- **What the game is:** [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md)
- **The audit this list came from:** [TECHNICAL_REVIEW.md](TECHNICAL_REVIEW.md)

> **Status after the accessibility/audio pass (v2.5.0)**
> 445 tests, fast gate 330 tests, CI workflow written (needs one command to
> activate — see `docs/ci/README.md`).
> Tier 1 is complete. Tier 2 accessibility settings are in, People navigation
> is a real listbox interaction, and rare-event/page-turn audio cues now sit
> behind the existing volume control.

---

## How to use this list

Items are ordered by **(player impact ÷ effort)** within each tier. Tier 2 is
the next milestone. Anything marked **⚠️ blocked** has a stated prerequisite
that must be resolved first — usually the asset budget.

Each item states the problem, not just the task, so that a future agent can
disagree with the solution and still solve the right thing.

---

## Tier 1 — completed in this pass

The July 2026 Tier 1 pass is now implemented. The long-term call was to keep
the game's breadth, but make the systems expose it rather than adding more
writing nobody sees.

- **Asset budget unblocked.** `scripts/check-assets.js` now reports separate
  eager and on-demand portrait tiers. The eager payload has roughly 305 KB of
  headroom; hi-res portrait sheets remain advisory because they load only when
  tapped.
- **Founding pair have unique jobs.** The bar is crisis money: when Léon is
  already near empty, Last Orders pays a little extra at a sanity cost. La
  Maison Calme is the only source of resilience, a capped buffer that absorbs
  random-event losses and nothing else.
- **Content consumption improved.** Event cadence is 1–3 days, with per-run and
  cross-run novelty weighting so extra slots meet new people first. Rent
  escalation is stronger to keep the extra event economy from making runs
  easier.
- **Relationship layer is real.** `minAffinity` gates events, and nine hosts
  have earned fourth beats. Affinity remains a plain counter, but it now opens
  content instead of only labelling the People screen.
- **Real endings.** Day 60 unlocks “Rest here” on the hub. Endings are
  `outcome × shape`: retired / out of sanity / out of money, plus nine shapes
  derived from how the run was played. The almanac counts down to the rest.

## Tier 2 — in progress

### 2.1 ✅ Accessibility settings

Implemented: text size, high contrast, non-colour stat bars, a reduced-motion
toggle independent of OS settings, and arrow-key navigation with
`aria-activedescendant` on the People listbox.

### 2.2 Audio beyond one piano loop

Partly implemented: rare-helpful, rare-hurtful and page-turn cues are generated
with Web Audio and obey the existing volume slider. Still wanted: per-location
ambience and converting the 133 KB WAV loop to Opus.

### 2.3 Downside events are unevenly distributed

Only **9 rare-hurtful events across 7 of 23 locations**; 16 locations have no
downside at all. Three of the nine are at `house_of_middleway`, which makes
Brian's welcoming chapel the most dangerous place in the game — an artefact of
authoring, not a design decision. Aim for at least one per location.

### 2.4 Nothing new arrives after day 22

The last location unlocks on **day 20** and the last event gate is
`minimumDay: 22`. The world stops opening 38 days before the endurance goal.
Gate three or four locations behind days 30–50, and extend the Kaden arc (which
is exactly the right shape and stops at day 18).

### 2.5 Dead content

`soup_kitchen` is picked **0.3%** of the time — 9 events and 3 portraits of
effectively unreachable content. Either re-price it or move its residents.

### 2.6 Localisation through message keys

Paris stays; French fluency should not be a prerequisite for reading location
names. Data files and a message-key layer, per the original roadmap.

---

## Tier 3 — technical sustainability

### 3.1 Content authoring tooling

Adding one location means coordinated edits across six files and six images,
with a red test suite as the error message. Wanted:

- `scripts/new-location.js` — scaffolds the location, three character stubs,
  nine event stubs and the asset placeholders.
- `scripts/validate-content.js` — duplicate ids, missing hosts, unreachable
  events, orphaned rewards, and a **budget projection** before the commit.

### 3.2 Repository weight

`.git` is **178 MB** for an 8 MB game. `assets/` holds 165 MB of source PNGs
tracked without LFS. Cloning to fix a typo costs 178 MB.

- Migrate `assets/` to Git LFS or an external bucket.
- **Four superseded background masters (7.7 MB)** are still tracked: `bar.png`,
  `spiritual_community.png`, `public_library.png`, `river_walk.png` — replaced
  by `paris_*` variants with no deployed counterpart.
- **57 orphaned SVG portraits** remain after the procedural-avatar removal.
- **16 of 78 characters have no source PNG**, so their deployed WebP cannot be
  rebuilt by `npm run assets`. This is the same bug the July pass fixed for
  `free_clinic` and `home_loft`, back for a fifth of the cast.

### 3.3 Test suite performance

Now tiered (`test:fast` is ~3s for 330 rules tests). The remaining ~117s is
almost entirely jsdom boot cost in `ui`, `dom` and `accessibility`, each of
which constructs a fresh DOM per test. Sharing one JSDOM per file, with a reset
between tests, would cut it substantially.

### 3.4 Mutation testing

The property tests in `tests/invariants.test.js` earn their keep, but nothing
verifies that the suite would *notice* a subtle change. A mutation run over
`core/` would tell us which assertions are load-bearing. Highest-risk targets:
turn order, save migration, rent arithmetic.

### 3.5 PWA

Zero build step, static assets, ~8 MB — this should be installable and playable
offline. Currently no manifest, no icon set beyond a portrait used as favicon,
no service worker.

### 3.6 Art direction sheet

Portrait lighting, crop, palette and a representation checklist, so batches
commissioned at different times stay coherent. The July pass had to repaint
four off-style portraits precisely because no such sheet existed.
`docs/side_characters_report.md` is the tracker; it needs the standard.

### 3.7 Consider a build step — but only if forced

A lightweight Vite build is worth it *only* if minification, asset hashing or
localisation makes the no-build workflow insufficient. The source being the
build is a genuine asset of this project. Preserve the pure core modules and
the deterministic seeded simulation either way.

---

## Known issues not yet fixed

Things that are understood, reproduced and deliberately not addressed yet.

| Issue | Impact | Notes |
| --- | --- | --- |
| 16 characters have no source PNG | Art cannot be rebuilt | See 3.2 |
| Weather closes a card 0.2% of the time | Weather is near-pure flavour | Tag closure almost never fires; the modifiers are below variance noise |
| Reputation is inert after day 20 | Gates five locations, then only two achievements | Fold into 2.4 |
| `{friend}` substitution used once | One event, `old_friend_calls` | Pool is all 77 non-Léon characters, so "an old friend" can be Kaden. Filter to side characters |
| Perk tooltips are fiction | Minor trust issue | `Estimated: reachable ~day N` is `cost/1.2 + requires*5`, not a projection |
| 55 of 78 characters have no small talk | Only the 23 hosts speak outside events | Fold into future relationship work |
| Single save slot | Data loss risk | Mitigated by export/import in Settings; named slots still wanted |
| `LOCATION_COPY`, `applyLocationAction`, `applyEventDeltas` are dead | ~60 lines | Retained only because tests reference them — tests dictating production shape |

---

## Changelog of roadmap items completed


**v2.5.0 — Accessibility and audio pass**

- ✅ Text size setting
- ✅ High contrast setting
- ✅ Non-colour stat-bar mode with patterns and numeric labels
- ✅ Reduced-motion toggle independent of OS settings
- ✅ People listbox arrow-key navigation with `aria-activedescendant`
- ✅ Web Audio cues for rare-helpful, rare-hurtful and page-turn moments

**v2.4.0 — Tier 1 systems pass**

- ✅ Event cadence 2–5 → 1–3 days
- ✅ Per-run and cross-run novelty weighting for events
- ✅ `minAffinity` event gates
- ✅ Nine host fourth beats earned through repeated visits
- ✅ Community resilience buffer against random-event losses
- ✅ Bar Last Orders crisis-money role
- ✅ Optional day-60 “Rest here” ending
- ✅ Ending outcome × shape summary
- ✅ Save schema v7 with visit counts, resilience and ending state
- ✅ Asset budget split into eager and on-demand tiers

**v2.3.0 — July 2026 systems pass**

- ✅ Save-state refresh exploit (P0) — days are atomic in `resolveTurn()`
- ✅ Rent prepay double-cover (P0) — exclusive bound, per-Sunday pricing
- ✅ Bulk-prepay escalation dodge (found while fixing the above)
- ✅ Almanac forecast wrong across season boundaries
- ✅ Death hid the blow that caused it
- ✅ Mastery win unreachable and undiscoverable
- ✅ Insight had no sink after ~day 20 — observances added
- ✅ Rent did not escalate — pressure curve added, perks are now the counterplay
- ✅ Relationship state seeded — `affinity` tracked, saved and displayed
- ✅ Modal focus traps, Escape, focus restoration
- ✅ Destructive reset now confirms
- ✅ Save export/import in Settings
- ✅ Legacy save keys pruned on migration
- ✅ Document `<h1>` and skip link
- ✅ Triplicated weather-emoji string-matching removed
- ✅ Audio default 0% → 50%
- ✅ Oval portraits (flex-basis desync)
- ✅ Location portraits ~10% larger
- ✅ Test tiers, property-based tests, exploit regression suite
- 🟡 CI workflow written but **not active** — the automation account cannot
  create `.github/workflows/**`. One `git mv` enables it; see
  [docs/ci/README.md](docs/ci/README.md). **Do this first.**
