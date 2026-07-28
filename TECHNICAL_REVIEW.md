# secondbarnone — senior developer review

**Reviewed:** commit `c8eb48d` (branch `arena/019fa971-secondbarnone`, from `crazy-branch`)
**Date:** 28 July 2026

> ## ⚠️ This is a point-in-time audit, not a live document
>
> Most of the P0 and P1 findings below were **fixed in v2.3.0**, in the systems
> pass this review produced. The document is kept unedited as the evidence
> trail — the reasoning, measurements and reproductions that justified each
> change — and because several findings are still open.
>
> **For what is still outstanding, read
> [DEVELOPMENT_ROADMAP.md](DEVELOPMENT_ROADMAP.md).**
> **For the rules that came out of this, read
> [docs/DESIGN_PRINCIPLES.md](docs/DESIGN_PRINCIPLES.md).**
>
> | Finding | Status |
> | --- | --- |
> | Save-state refresh exploit | ✅ fixed — days are atomic in `resolveTurn()` |
> | Rent prepay double-cover | ✅ fixed — exclusive bound + per-Sunday pricing |
> | Mastery win unreachable | ✅ fixed — threshold retuned, progress shown in the almanac |
> | Forecast wrong across seasons | ✅ fixed — `forecast()` projects the calendar |
> | Death hides the killing blow | ✅ fixed — the fatal day is reported first |
> | Asset budget has 17 KB headroom | ❌ open — **blocks all content work**, roadmap 1.1 |
> | Modal focus traps / a11y | ✅ fixed — `inert`, Escape, focus restore, confirm-on-reset |
> | Repository hygiene | ❌ open — roadmap 3.2 |
> | Test suite performance | ✅ improved — tiered, 325 rules tests in ~3s |
> | No CI | 🟡 workflow written, needs activating — `docs/ci/README.md` |
> | No pressure curve | ✅ fixed — rent escalates, perks are the counterplay |
> | Insight has no sink | ✅ fixed — observances |
> | Founding pair abandoned | ❌ open — roadmap 1.2 |
> | ~7% content consumption | ❌ open — roadmap 1.3 |
> | Static relationships | 🟡 partial — affinity tracked and shown; no events gate on it yet |

**Scope:** architecture, code quality, content pipeline, simulated gameplay, accessibility, build & release.

Everything below was verified against the running code — `npm test` (371 pass), `npm run lint`,
`npm run typecheck`, `npm run format:check`, `node scripts/check-assets.js` all green — plus
headless simulations of thousands of in-game days and a jsdom drive-through of every screen.

---

## 1. What the game is

A single-choice-per-day narrative resource manager, shipped as vanilla ES modules served
statically from `docs/` via GitHub Pages. You play Léon, splitting days between a spiritual
community and a bar, keeping five resources alive across a 60-day soft-win arc.

| | |
|---|---|
| **Genre** | Daily-choice life-sim / narrative balance game |
| **Stack** | Vanilla ES modules, no build step, no framework, no dependencies at runtime |
| **Shipped code** | ~5,000 lines JS + 1,714 lines CSS + 134 lines HTML |
| **Content** | 23 locations · 78 characters · 235 events · 10 perks · 9 festivals · 9 weather types · 20 achievements |
| **Assets** | 3.62 MB eager + 4.36 MB on-demand portrait sheets |
| **Tests** | 371, ~99.5% line coverage, deterministic via a seeded RNG |
| **Deploy** | Push to `main`, GitHub Pages serves `/docs`. No CI. |

### Verdict up front

This is an unusually **well-engineered** small game. The core/data/ui separation is real and
enforced, the determinism story (seeded RNG + hashed weather + hashed variance) is genuinely
elegant, and the test suite asserts *properties* rather than snapshots. The documentation is
better than most commercial projects.

It is also a game with **a serious save-state exploit, a broken economy sink, an unreachable
win condition, and a content-to-consumption ratio of about 14:1**. The engineering is ahead of
the design. Section 5 is where the value is.

---

## 2. Architecture

### 2.1 The layering rule, and it holds

```
docs/js/
  main.js            3 lines — import, call, expose on window.__game
  app.js             wiring: HUD, screen swap, modal, toasts, autosave, game over
  core/
    balance.js       every tuning number, reasoning attached
    game-state.js    stats, calendar, perks, achievements, save/load
    event-manager.js scheduling + weighted selection
    turn.js          resolveTurn() — one day, fixed order
    rng.js           mulberry32, seedable
    resource-bar.js  one pure helper
  data/              characters, locations, events, weather, perks, festivals, achievements
  ui/screens.js      every renderer, returns DOM nodes
```

