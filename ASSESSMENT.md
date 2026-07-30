# Historical record (superseded)

> **Frozen context — do not cite for current facts.** The counts, balances,
> and recommendations in this document describe an earlier revision.
> Authoritative sources as of 30 July 2026: `README.md`,
> `PROJECT_OVERVIEW.md`, `CHANGELOG.md`, and `AUDIT_2026-07-30.md`
> (current audit and prioritized action plan). Kept for context only.

---

# Project assessment — secondbarnone

**Reviewer:** Senior developer pass
**Date:** 27 July 2026
**Commit:** `31a8031` (branch `arena/019fa46e-secondbarnone`)
**Method:** full source read, `npm test`, `npm run coverage:check`, `node scripts/check-assets.js`, plus headless balance simulations driving the real `resolveTurn` over 100-seed batches.

---

## Verdict

**Engineering: strong. Game design: the core loop is currently unloseable.**

This is a genuinely well-built codebase. The core/UI separation is real and enforced, the data layer is pure and catalogue-testable, randomness is seeded, saves are version-tolerant, and there is no build step to rot. Most hobby projects this size are far messier. Credit where it's due.

But the project's own quality signals — 275 tests, ~99% line coverage, green asset checks — are all measuring *code correctness*, and none of them measure *whether the game works as a game*. When I actually simulated play, the central design promise ("let sanity or money reach zero and the run ends") does not hold. A competent player cannot lose after about day 3.

That gap — excellent engineering hygiene pointed at the wrong target — is the single most important finding in this review.

| Area | Grade | Note |
|---|---|---|
| Architecture & code quality | **A−** | Clean, disciplined, well-documented |
| Test *engineering* | **B** | High coverage, but slow and partly self-referential |
| Test *coverage of what matters* | **D** | Zero tests assert the game is loseable |
| Game balance | **D−** | Unloseable; see below |
| Repo hygiene | **C−** | 190 MB `.git`, 178 MB of source art committed |
| CI/CD | **F** | No CI at all |
| Docs | **A−** | Excellent, but overstate the project's health |

---

## 1. Critical: the game cannot be lost

This is the headline. I wrote a simulator that drives the real `resolveTurn`, picks locations with a simple greedy utility, and buys perks when affordable. 100 seeds, 300 days each:

```
GREEDY     alive@300 = 100/100   reached day 100 = 100/100
           final money 704 avg   final sanity 99.4   deaths: none

ALTERNATE  alive@300 = 100/100   reached day 100 = 100/100
           final money 101 avg   final sanity 93.2   deaths: none

RANDOM     alive@300 =  60/100   deaths: 40 (all money)
```

Only a player choosing **uniformly at random** ever dies. Any strategy that so much as glances at the numbers survives indefinitely and ends up with 700+ money — against a "comfort cap" of 100.

### Why

Sort the 22 locations by net value (`sanity + money + 0.4·energy + 0.3·rep + 0.6·insight`):

| Location | san | mon | ene | net | unlocks |
|---|---|---|---|---|---|
| `home_loft` | +4 | −3 | **+34** | **14.6** | **day 1, 0 rep** |
| `bathhouse` | +10 | −6 | +24 | 13.6 | day 9 |
| `open_mic` | +8 | +4 | −14 | 8.5 | day 10 |
| … | | | | | |
| `spiritual_community` | +15 | −10 | −12 | 1.4 | day 1 |
| `bar` | −12 | +12 | −20 | **−8.0** | day 1 |

**The two founding locations are the two worst options in the game.** The design doc explicitly protects their original numbers ("+15/−10 and −12/+12, so the opening of a run plays as it always did") — but 20 locations were layered on top without rebalancing against them. The premise the README sells (a tense sanity-vs-money dilemma) is mechanically dominated by day 3.

The specific dominant loop is **`home_loft` + `farmers_market`** alternating:

```
home_loft       sanity +4  money −3   energy +34
farmers_market  sanity +2  money +8   energy −10
per 2 days      sanity +6  money +5   energy +24  (+32 overnight recovery)
                → +2.50 money/day
rent            → −2.57 money/day
```

That is roughly break-even on locations alone — and then the event pool tips it positive:

