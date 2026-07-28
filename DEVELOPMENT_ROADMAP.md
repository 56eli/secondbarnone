# Development roadmap

The single ordered list of what is **not** done, with the reasoning attached.
If you defer something, add it here rather than to a comment nobody greps for.

- **How the game is built and why:** [docs/DESIGN_PRINCIPLES.md](docs/DESIGN_PRINCIPLES.md)
- **What the game is:** [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md)
- **The audit this list came from:** [TECHNICAL_REVIEW.md](TECHNICAL_REVIEW.md)

> **Status after the July 2026 systems pass (v2.3.0)**
> 439 tests, 99.0% line coverage, CI workflow written (needs one command to
> activate — see `docs/ci/README.md`).
> Four correctness bugs fixed (save exploit, rent double-cover, forecast
> season, hidden death cause). Rent now escalates, insight has a permanent
> sink, affinity tracks who you know, mastery is reachable and discoverable.

---

## How to use this list

Items are ordered by **(player impact ÷ effort)** within each tier. Tier 1 is
the next milestone. Anything marked **⚠️ blocked** has a stated prerequisite
that must be resolved first — usually the asset budget.

Each item states the problem, not just the task, so that a future agent can
disagree with the solution and still solve the right thing.

---

## Tier 1 — next milestone

### 1.1 ⚠️ Resolve the asset budget before adding any content

**Problem.** `scripts/check-assets.js` hard-fails above 8 MB total and the
current payload is 7.98 MB. **Adding a single character breaks the build**
(~72 KB: 15 KB thumbnail + 57 KB hi-res). One new location with its three
required residents is ~305 KB against 17 KB of headroom.

This blocks open issue #16 ("LOC mines" location) and every content item below.

**Options, cheapest first:**

1. **Exclude `portraits/hi/` from the total cap** and give it a per-file limit
   instead. It is lazy-loaded and does not affect first paint, so capping it
   with the eager payload conflates two different costs. The eager budget
   (3.62 MB against 4 MB) is the one that matters and has real headroom.
2. Re-encode the hi tier at AVIF or lower WebP quality. ~57 KB → ~30 KB
   average would free ~2 MB.
3. Convert `warm-piano-loop.wav` (133 KB) to Opus (~15 KB).

Option 1 is correct — the budget should measure what a player actually
downloads — and options 2 and 3 are worth doing anyway.

### 1.2 The founding pair are statistically abandoned

**Problem.** `spiritual_community` and `bar` — the two locations the game is
named around — account for **7.1% of days played** by a competent player.
Measured over 40 seeds × 120 days. `bar` scores dead last of 23 on utility
(−12.0); the community is strictly dominated by the bathhouse on every axis.

They were pinned to their original numbers for continuity and the 21 locations
layered on top were priced without re-pricing them.

**Options:**

- **(a)** Give each a mechanical role no other location has — the bar as the
  only place with no energy floor; the community as the only source of a
  carry-over "resilience" buffer. Keeps the premise.
- **(b)** Accept them as the tutorial pair and rewrite the framing in
  `README.md` and `PROJECT_OVERVIEW.md`, which currently promise a game about
  two places a competent player barely visits.

(a) is the better game; (b) is honest and free. Do not do neither.

### 1.3 Content consumption is ~7% per playthrough

**Problem.** 235 events exist; a 60-day run sees **~17**. The bottleneck is the
fixed 2–5 day scheduler — at one event per 3.6 days a 60-day run has ~17 slots
no matter how large the catalogue grows. 235 events is a large writing effort
being read by nobody.

**Options, cheapest first:**

1. Raise event frequency to every 1–3 days (~30 per run, 13%).
2. Add a second event slot on high-engagement days (markets, festivals, night
   work).
3. **Weight unseen events up per save**, so a returning player meets new people
   rather than re-rolling the same nine at the bathhouse.
4. Persist "events seen" across runs and surface it — the standard genre answer
   to "we wrote 235 things and you will read 17".