The stated invariant — **`core/` and `data/` contain no DOM references** — is true. I grepped
it; there are zero `document`/`window` references below `ui/`. This is why the test suite can
assert over the *entire* content catalogue headlessly instead of sampling it, and it's the
single best decision in the codebase.

Three specific things worth calling out as good:

**`computeDayEffects()` is shared between preview and resolution.** The hub card, the location
screen preview and `resolveTurn()` all call the same function. The preview cannot lie. Most
games in this genre have two code paths here and a permanent class of bug.

**Variance is hashed, not rolled.** `varianceForDay(location, day, seed)` is FNV-1a over
`(locationId, key, day)`. Consequences: reloading a save shows the same day rather than
re-rolling it in the player's favour, and the hub can rerender on any stat change without the
numbers moving. The sign-clamping invariant (a bar shift always pays, a retreat always costs)
is the right call — a place whose contract can invert is a place you can't plan around.

**`balance.js` is separated for a real reason, not aesthetics.** `game-state.js` imports all of
`data/`, so a `data/` module needing a tuning constant would form a cycle. `achievements.js`
reads `ENDURANCE_GOAL_DAYS` from `balance.js` directly. `game-state.js` re-exports the lot so
no importer had to change. That's a genuine architectural fix, correctly documented.

### 2.2 Where the architecture is thin

**`app.js` `initGame()` is a 430-line closure.** Every subsystem — settings dialog, audio,
HUD, screen transitions, turn handling, game over — is a nested function sharing mutable
closure state (`stopParticles`, `lastGameOverMessage`, `leonProfile`). It works and it's
tested, but it is the one file where adding a feature means reading the whole thing. The
settings dialog alone is ~90 lines of imperative `createElement` inside it, while every other
dialog in the game lives in `ui/screens.js`.

**`ui/screens.js` is 965 lines and contains this, three times, verbatim:**

```js
const weatherEmoji = reasons.some(
  (r) => r.includes('☀️') || r.includes('☁️') || r.includes('🌧️') || r.includes('⛈️') ||
         r.includes('🌫️') || r.includes('❄️') || r.includes('🔥') || r.includes('🧊') ||
         r.includes('🌸'),
) ? (gs.getWeather()?.emoji ?? '') : '';
```

This string-matches emoji out of human-readable prose to recover a value the caller already
has. `computeDayEffects()` should return structured reasons (`{kind:'weather', emoji, name}`)
instead of pre-formatted strings; the three copies collapse to nothing. Note that PR #24 was
titled *"Fix hub ReferenceError (weatherEmoji)"* — this pattern has already broken production
once.

**Dead weight retained for tests.** `LOCATION_COPY` (turn.js), `applyLocationAction()`,
`applyEventDeltas()`, `_lastRentDayOfMonth` and `pendingAchievements` exist only because tests
reference them. That's tests dictating production shape, backwards. ~60 lines.

### 2.3 Tooling

`eslint` + `prettier` + `tsc --checkJs` all pass clean, which for a JSDoc-typed vanilla-JS
codebase is a real achievement. `scripts/check-assets.js` deriving background paths *from the
location catalogue* rather than a hand-list is exactly right.

**There is no CI.** No `.github/` directory at all. `npm run check` exists and is good, but
nothing runs it. Every quality gate in this repo is voluntary.

---

## 3. Gameplay analysis (simulated)

I built an evaluator-based "competent player" (weighted utility over the six hub cards, with
urgency multipliers on low resources) and ran 40 seeds × 120 days, plus targeted probes.

### 3.1 Survival curve

| Policy | Result |
|---|---|
| Competent evaluator | **1 death in 40 runs** over 120 days |
| Trivial 4-line if/else (`money<40 → bar; energy<50 → loft; sanity<60 → bathhouse; else market`) | **survives 300 days**, ends at 99 sanity / 1,765 money / 100 rep |
| Bar every day | dies day 7 |

The game is **solved by a four-branch conditional**. Once you own the loft and the bathhouse
(days 1 and 9), there is no state the game can put you in that the loop can't recover from.
The 60-day soft win is reached by accident.