```
64 events, expected value per fire: sanity +1.51  money +0.91
events fire every 2–5 days (avg 3.5)
→ per-day EV: sanity +0.43  money +0.26
41 of 64 events (64%) are net-positive on sanity+money
```

**Net drift is positive on every axis.** There is no sink that scales, so sanity and money ratchet upward until they pin at the caps.

### Corollaries

- **Energy is not a constraint.** `home_loft` gives +34 and overnight recovery gives +16. Exhaustion (max −6 sanity) is trivially avoidable and never bites.
- **Reputation maxes at 100 by ~day 126 in 40/40 runs.** After that it gates nothing — every location is permanently open and the progression system is inert.
- **Insight overflows.** All 10 perks cost 66 insight total. The `alternate` strategy finished with **259 insight** — 4× the entire tree, with nothing to spend it on.
- **The 100-day soft win is not an achievement.** It is reached in 100/100 non-random runs.

### The test suite actively certifies the wrong invariant

`tests/world.test.js:91` enforces:

```js
// Every place must cost something — money, energy or sanity
assert.ok(sanity < 0 || money < 0 || energy < 0, `${l.id} costs nothing`);
```

`home_loft` passes this (money −3) while being the strongest location in the game by a wide margin. The invariant checks that a cost *exists*, not that it is *meaningful*. 275 tests, and not one asserts that a reasonable player can die.

---

## 2. Bug: prepaying rent gives a free week

`prepayRent()` in `game-state.js`:

```js
this.rentPrepaidUntilDay = Math.max(this.rentPrepaidUntilDay, this.journeyDay) + weeks * 7;
```

If you prepay **on** a Sunday when rent is already due, `isRentDue()` returns false for that same Sunday (`journeyDay <= rentPrepaidUntilDay`) *and* for the following one. One 18-money payment covers two Sundays.

Measured over 70 days:

```
never prepay       → 180 money in rent
prepay when due    → 144 money in rent   (36 less = two free weeks)
```

The intended behaviour is almost certainly "prepay covers *future* Sundays." Fix:

```js
const base = Math.max(this.rentPrepaidUntilDay, this.journeyDay - 1);
this.rentPrepaidUntilDay = base + weeks * 7;
```

…or explicitly refuse to prepay on a day rent is already due, and charge it normally instead. Either way it needs a regression test.

---

## 3. Bug: undeclared weather stacking

`computeDayEffects` loops over a location's tags and applies the weather modifier for **each matching tag**:

```js
for (const tag of location.tags) {
  const mod = weather.tagEffects[tag];
  if (!mod) continue;
  accumulate(total, applied);
}
```

30 location×weather pairs hit twice, one hits three times:

```
heatwave on night_market → 3× via [night, outdoor, work]
                            money +3, energy −8, sanity −2
rain on farmers_market   → 2× via [market, outdoor]
                            money −3, sanity −3, energy −4
rain on rooftop          → 2× via [outdoor, quiet]
                            sanity −3+2 = −1  (partial cancel)
```

This may well be intentional — it produces some pleasing results, like rain on a quiet rooftop partly cancelling out. But it is **not documented anywhere**, no test asserts it, and it means adding a tag to a location silently changes its weather profile. Weather tuning is currently guesswork.

Decide and encode it: either document stacking as the model and add a test, or take the strongest single matching tag.

---

## 4. Test suite: 102 seconds, and partly measuring itself

```
tests/ui.test.js             45.3s   44 tests
tests/dom.test.js            37.1s   23 tests
tests/portrait-assets.test.js 12.7s  19 tests
tests/portrait-popup.test.js  5.5s   12 tests
tests/world.test.js           0.13s  65 tests
tests/game.test.js            0.16s  56 tests
─────────────────────────────────────────────
TOTAL                       ~102s   275 tests
```

**96% of the runtime is in 4 files, and nearly all of it is `setTimeout` sleeps.** The jsdom tests hardcode:

```js
const settle = () => new Promise((r) => setTimeout(r, 480));   // FADE_MS is 350
await new Promise((r) => setTimeout(r, 2800));                 // TOAST_MS is 2600
```

69 `settle()` calls plus 81 jsdom boots. The sleeps duplicate `FADE_MS`/`TOAST_MS`, which are private constants in `app.js` — change a timing constant and the tests silently become flaky rather than failing loudly.

