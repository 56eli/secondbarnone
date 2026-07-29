# Development roadmap

The single ordered list of what is **not** done, with the reasoning attached.
If you defer something, add it here rather than to a comment nobody greps for.

- **How the game is built and why:** [docs/DESIGN_PRINCIPLES.md](docs/DESIGN_PRINCIPLES.md)
- **What the game is:** [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md)
- **The audit this list came from:** [TECHNICAL_REVIEW.md](TECHNICAL_REVIEW.md)

> **Status after the late-run, tooling and PWA passes (v2.7.0)**
> 473 tests, fast gate 353 tests, full suite ~58 s. **Tier 2 is complete**;
> Tier 3 is complete except CI activation (one maintainer command — see
> `docs/ci/README.md`) and the standing build-step question (3.7).
> The world is 25 locations / 78 characters / 266 events, and the last
> unlocks land on days 28–44. Owner's standing rule: character additions are
> repo-owner discretion — new ground is staffed by re-binding the existing
> cast ([docs/DESIGN_PRINCIPLES.md](docs/DESIGN_PRINCIPLES.md) §4.3).

---

## How to use this list

Items are ordered by **(player impact ÷ effort)** within each tier. Tiers 1–2
are done; Tier 3's remaining work is a maintainer action (CI) and a standing
question (3.7). Anything marked **⚠️ blocked** has a stated prerequisite
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

## Tier 2 — completed

### 2.1 ✅ Accessibility settings

Implemented: text size, high contrast, non-colour stat bars, a reduced-motion
toggle independent of OS settings, and arrow-key navigation with
`aria-activedescendant` on the People listbox.

### 2.2 ✅ Audio beyond one piano loop

Done at the scope the game needs today. Rare-helpful, rare-hurtful and
page-turn cues are Web-Audio generated behind the existing volume slider
(v2.5), and the piano loop sits in the service-worker precache, so music
survives offline (3.5). Deliberately deferred, with reasons:

- **Per-location ambience** is a music-direction call, not an engineering
  one — folded into any future audio pass.
- **Opus re-encode of the 133 KB WAV loop** — there is no encoder in this
  dev environment, and committing a binary converted elsewhere would break
  the rule that `npm run assets` reproduces every deployed asset, to save
  ~100 KB on a one-time fetch the service worker now caches. Revisit if an
  encoder joins the toolchain.

### 2.3 ✅ Downside events are evenly distributed

Fixed in v2.6: **26 rare-hurtful events across all 25 locations**, at least
one per place — `scripts/validate-content.js` fails if any location loses its
bad day, and `tests/cast.test.js` requires every rare-hurtful to net the
player negative. The three-event pile-up at `house_of_middleway` is
redistributed: Ethan's dropping-out and the bar fight stay, the
spiritual-crisis beat moved to the mines with the cast it belongs to.

### 2.4 ✅ Content arrives to day 44+

Fixed in v2.6/v2.7. The last unlocks are now **day 28** (Les Mines de la
Butte, reputation 20) and **day 44** (Le Clos Bénévole, reputation 45).
Events gained a **`minReputation`** gate alongside `minimumDay`, and four
beats are gated at representative days 40–70 (`iulian` 55, `lakshay` 60/40,
`blokely` 60/46, `kopung` 70). The validator reports 2 locations and 24
events arriving at/after day 25. **Not done, on purpose:** the Kaden-arc
extension sketched here was not written — the day-30+ window is served by
the new locations and gated beats instead. If Kaden's employment arc should
grow, that is new authoring and follows the owner's cast rule (§4.3 of the
design principles).

### 2.5 ✅ Dead content repriced