### 3.2 The founding premise is statistically abandoned

Location pick share across 40 competent runs:

```
home_loft            15.2%   ← rest
bathhouse            10.9%   ← rest
radio_station         7.0%
farmers_market        6.6%
bar                   5.5%   ← "the bar that pays"
...
spiritual_community   1.6%   ← "the community that restores you"
soup_kitchen          0.3%   ← effectively dead content
```

**The two locations the game is named after and framed around account for 7.1% of days
played.** The community's contract (+15 sanity / −10 money) is strictly worse than the
bathhouse (+10 sanity / −6 money / **+22 energy**), and the bar (+12 money / −24 energy) is
strictly worse than the night market or the flea market. The founding pair were pinned to
their original numbers for nostalgia — `PROJECT_OVERVIEW.md` says so explicitly — and the
21 locations layered on top were priced without re-pricing them.

Utility scores (sanity + money + 0.5·energy + 0.4·rep + 1.5·insight) put `bar` **dead last of
23** at −12.0 and `spiritual_community` 17th at −1.7.

### 3.3 Difficulty deflates

Rent is a flat 18/week from day 1 to day 300. It is then **reduced** by reputation (−2 at 50
rep, −4 at 80) and by the Tenants' Union perk (−5). A late-game player pays **9**. Nothing in
the game scales with time:

- Last location unlocks on **day 20**. The world stops opening 40 days before the win.
- Last event gate is **`minimumDay: 22`**. No content is introduced after day 22.
- The whole perk tree costs **66 insight**; an insight-focused run earns ~4/day. Insight is a
  **dead currency from roughly day 20 onward** — it accumulates with nothing to buy.
- Expected value of a random event is **+2.74** net. Events are, on aggregate, a gift.

The pressure curve peaks around day 15 and monotonically decreases for the remaining 85% of
a 100-day run.

### 3.4 Content is written but not consumed

| Measure | Value |
|---|---|
| Events in catalogue | 235 |
| Event cadence | one every 2–5 days (mean gap **3.6**) |
| Events seen in a 60-day run | **~17** |
| **Catalogue consumed per playthrough** | **~7%** |
| Days for an immortal, location-cycling player to see all 235 | **>5,000** |
| Unique events across 40 × 120-day runs | 207/235 (88%) |

235 events is a substantial writing effort — and a player who completes the intended arc reads
seventeen of them. The bottleneck is the fixed 2–5 day scheduler: at one event per 3.6 days,
a 60-day run has ~17 slots no matter how large the catalogue grows.

Related: **77 of 78 characters have exactly three events.** The stated floor is also the
ceiling. Nobody has depth; everybody has breadth.

### 3.5 Systems that look load-bearing and aren't

**Weather** closes outdoor tags in a storm. Measured over 7,200 hub cards: **0.2%** were
weather-closed. Weather is a flavour layer with a gate that essentially never fires. Its
tag-effect modifiers (±2 to ±8) are also below the noise floor of location variance.

**Reputation** gates five locations, the last on day 20, and discounts rent. After day 20 it
does nothing but tick toward two achievements.

**The `{friend}` substitution** exists for exactly **one** event (`old_friend_calls`), and the
name pool is *all 77 non-Léon characters* — so "an old friend turns up with no warning and no
agenda" can be **Kaden, the arch-nemesis**, or either rival. There is also a character whose
literal id and display name are `friend` / "Friend", which makes the copy read as
"Friend turns up at the door…".

---

## 4. Outstanding issues

Ranked by severity. Everything here is reproduced, not inferred.

### 🔴 P0 — Save-state exploit lets a player farm resources without spending days

`app.js:handleAction()` calls `persist()` **before** the result modal, and `gs.advanceDay()`
only runs inside the modal's `onContinue`. Refreshing the page at the modal reloads a save in
which the day's effects are applied but the calendar has not moved.

```
start        : day 1  S 30  M 40  E 20
refresh #1   : day 1  S 42  M 37  E 47
refresh #2   : day 1  S 54  M 34  E 74
refresh #3   : day 1  S 66  M 31  E 100
refresh #10  : day 1  S 100 M 10  E 100
```

Ten rest days consumed **zero calendar days**. This bypasses rent, the 60-day goal, every
day-gated unlock, and lets a player re-roll or dodge an unwanted event — and re-apply a
festival bonus (day 1 is New Year Vigil, +6 sanity / +2 insight) indefinitely.