Two fixes, both cheap:
1. **Export the timings** from `app.js` and let `initGame()` accept `{ fadeMs: 0, toastMs: 0 }`. Tests pass 0 and the sleeps disappear. This alone should take the suite under 10 seconds.
2. Share one `boot()` helper across the three jsdom files instead of three near-identical copies.

### Coverage is inflated by dead code

`~99% line coverage` sounds excellent, but some of it is tests exercising code nothing else calls:

| Symbol | Called by production code? | Tests referencing it |
|---|---|---|
| `applyLocationAction()` | **No** | 9 |
| `applyEventDeltas()` | **No** | 8 |
| `LOCATION_COPY` | superseded by `locations.js` | 3 |
| `SANITY_GAIN/LOSS`, `MONEY_GAIN/LOSS` | only by `applyLocationAction` | — |
| `_lastRentDayOfMonth` | written & serialised, **never read** | — |
| `_previousEventId` | written, **never read** (`_recentIds` replaced it) | — |

These are documented as "legacy shims / back-compat," but there are no external consumers — this is a self-contained static site. They exist only to be tested. Deleting them removes ~40 lines of production code and ~17 tests, and makes the coverage figure honest.

---

## 5. Repository hygiene: 190 MB of Git for a 2.9 MB game

```
.git                190 MB
assets/ (source)    178 MB   ← committed
docs/assets (ship)  7.5 MB
```

The deployed game is **2.93 MB eager**. The repo is **65× larger** than the thing it ships.

- `assets/portraits/` — 113 MB, 147 files for 78 characters. **62 characters have 2–3 redundant master formats** (`.png` *and* `.svg` *and*/or `.webp`). Individual masters run 2.8–2.9 MB each.
- `assets/backgrounds/` — 65 MB. **4 stems (7.8 MB) are superseded art** — `bar`, `spiritual_community`, `public_library`, `river_walk` were replaced by `paris_*` versions. `optimize-assets.sh` already contains a comment explaining that these "kept reappearing in the payload," so they were worked around in the build rather than deleted.

Every clone pays 190 MB. Options, roughly in order of preference:

1. **Git LFS** for `assets/**` — keeps masters versioned, keeps clones small. Cleanest fit.
2. **Move masters out of Git** to release assets or object storage, with a fetch script. `docs/assets/` is already the only thing needed to build or play.
3. At minimum: **delete the 4 superseded backgrounds and the redundant format duplicates**, and pick one canonical master format per portrait. That is a quick ~50 MB win with zero tooling.

Note that history rewriting (`git filter-repo`) would be needed to actually shrink `.git` — worth doing once, deliberately, with the repo owner's agreement.

Also: `package-lock.json` is **gitignored**. For a project with a single dev dependency this is low-risk, but it means `npm install` is not reproducible and CI can't cache reliably. Commit it.

---

## 6. No CI

There is no `.github/` directory. `npm run check` exists and is good, but nothing runs it automatically. `DEPLOY.md` documents the process as:

```bash
npm run check && git add -A && git commit -m "..." && git push origin main
```

— a manual convention. Nothing prevents a push that breaks the game from going straight to Pages, and any contributor who skips the incantation ships broken assets.

A ~20-line workflow closes this:

```yaml
name: check
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22' }
      - run: npm ci
      - run: npm test
      - run: node scripts/check-assets.js
      - run: npm run coverage:check
```

(`npm ci` requires the lockfile from §5.) Note also that `package.json` declares no `engines` field — the test suite uses `node --test` with `--experimental-test-coverage`, which needs Node ≥20. Worth pinning.

---

## 7. Smaller findings

**Double-resolve is guarded, but only in the UI.** `renderLocation` disables the action button on click, so the live game is safe. But `resolveTurn` itself is happy to run twice on the same day — I confirmed two calls apply full effects with no day advance. The invariant lives in a DOM event handler rather than in the model. A `gs.turnResolvedOn === journeyDay` guard in `resolveTurn` would make it structural.

**Result modal closes on backdrop click.** `backdrop.addEventListener('click', ...)` calls `onContinue()`, which advances the day. A stray tap outside the dialog silently commits the turn. Given the modal is the only place the player sees what happened, requiring the explicit button is kinder.