Fixed in v2.6: the soup kitchen was **re-priced, not relocated** —
`eff(10, 0, -20, 4, 1)`. The cost (a full day's energy) is unchanged; the
reward now matches the work: service restores you, the crew meal means no
money changes hands, and the nine events and three portraits are reachable on
a sane pick. The mines are the dedicated reputation engine; the kitchen is
the restorative for when the spirit, not the ledger, is flagging.

### 2.6 ✅ Localisation — English glosses shipped, message keys deferred

**Shipped slice:** a `gloss` field on locations. The ten French names an
English-only reader cannot parse carry English glosses rendered under the
name on hub cards (locked ones included) and the location screen —
`tests/world.test.js` pins the glossed set, so a new French-named location
without a gloss fails the suite. Proper place names (Père Lachaise,
Fontainebleau, Saint-Denis) are unglossed by design.

**Deferred, consciously:** the full message-key layer. The game has one
locale and 266 authored prose events; key indirection without a second
language taxes every future content edit for zero players. The `gloss` field
is the seam a key layer would plug into: user-facing strings live in data
and render through one place in `screens.js`, so extracting per-locale
modules later is a bounded job, not an archaeology dig.

---

## Tier 3 — technical sustainability

### 3.1 ✅ Content authoring tooling

Shipped. `scripts/new-location.js` scaffolds a location end to end — the
location entry, cast re-binding, event stanzas moved with the residents, a
placeholder background, then prettier and the validator. Per the owner's
standing rule it only **re-binds existing cast**: it refuses unknown
character ids, and refuses donor spreads that would drop a location below
three residents. `scripts/validate-content.js` lints the catalogue (duplicate
ids, missing hosts, unprotected locations, orphaned assets) and prints an
**eager-budget projection** before you commit. Both run in `npm run check`.

### 3.2 ✅ Repository weight — cleaned what can be cleaned without a history rewrite

- **Deleted:** the 57 orphaned SVG portraits and 14 superseded background
  masters (`bar`, `spiritual_community`, `public_library`, `river_walk` plus
  six stale no-PNG WebP siblings). `assets/` went **169 → 161 MB**.
- **This roadmap's claim was wrong, corrected here:** the "16 characters with
  no source PNG" always had masters — original 512×512 WebP paintings
  committed at `assets/portraits/<id>.webp`, which `scripts/build-portraits.js`
  now sources from. The genuine residual gap: that batch has no ≥1024px
  masters, so their lightbox tier caps at 512px. That is an art commission
  (repaint), tracked in `docs/side_characters_report.md` — not a pipeline bug.
- **Not done, recorded here on purpose:** the Git LFS migration. It would
  move 161 MB out of object history, which means **rewriting every published
  commit** and breaking every existing clone — a maintainer decision with a
  maintenance window, not an agent pass. `.git` stays ~180 MB until then.
  The instruction above stands: "if you defer something, add it here".

### 3.3 ✅ Test suite performance

`initGame` gained an `instantTransitions` option (screen changes settle in
0 ms instead of the player-facing 350 ms fade) and every jsdom suite uses it,
with settle windows cut 480 → 80 ms. Measured: **dom 38 → 11 s, ui 51 → 17 s,
full suite 127 → 58 s**; the fast gate stays ~3 s. Sharing one JSDOM per file
was considered and **deliberately rejected**: the app's timers (music, cue
throttles, transitions) leak across tests in a shared realm and made the
suite flaky in earlier passes; a deterministic boot plus the transition hook
gets most of the win with none of the pollution. The remaining ~40 s is real
jsdom boot cost, amortised across 100 UI tests.

### 3.4 ✅ Mutation testing

`scripts/mutation-test.js` plants nine hand-written mutants at the
highest-risk points — turn order, save migration, rent arithmetic, event
gates, friend pool, energy recovery — and runs the suites that should kill
each one. First run: **5/9 killed**; the four survivors were genuine gaps and
each is now closed:

1. `migrateSave()` gated on the *post-migration* version, which is always
   current — a vacuous check. It now rejects unknown **input** versions, and
   a v3 fixture test walks the whole chain to v7.
2. The rent schedule had no literal test (18, +4 per 14 days from day 15,
   cap 42) — added to `tests/progression.test.js`.
3. Variance sign was unasserted — a locations × days × seeds sweep now pins
   every variance key's clamp behaviour in `tests/world.test.js`.
4. No legacy fixture existed — see (1).

The harness now reports **9/9 killed**. Run it with `npm run test:mutation`.
It is deliberately **not** wired into `npm run check`: it mutates source
files on disk and refuses a dirty tree, so it is a periodic/manual (or
CI-nightly) gate rather than a per-commit one.

### 3.5 ✅ PWA