The comment above `persist()` says the intent was *"an accidental refresh must never erase a
day the player has already committed to"* — correct goal, wrong mechanism.
**Fix:** advance the day inside `resolveTurn()` (or immediately after it) and have the modal
present an already-committed result. Alternatively persist a `pendingResult` flag and re-open
the modal on load instead of replaying the day.

### 🔴 P0 — Prepaying rent buys two Sundays for the price of one

`GameState.prepayRent()`:

```js
this.rentPrepaidUntilDay = Math.max(this.rentPrepaidUntilDay, this.journeyDay) + weeks * 7;
```

and `isRentDue()` skips when `journeyDay <= rentPrepaidUntilDay`. Prepaying on a Sunday (day
11) sets `rentPrepaidUntilDay = 18` — which covers **both** Sunday 11 and Sunday 18.

```
day 11 Sunday: paid 18 → prepaidUntil 18, charged 0
day 18 Sunday:                            charged 0   ← never paid for
day 25 Sunday:                            charged 18
```

Prepaying every *other* Sunday costs 90 instead of 162 over 60 days — a **44% permanent rent
discount** available from day 5 to anyone who notices. **Fix:** the bound should be exclusive
(`< rentPrepaidUntilDay`), or prepay should advance from the *next* unpaid Sunday rather than
from `journeyDay`.

### 🟠 P1 — The 100-day "mastery" win is unreachable and undocumented

`checkSecondWin()` requires day ≥ 100, rep ≥ 80, money ≥ 200, 18+ locations visited, and never
more than 5 consecutive bar days. Across 25 seeds of a competent explorer policy:

```
seed 1: day 111  rep 100/80 ✓  visited 23/18 ✓  maxBar 1/5 ✓  money  91/200 ✗
seed 3: day 111  rep  97/80 ✓  visited 23/18 ✓  maxBar 1/5 ✓  money 106/200 ✗
→ mastery achieved: 0 / 25
```

`money ≥ 200` is the blocker: a play pattern that satisfies the other four (broad exploration,
no bar grinding) structurally cannot bank 200. The two halves of the condition are mutually
exclusive.

It is also invisible: **no achievement, no almanac entry, no mention in README or
PROJECT_OVERVIEW**. It's live code that no player can find or satisfy.

### 🟠 P1 — The almanac's four-day forecast is wrong across season boundaries

`weatherForDay(day, seed, season)` hashes the *season string*, but `forecast()` passes
**today's** season for all four days. Measured over 10 seeds × 365 days: **212 of 14,600
forecast cells (1.45%) are wrong**, all clustered in the three days before 1 Mar / 1 Jun /
1 Sep / 1 Dec.

```
today: Friday, February 27, 2026 (Winter)
almanac shows :  d58 Snow  d59 Hard Frost  d60 Overcast   d61 Hard Frost
actually fires:  d58 Snow  d59 Hard Frost  d60 Clear      d61 Clear
```

This matters more than the percentage suggests: **journey day 60 — the soft win — lands on
1 March 2026**, the Winter→Spring boundary, so a default run hits the bug on its most
important day. It also directly contradicts the game's stated contract that "weather is
written down four days in advance". **Fix:** `forecast()` should project the calendar date
forward and derive the season per day.

### 🟠 P1 — Death hides the blow that killed you

`handleAction()`:

```js
if (result.gameOver) { saveStore.clear(storage); showGameOver(...); return; }
```

`renderResultModal` is never reached. The player never sees the event, the deltas, the
exhaustion line or the rent charge that ended the run — the screen goes from "I clicked
Work a Shift" straight to "The Balance Broke". Verified: the killing turn returned
`{exhaustion: -1, deltas: {sanity: -1, ...}}` and none of it was ever shown.

For a game whose whole premise is legible cause and effect, this is the worst possible place
to drop the explanation. **Fix:** show the result modal, then transition to game over on
Continue.

### 🟠 P1 — Asset budget has 17 KB of headroom on a hard-failing check

```
eager payload: 3.62 MB (limit 4.00) → 385 KB headroom
total payload: 7.98 MB (limit 8.00) →  17 KB headroom
```

`check-assets.js` exits non-zero above 8 MB. Average cost of one new character is ~72 KB
(15 KB thumb + 57 KB hi-res); one new location with its three residents is **~305 KB**.