(3) is the highest value for the effort and needs only a `seenEvents` set in
the save plus a weight multiplier in `EventManager._buildPool()`.

### 1.4 Finish the relationship layer

**Problem.** `affinity` now tracks how many times Léon has met each character,
and the People screen shows it — but **nothing gates on it**. 77 of 78
characters still have exactly three events, so the stated floor is also the
ceiling and the cast has breadth without depth.

**Work:**

- Add `minAffinity` to the event gate in `EventManager._buildPool()`.
- Write fourth/fifth events for a first cohort — the hosts are the obvious
  candidates, since a player who keeps returning to one location should get
  more of the person who keeps it.
- Show a "what changed" marker in People when a relationship crosses a
  threshold. `acquaintanceLabel()` in `ui/screens.js` already has the bands.
- Consider letting affinity affect `relationship` text, so the People screen
  stops being static.

The engine work is done; this is content plus a gate.

### 1.5 A real ending, and a way to reach it

**Problem.** `renderGameOver` is reachable **only by dying**. `checkWin()`
fires a toast and the run continues. A player who does everything right gets a
2.6-second toast, plays on until they eventually lose, and *then* sees a
summary titled "A Long Road Ended".

**Work:**

- A **"Rest here" / retire** action on the hub after the endurance goal.
- Endings differentiated by how the run was played. The data is already
  tracked: `visitedLocations`, `maxConsecutiveBarDays`, `nightDays`,
  `rentPaidCount`, `affinity`, `observancesKept`.
- At minimum: community-led, bar-led, wanderer, recluse. Ideally a line per
  major arc (Kaden, Sato, Alex) reflecting how it resolved.

---

## Tier 2 — depth without clutter

### 2.1 Accessibility settings

The semantic foundation is good and now tested. What is missing is everything
**user-controllable**:

- **Text size** and **high contrast** options.
- **A non-colour stat mode.** The bars encode status in hue alone —
  `bar-critical` red against `bar-full` green is invisible to a deuteranope.
  Add a shape, pattern or numeric badge.
- **A reduced-motion toggle** that does not require changing OS settings.
- **Arrow-key navigation and `aria-activedescendant`** on the People listbox.
  78 rows are currently 78 individual tab stops.

### 2.2 Audio beyond one piano loop

One 133 KB WAV on a volume slider (now defaulting to 50%, so it is at least
audible). A game about the texture of days wants: a distinct sting for
rare-helpful versus rare-hurtful events, a page-turn on day advance, and
per-location ambience. Keep it opt-in and behind the existing autoplay
handling. See 1.1 — converting the loop to Opus helps the budget.

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

Now tiered (`test:fast` is ~3s for 325 rules tests). The remaining ~117s is
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
| Asset budget has 17 KB headroom | **Blocks all content work** | See 1.1 |
| Founding pair at 7.1% of play | Premise vs reality mismatch | See 1.2 |
| ~7% of events seen per run | Most writing is never read | See 1.3 |
| 16 characters have no source PNG | Art cannot be rebuilt | See 3.2 |
| Weather closes a card 0.2% of the time | Weather is near-pure flavour | Tag closure almost never fires; the modifiers are below variance noise |
| Reputation is inert after day 20 | Gates five locations, then only two achievements | Fold into 2.4 |
| `{friend}` substitution used once | One event, `old_friend_calls` | Pool is all 77 non-Léon characters, so "an old friend" can be Kaden. Filter to side characters |
| Perk tooltips are fiction | Minor trust issue | `Estimated: reachable ~day N` is `cost/1.2 + requires*5`, not a projection |
| 55 of 78 characters have no small talk | Only the 23 hosts speak outside events | Fold into 1.4 |
| Single save slot | Data loss risk | Mitigated by export/import in Settings; named slots still wanted |
| `LOCATION_COPY`, `applyLocationAction`, `applyEventDeltas` are dead | ~60 lines | Retained only because tests reference them — tests dictating production shape |

---

## Changelog of roadmap items completed

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