Shipped. `docs/manifest.webmanifest` (standalone, **relative** `id`/
`start_url`/`scope` so the GitHub Pages subpath deploy works), a five-icon
set derived from the 1024px Léon master on the theme colour (maskable
variants keep the portrait inside the OS crop's safe zone), and `docs/sw.js`:
a versioned shell precache covering the whole static import graph plus the
music loop, network-first navigations with shell fallback, and
stale-while-revalidate for portraits/backgrounds/icons behind a 250-entry
runtime cap. The asset budget gained an **install tier** (icons, 235 KB)
outside the eager figure, with per-file caps. `tests/pwa.test.js` pins the
contract — including that the sw cache version equals `package.json`'s
version, because with no build step and no asset hashing that string is the
only thing that retires stale code. **Honest limit:** offline play is
guaranteed for the shell and any asset viewed once; a first-ever visit still
needs the network, because precaching 8 MB of art at install would tax the
first load for a case most players never hit.

### 3.6 ✅ Art direction sheet

Shipped as `docs/ART_DIRECTION.md`: lighting, crop, palette, the
representation checklist, and the named exception — the mines are the one
lamp-lit underground scene under the daylight rule, enforced by a named
exception map in `tests/portrait-assets.test.js`. The sheet exists precisely
because the July pass had to repaint four off-style portraits blind.

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
| 16 of 78 characters have only 512×512 masters | Their lightbox tier caps at 512px | The earlier "no source art" claim was wrong — masters were tracked all along (see 3.2). A repaint commission is the fix; tracked in `docs/side_characters_report.md` |
| Weather modifiers sit below daily variance noise | Weather reads as flavour with teeth only via closures | Closures have been visible on the hub since v2.6; strengthening the modifiers is a balance pass, deliberately not bundled into 2.4 |
| 53 of 78 characters have no small talk | Only the 25 location hosts speak outside events | Fold into future relationship work |

---

## Changelog of roadmap items completed

**v2.7.0 — Late-run world, honest tooling, PWA**

> The package version jumps 2.5.0 → 2.7.0: this work was developed as two
> halves on one branch — "v2.6" (distribution, pricing and honesty fixes) and
> "v2.7" (the mines, save slots, glosses, PWA) — and ships together. Code
> comments keep both labels for archaeology.
>
> Tier 2 items here close Tier 2; the Tier 3 items close everything except
> CI activation and the standing 3.7 question.

- ✅ Issue #16 — **Les Mines de la Butte**, the dedicated late-game
  reputation grind: unlocks day 28 + reputation 20, +14 standing a day at a
  bar-shift's energy cost, staffed by **re-binding the existing cast** (owner
  rule: character additions are repo-owner discretion)
- ✅ Le Clos Bénévole — late-game garden, unlocks day 44 + reputation 45,
  deliberately not a standing engine
- ✅ 2.3 — 26 rare-hurtful events, ≥1 per location, validator-enforced
- ✅ 2.4 — `minReputation` event gate; four rep-gated beats at days 40–70;
  24 events arrive at/after day 25
- ✅ 2.5 — soup kitchen repriced to the working restorative of the Home
  Quarter
- ✅ 2.6 — English glosses for the ten French location names; full
  message-key layer deferred with rationale
- ✅ 2.2 — closed at existing scope; Opus encode and per-location ambience
  deferred with rationale
- ✅ Three named save slots — rename, switch, erase — in Settings; save
  envelope gains `savedAt`; migration rejects unknown **input** versions
- ✅ `{friend}` events draw from side characters only; perk tooltips tell
  the truth; dead exports removed (`LOCATION_COPY`, `applyLocationAction`,
  `applyEventDeltas`, dead delta constants)
- ✅ 3.1 — `new-location.js` + `validate-content.js` with budget projection
- ✅ 3.2 — 57 orphaned SVGs and 14 superseded masters deleted; "no source
  PNG" claim corrected; assets 169 → 161 MB; LFS recorded as a maintainer
  decision
- ✅ 3.3 — full suite 127 s → 58 s; fast gate ~3 s for 353 tests
- ✅ 3.4 — mutation harness, 9/9 killed; 4 real gaps found and closed
- ✅ 3.5 — PWA: manifest, icon set, versioned service worker, install tier
  in the asset budget
- ✅ 3.6 — `docs/ART_DIRECTION.md`
- 🟡 CI still needs the one-time maintainer command —
  [docs/ci/README.md](docs/ci/README.md). Nothing else stands between commit
  and green.

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