**Adding a single character to this game currently breaks the build.** The GitHub issue open
right now (#16) asks for a new "LOC mines" location — which cannot be merged without first
resolving the budget. Options: raise the ceiling (the hi tier is lazy-loaded and doesn't
affect first paint), exclude `portraits/hi/` from the total cap entirely and cap it per-file,
or re-encode the hi tier at AVIF/lower quality.

### 🟡 P2 — Modal and dialog accessibility

Verified in jsdom on the live app:

- **No focus trap.** With the day-result modal open, three buttons outside it remain tabbable
  (HUD portrait, settings, host portrait). Same for the settings dialog. `#app` gets neither
  `inert` nor `aria-hidden`.
- **The day-result modal has no Escape handler.** The portrait lightbox and settings dialog
  both do; the one modal you see every single turn does not.
- **Clicking the dimmed backdrop fires `onContinue()`** — i.e. a misplaced tap silently
  commits the day and advances the calendar, with no undo.
- **"Reset game" wipes the save on one click** with no confirmation step.
- **No `<h1>` on the page.** Heading outline starts at `h2`.
- **People screen ARIA is half-built:** `role="listbox"` with 78 `role="option"` children that
  are all `<button>`s (so all 78 are individual tab stops), no `aria-activedescendant`, no
  arrow-key navigation, and the detail panel that updates on selection is not a live region —
  a screen-reader user gets no announcement that anything changed.

### 🟡 P2 — Repository and pipeline hygiene

- **`.git` is 178 MB** against a 8 MB deployed game. `assets/` holds 165 MB of source PNGs
  tracked in-repo with no LFS. Cloning this repo to fix a typo costs 178 MB.
- **Four superseded background masters (7.7 MB) still tracked**: `bar.png`,
  `spiritual_community.png`, `public_library.png`, `river_walk.png` were replaced by
  `paris_*.png` variants and have no deployed counterpart.
- **57 orphaned SVG portraits** remain in `assets/portraits/` after the pass that removed
  procedural avatars from `docs/`.
- **16 of 78 characters have no source PNG** — their deployed WebP cannot be rebuilt by
  `npm run assets`. The same class of bug the July pass fixed for `free_clinic` and
  `home_loft`; it's back for a fifth of the cast.
- **Legacy save keys are never pruned.** After migrating a v3 save, both `…save.v3` and
  `…save.v5` persist indefinitely. Harmless today (load prefers v5), a real hazard on the next
  schema bump.
- **Single save slot, no export/import.** A 100-day run lives in one `localStorage` key with
  no UI warning. Clearing site data destroys it.
- **`assets/portraits/README.md` is stale** — it documents 96×96 PNGs, the `CharacterProfile`
  resource and "the CharacterProfiles scene", all from the deleted Godot build.

### 🟡 P2 — Test suite performance and shape

`npm test` takes **105 seconds**, of which:

```
45.5s  tests/ui.test.js
37.9s  tests/dom.test.js
12.9s  tests/portrait-assets.test.js   (shells out to ImageMagick)
 4.2s  tests/portrait-popup.test.js
 ~2.5s  everything else combined
```

**96% of the runtime is in four files**, three of which spin up a fresh JSDOM per test. Split
`npm test` into a fast rules tier (~2.5s, run on every save) and a slow UI/asset tier, or
share one JSDOM instance across tests in a file.

Separately: four test files (`dom`, `ui`, `new-features`, `portrait-popup`) register zero
top-level `test(` calls in a grep — they nest everything, which makes the 371 figure hard to
attribute and the suite hard to navigate.

### 🟢 P3 — Content and copy

- **9 rare-hurtful events across 7 of 23 locations.** 16 locations have no downside event at
  all. The three that exist at `house_of_middleway` make Brian's welcoming chapel the most
  dangerous place in the game, which reads as an accident of authoring rather than intent.
- **`{friend}` pool includes Kaden, Sato and Alex** (see 3.5). Filter to
  `role === 'side_character'`.
- **Perk button tooltips are fiction**: `Estimated: reachable ~day ${Math.ceil(perk.cost/1.2 +
  perk.requires.length*5)}` is a made-up formula presented to the player as a projection.
- **Only 23 of 78 characters have small talk** — the 23 hosts. The other 55 exist as three
  events and a People entry.
- `soup_kitchen` at 0.3% pick rate is 9 events and 3 portraits of effectively unreachable
  content.

---

## 5. Priority features not yet implemented

Ordered by (player impact ÷ effort). Items 1–4 are what I'd put in the next milestone.

### 1. Make the run get harder — a pressure curve — **highest impact**

The game currently has no second act. Every mechanic that could escalate instead deflates.
Cheapest interventions, in order:

- **Scale rent with journey day** (e.g. +2 per fortnight, or +10% every 4 weeks). One line in
  `rentDue()`. Immediately restores the reason to keep earning past day 20.
- **Add a late-game insight sink** so the currency stops dying at day 20: a second perk tier,
  or *practices* that cost insight per use rather than once (retreat vouchers, rent
  insurance, a re-roll token).
- **Gate 3–4 locations behind day 30–50** so the world keeps opening across the full arc. The
  catalogue already supports `minDay`; nothing is gated past day 20.
- **Introduce events past `minimumDay: 22`.** The existing Kaden arc (paperwork → survey →
  committee → buyout) is exactly the right shape and stops at day 18.

### 2. Re-price the founding pair, or accept they are flavour

`spiritual_community` and `bar` are picked 7.1% of the time combined and are dominated by
later locations on every axis. Either:

- **(a)** Give them a unique mechanical role no other location has — the bar as the only
  location with no energy floor, the community as the only source of a "resilience" buffer —
  so the premise holds; or
- **(b)** Accept them as the tutorial pair, and rewrite the README/overview framing, which
  currently promises a game about two places that a competent player barely visits.

Option (a) is the better game. Option (b) is honest and free.

### 3. Character relationship state

The single highest-leverage content feature, and the roadmap already gestures at it.

Today a character is `{id, name, role, bio, relationship, locationId, portrait}` — **entirely
static for the whole run**. "Relationship to Léon" is a fixed paragraph. Nothing a player does
changes anyone.

Add a per-character `affinity` integer on `GameState`, incremented when their events fire and
when you visit their location:

- unlocks their 4th/5th/6th events (breaking the universal 3-event ceiling);
- lets the People screen show *"you've run into Renata six times"* and a changed relationship
  line — a "what changed" marker, per the roadmap;
- gives the 78-strong cast a reason to be 78 strong;
- gives event authoring somewhere to grow that isn't "another parallel three-liner".

Requires: a save-schema bump (v6), a migration, `affinity` in `achievementSnapshot`, and an
`minAffinity` gate in `_buildPool()`. Maybe 200 lines of engine work; unlocks unlimited content.

### 4. Fix the content-consumption ratio

7% of the catalogue per playthrough is the core waste in this project. Options, cheapest first:

- **Raise event frequency** to every 1–3 days (~30 events per 60-day run, 13%).
- **Add a second event slot** on high-engagement days (markets, festivals, night work).
- **Weight unseen events up** per-save so a returning player meets new people rather than
  re-rolling the same nine at the bathhouse.
- **Persist "events seen" across runs** and surface it — a collection meta-layer is the
  standard genre answer to "we wrote 235 things and you'll read 17".

### 5. A real ending, and a way to reach it

Currently `renderGameOver` is only reachable **by dying**. `checkWin()` fires a toast and the
run continues forever. A player who does everything right gets a 2.6-second toast, then plays
on until they eventually lose, and *then* sees the summary screen titled "A Long Road Ended".

Add: a **"Rest here" / retire** action on the hub after day 60, and differentiated endings —
at minimum by dominant play pattern (community-led / bar-led / wanderer / recluse), ideally
with a line per major arc (Kaden, Sato, Alex) reflecting how it resolved. The data to do this
is already tracked (`visitedLocations`, `maxConsecutiveBarDays`, `nightDays`, `rentPaidCount`).

### 6. Save robustness — export/import, slots, and a warning

The roadmap flags this and it's right. A 100-day run currently lives in one `localStorage`
key. Minimum viable: a **Copy save / Paste save** pair of buttons in Settings (JSON to
clipboard). Better: 3 named slots + a save-on-demand button. Also add a confirmation step to
"Reset game", and prune legacy keys on successful migration.

### 7. Accessibility pass (settings-level)

The semantic foundation is genuinely good — meters, dialogs, focus rings, `aria-selected`,
`prefers-reduced-motion`. What's missing is everything user-controllable:

- **Focus trap + Escape** on the day-result modal and settings dialog; `inert` on `#app`.
- **Text size, high contrast, and a non-colour stat mode** (bars currently encode status in
  hue alone — `bar-critical` red vs `bar-full` green is invisible to a deuteranope).
- **A reduced-motion toggle** that doesn't require changing OS settings.
- **Arrow-key navigation + `aria-activedescendant`** on the 78-row People listbox, and
  `aria-live` on its detail panel.
- **An `<h1>`.**

### 8. Audio beyond one piano loop

One 133 KB WAV on a volume slider. A game about the texture of days wants, at minimum: a
distinct sting for rare-helpful vs rare-hurtful events, a page-turn on day advance, and
per-location ambience (bar murmur, rain on the canal, silence at the retreat). Keep it opt-in
and behind the existing autoplay handling. Budget note: 133 KB WAV → ~15 KB Opus frees room
for ~8 more cues *and* helps the 17 KB budget crisis.

### 9. CI

`npm run check` is a good gate that nothing enforces. A 20-line GitHub Actions workflow
running `test` + `lint` + `typecheck` + `format:check` + `check-assets` on PRs would have
caught the `weatherEmoji` ReferenceError that shipped to production in PR #23/#24.

### 10. Content authoring tooling

Adding one location today means coordinated edits across `locations.js`, `characters.js` (×3
people), `events.js` (×9 events), `SMALL_TALK`, two asset directories and six image files —
with the failure mode being a red test suite rather than a helpful error. A
`scripts/new-location.js` scaffold and a `scripts/validate-content.js` (duplicate ids, missing
hosts, unreachable events, orphaned rewards, budget projection) would turn a half-day of
careful cross-referencing into ten minutes. The roadmap calls for exactly this.

### 11. Longer-horizon

- **Localisation through message keys** (roadmap). Paris stays; French fluency stops being a
  prerequisite for reading location names.
- **A PWA manifest + service worker.** Zero build step, static assets, ~8 MB — this game
  should be installable and playable offline. Currently there is no manifest, no icons beyond
  a portrait used as favicon, and no offline story.
- **Property-based / mutation tests** around turn order, save migration and economy
  invariants (roadmap). The two P0 bugs in §4 are both in exactly these systems, and 371
  example-based tests at 99.5% coverage did not catch either — which is the argument for
  property-based testing, made empirically.

---

## 6. Suggested sequencing

| Milestone | Contents | Rationale |
|---|---|---|
| **Hotfix** | P0 refresh exploit · P0 prepay double-cover · P1 death modal · P1 forecast season | Four correctness bugs, all small diffs, all currently live |
| **v2.3 — the run has a shape** | Rent escalation · late-game unlocks · insight sink · retire action + differentiated endings · founding-pair repricing | Fixes "solved by an if/else"; the biggest gap between what the game promises and what it does |
| **v2.4 — the cast matters** | Affinity state · 4th+ events · People "what changed" · event frequency · unseen-weighting | Makes 78 characters and 235 events worth having written |
| **v2.5 — polish & platform** | Asset budget resolution · CI · save export/slots · a11y settings panel · audio cues · PWA | Everything that makes it shippable to strangers rather than demonstrable to reviewers |
| **Ongoing** | Content tooling · repo/LFS cleanup · test-tier split · property tests | Keeps the above from getting slower over time |

---

## 7. Summary

**Strengths.** A genuinely clean architecture with an enforced DOM boundary; determinism
handled properly end-to-end; a test suite that asserts design properties rather than
snapshots; documentation that explains *why* rather than *what*; zero runtime dependencies and
zero build step, with a 3.6 MB payload for a game with 78 painted portraits and 23 painted
backgrounds. The engineering culture visible in this repo is well above the norm.

**The gap.** All of that rigour is pointed at correctness-of-implementation, and almost none
of it at correctness-of-design. There are 371 tests and ~99.5% coverage, and the game still
ships a save exploit that grants infinite resources, a rent discount worth 44%, a win
condition no player can satisfy, and an economy that a four-line conditional beats for 300
days. The tests assert that the code does what it says; nothing asserts that what it says is
worth doing.

**The one-line recommendation.** Fix the four correctness bugs this week, then stop adding
content and spend a milestone on the pressure curve. The catalogue is not the constraint —
a player sees 7% of it. The constraint is that after day 20, nothing the game does can hurt
you, and nothing new arrives.