**Result modal has no Escape handler and no focus trap.** The portrait lightbox does both correctly (`screens.js:187–197`) — the day-result modal, which is `role="dialog" aria-modal="true"`, does neither. Tab escapes to the page behind it.

**Unlock snapshot is duplicated in the UI.** `screens.js` hand-builds the `{journeyDay, reputation, weekday, perks, closedTags}` object at lines 256 and 378. If a gate ever needs a fifth field, both sites must change and neither will fail a test. This belongs on `GameState` as `getUnlockSnapshot()` — a 6-line method that also makes `evaluateUnlock` easier to exercise headlessly.

**Portrait `<img>` has no `width`/`height`.** `avatar()` in `screens.js` emits `loading="lazy" decoding="async"` but no intrinsic dimensions, so every avatar-heavy screen (People, event cards) will shift layout as images arrive. The HUD portrait in `index.html` gets this right (`width="60" height="60"`); the dynamic ones don't.

**No `LICENSE` file.** `package.json` says `"license": "MIT"` but there is no license text in the repo. For a public, playable project that is a real gap — add `LICENSE`.

**`docs/side_characters_report.md` is deployed.** An internal art-status memo sits inside the published Pages directory. Harmless, but it's shipped to players and counts against the payload budget. Move it to the repo root or a `notes/` directory.

**Single-commit history.** The branch has exactly one commit (a squashed merge). Not actionable now, but it means `git blame` and bisect are useless for the existing code.

---

## Recommendations, prioritised

### P0 — do these first

1. **Rebalance the economy so the game can be lost.** This is the whole product. Concretely:
   - Bring `home_loft` and `bathhouse` in line — they are rest options, and rest should not also be the best sanity *and* energy play. Consider making rest cost a day's income more sharply, or cap consecutive rest days.
   - Raise the floor cost of the founding two, or lower the ceiling of the mid-tier locations. The two starting places should not be the two worst.
   - Add a sink that scales with time — rent that rises, or a recurring obligation — so positive drift eventually loses to it.
   - Reduce the event pool's positive skew (currently +1.51 sanity / +0.91 money per fire, 64% net-positive).
2. **Add balance tests as first-class CI checks.** A seeded simulation harness asserting e.g. *"a greedy strategy dies before day 200 in ≥30% of seeds"* and *"a random strategy dies in ≥80%"*. The simulator I used is ~40 lines; this is the test the project is missing. Without it, any rebalance will silently regress.
3. **Fix the rent prepay exploit** (§2) with a regression test.
4. **Add CI** (§6). Commit `package-lock.json`, add `engines`, wire up the workflow.

### P1 — near term

5. **Make the test suite fast.** Export `FADE_MS`/`TOAST_MS`, accept timing overrides in `initGame()`, drop the sleeps. 102s → <10s.
6. **Decide the weather-stacking model** (§3), document it, test it.
7. **Delete the dead code** (`applyLocationAction`, `applyEventDeltas`, `LOCATION_COPY`, `_lastRentDayOfMonth`, `_previousEventId`) and the ~17 tests that exist only to cover it.
8. **Shrink the repo** (§5) — start with the 7.8 MB of superseded backgrounds and the duplicate portrait masters.
9. **Give insight and reputation something to do past the midgame.** Both are inert well before day 150.

### P2 — worthwhile

10. Move the unlock snapshot onto `GameState`.
11. Add Escape + focus trap to the result modal; remove backdrop-click-to-continue.
12. Add `width`/`height` to dynamic portrait `<img>` elements.
13. Add `LICENSE`; move `side_characters_report.md` out of `docs/`.
14. Move the double-resolve guard from the button into `resolveTurn`.

---

## Closing note

I want to be clear that the criticism above is aimed at a project that has earned it by being good enough to hold up to this level of scrutiny. The architecture is sound, the discipline around purity and determinism is real, and the documentation is better than most commercial codebases I've reviewed.

The problem is that all of that rigour is currently pointed at code correctness while the game design ships untested. The project's `DEVELOPMENT_ROADMAP.md` even anticipates this — *"Track balance telemetry… location pick rates, average run length, stat death cause"* — it just hasn't happened yet, and the 99% coverage badge makes it easy to believe it isn't needed.

The good news: because the core is pure and seeded, a balance-simulation harness is genuinely easy to build here. Most projects can't do this at all. This one can do it in an afternoon.
