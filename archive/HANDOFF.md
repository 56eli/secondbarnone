# Historical handoff (superseded)

> **Frozen context — do not cite for current facts.** This handoff describes an earlier revision. Authoritative sources as of 30 July 2026: `README.md`, `PROJECT_OVERVIEW.md`, `CHANGELOG.md`, and `AUDIT_2026-07-30.md` (current audit and prioritized action plan). Kept for context only.

# Handoff notes

**Last updated:** 27 July 2026
**Version:** 3.0.0
**Branch:** `arena/019fa46e-secondbarnone`
**Read first:** this file, then [ASSESSMENT.md](ASSESSMENT.md) for *why* these
changes were made, then [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md) for design
and architecture.

---

## 1. Game state in one paragraph

secondbarnone is a browser-playable narrative balance game in vanilla ES
modules with no build step — the source under `docs/` *is* the deployed site.
You play Léon, splitting each day between a spiritual community and a bar
across 22 locations, 78 characters, 64 events, 9 weather types, 10 perks and 22
achievements. It is playable, deployed to GitHub Pages, covered by **293 tests
at ~99% line coverage**, and — as of this pass — **actually loseable**.

---

## 2. What changed in this pass, and why it matters

The previous state of the project was: excellent engineering, untested game
design. 275 tests and 99% coverage all measured code correctness while the
core loop had no failure state. This pass closed that gap.

### 2.1 The balance fix (the important one)

**Before:** a greedy player survived 100/100 seeds and ended a 200-day run with
~700 money against a "comfort cap" of 100. Only uniformly-random play ever
died. The two founding locations were the two *worst* options in the game, so
the advertised sanity-vs-money dilemma was dead content by day 3.

**Root causes, all three fixed:**

| Cause | Fix |
|---|---|
| Rent was flat (−18/wk) while every location and the event pool drifted slightly positive, so there was no scaling sink | Rent now rises **+3 every 24 days, capped at 42** (`RENT_ESCALATION*` in `game-state.js`) |
| `ENERGY_RECOVERY` was 16, which made the core bar/community loop *exactly* energy-neutral (−20 and −12 across two days vs +32 recovered), so energy never bound and exhaustion never fired | Recovery lowered to **14**, making energy a real third resource |
| 13 locations were strictly better than the founding two; `home_loft` alone took 56% of a greedy run's days | 13 locations retuned; rest is now restful but expensive, market work no longer also restores sanity |

Perk income was also trimmed (`nightMoneyBonus` 3→2, `communityCostRelief` 4→3,
`marketMoneyBonus` 4→3) because a full perk build turned a break-even loop into
a profitable one.

**Result (100 seeds, 200-day horizon):**

| Play style | Dies — before → after | Reaches day 100 |
|---|---|---|
| `random` | 45% → **97%** | 3% |
| `alternate` (the core loop) | 0% → **10%** | 90% |
| `greedy` (reads the preview) | 0% → **25%** | 75% |

Both failure modes now occur; previously only money deaths were reachable.

> **This is the single most fragile thing in the project.** It is held in place
> only by `tests/balance.test.js`. Do not weaken those assertions to make a
> content change pass — retune the content instead.

### 2.2 Bugs fixed

- **Rent prepay exploit.** `prepayRent()` anchored to `journeyDay`, so prepaying
  *on* a due Sunday waived that Sunday and the next — one 18-money payment
  bought two weeks (144 vs 180 over 70 days). Now anchors to `journeyDay - 1`.
  Pinned by test.
- **Double-resolve.** `resolveTurn()` would happily apply a second full day if
  called twice without `advanceDay()`. The UI guarded this by disabling a
  button, which made a core rule a property of a DOM handler. Now guarded in
  the model via `gs.isTurnResolved` / `markTurnResolved()`, persisted in saves.

### 2.3 Weather stacking — decided and documented

Weather applies **once per matching tag**, so a heatwave hits `night_market`
three times (night + outdoor + work) and rain hits a `rooftop` twice with
partial cancellation. This was undocumented and untested; it is now both
(`turn.js` comment + `tests/balance.test.js`). It was kept because a market
that is also outdoors really is doubly rained on.

⚠️ **Consequence: adding a tag to a location silently changes its weather
profile.** Retag deliberately.

### 2.4 Deadweight removed

| Removed | Why |
|---|---|
| `applyLocationAction()`, `applyEventDeltas()`, `LOCATION_COPY`, `SANITY_GAIN/LOSS`, `MONEY_GAIN/LOSS` | Called by zero production code; 17 tests existed only to cover them, inflating the coverage figure |
| `_lastRentDayOfMonth`, `_previousEventId` | Written and serialised, never read |
| `scripts/generate-avatars.js` | Emitted SVGs that `build-portraits.js` cannot even read (`sourceFor()` only probes `.png`/`.webp`), and every character has painted art |
| `scripts/process-portrait.sh` | Emitted 512px straight into the deploy dir, bypassing the 288/896 two-tier build |
| 4 superseded background masters (`bar`, `spiritual_community`, `public_library`, `river_walk`) | Replaced by `paris_*` versions; `optimize-assets.sh` had a workaround comment instead of a deletion |
| 68 redundant portrait masters | 62 characters had 2–3 duplicate formats; kept the largest per id |

Tests that used the dead shims to exercise *real* behaviour (signals, clamping)
were retargeted to `applyDeltas`, not deleted. Coverage held at 99.42%.

`docs/side_characters_report.md` → `notes/art-status.md` (it was being deployed
to players).

### 2.5 Test suite: 102s → ~40s

96% of the old runtime was `setTimeout` sleeps that hardcoded copies of
`FADE_MS`/`TOAST_MS`. Those constants are now exported and overridable per boot
(`initGame({ fadeMs: 0, toastMs: 0 })`), and `transitionTo` swaps synchronously
when `fadeMs <= 0`. The jsdom harnesses pass 0.

### 2.6 Infrastructure

- **CI written but NOT YET ACTIVE** — see `notes/ci-workflow.yml`. It runs
  tests, the asset check and the coverage gate on every push/PR, plus a
  balance report in the Actions summary. It could not be committed to
  `.github/workflows/` because the agent's GitHub App token lacks the
  `workflows` permission and the push was rejected. **Enabling it is a
  one-line `git mv` by a human — instructions are in the file header, and it
  is the highest-value 10 seconds available on this repo.**
- `package-lock.json` **committed** (was gitignored) so `npm ci` works.
- `engines: node >=20` declared.
- `LICENSE` added — `package.json` claimed MIT with no license text.

### 2.7 Accessibility

- Day-result modal: added **Escape** and a **focus trap**. It declares
  `role="dialog" aria-modal="true"` but focus could tab out to the page behind.
- **Removed backdrop-click-to-dismiss** from that modal — it advanced the day,
  which is far too consequential for a stray tap.
- Avatar `<img>` elements now carry intrinsic `width`/`height` to stop layout
  shift on portrait-heavy screens.

### 2.8 Art

Ten backgrounds regenerated or relit. Constraint honoured: **nothing is
brighter than House of Middleway (38.63% mean HSL lightness)**, which remains
the brightest asset in the game.

| Image | Before | After | Change |
|---|---|---|---|
| `alex_cocktail_bar` | 4.55% | 21.06% | regenerated; still night, now legible |
| `open_mic` | 7.07% | 22.46% | regenerated; still night, now legible |
| `pawn_shop` | 8.39% | 22.95% | regenerated in daylight |
| `home_loft` | 8.56% | 36.94% | regenerated; most-visited location |
| `temple_ruins` | 8.59% | 19.56% | regenerated — was a dark *indoor crypt* despite being `outdoor`/`pilgrimage` |
| `hub_background` | 8.89% | 15.71% | regenerated; seen on every hub visit |
| `soup_kitchen` | 10.48% | 37.29% | regenerated in daylight |
| `flea_market` | 18.74% | 34.08% | relit (gamma/saturation) |
| `farmers_market` | 19.03% | 36.20% | regenerated dry — rain removed |
| `memorial_garden` | 21.54% | 33.95% | relit (gamma/saturation) |

---

## 3. Known gaps and honest caveats

1. **`flea_market` still has wet ground and puddles.** I hit this session's
   image-generation cap (10) after three re-rolls, so it was relit with
   ImageMagick rather than regenerated. Its brightness is fixed but the baked-in
   rain still contradicts a "Clear" day. **Regenerate it first next session.**
2. **Balance is tuned against a proxy for skill.** `greedy` uses a weighted
   utility function, not a human. The bands are reasonable, but a real
   playtest may find the back half of a 200-day run harsher than intended.
   No human has played the retuned economy end-to-end.
3. **`alternate` at 10% death is a judgement call.** The core two-location loop
   is the game's advertised fantasy, so it is deliberately survivable. If you
   want it riskier, lower `ENERGY_RECOVERY` — at 13 it jumps to ~87%, which I
   judged too punishing.
4. **Repo is still ~190 MB of Git history.** ~50 MB of working-tree art was
   deleted, but shrinking `.git` needs a history rewrite (`git filter-repo`),
   which I did not do unilaterally. Git LFS for `assets/**` remains the
   recommended fix.
5. **Insight still overflows late.** All 10 perks cost 66 insight total; a long
   `alternate` run ends with ~130 unspent. Reputation also pins at 100 around
   day 126 and then gates nothing.
6. **No real-device pass.** Everything is jsdom-verified. The 320px/768px
   layout, touch targets and actual image loading are still unverified on
   hardware.

---

## 4. Working on this project

```bash
npm ci                  # install (needs the committed lockfile)
npm run serve           # → http://localhost:8000
npm test                # 293 tests, ~40s
npm run coverage:check  # enforces the 80% floor
npm run check           # tests + asset integrity
npm run simulate        # balance report
npm run assets          # rebuild docs/assets from assets/ (needs ImageMagick)
```

### Where things live

```
docs/            ← THE DEPLOYED SITE (GitHub Pages serves main → /docs)
  js/core/       rules, DOM-free, headlessly testable
  js/data/       pure catalogues (locations, events, characters, weather…)
  js/ui/         everything that touches the document
assets/          source art masters — NOT deployed, one canonical file per id
scripts/         build + tooling (simulate, check-assets, build-portraits…)
tests/           nine suites
notes/           internal notes, not shipped
```

**The rule that keeps this codebase clean:** `core/` and `data/` never
reference the DOM. Keep it that way — it is why the balance simulator was
possible to write in 40 lines.

### If you change game content

1. Run `npm run simulate` before and after. Compare death rates.
2. Run `npm test` — `tests/balance.test.js` will catch a broken economy.
3. If a balance test fails, **retune the content, don't relax the test.**

### If you change art

1. Replace the master in `assets/backgrounds/` or `assets/portraits/`.
2. Run `npm run assets` (needs ImageMagick).
3. Run `node scripts/check-assets.js` — enforces the 4 MB eager payload budget.
4. Check brightness against the House of Middleway ceiling:
   ```bash
   convert docs/assets/backgrounds/X.webp -colorspace HSL -channel B \
     -separate +channel -format "%[fx:mean*100]" info:
   ```

---

## 5. Recommended next steps, in order

1. **Regenerate `flea_market`** without rain (see caveat 1).
2. **Human playtest the retuned economy.** Especially days 60–150, where rent
   escalation starts to bite. The simulator says it works; a person should
   confirm it *feels* right.
3. **Give insight and reputation a late-game sink** (caveat 5). A second perk
   tier, or reputation unlocking something past 100.
4. **Real-device pass** at 320px / 768px / desktop.
5. **Git LFS migration** for `assets/**`, with the repo owner's agreement.
6. **Save export/import.** A 100-day run currently dies with the browser's
   local storage — this is in `DEVELOPMENT_ROADMAP.md` and still unaddressed.

---

## 6. Things that look like bugs but aren't

- **`resolveTurn` returns a no-op result with `alreadyResolved: true`** if
  called twice in one day. Intentional (§2.2).
- **The day-result modal ignores backdrop clicks.** Intentional (§2.7).
- **Weather effects stack per tag.** Intentional and documented (§2.3).
- **`home_loft` still has the highest single pick rate** (~43% for greedy).
  Under the 50% test threshold and acceptable — resting *should* be a common
  choice, it just shouldn't be free.
- **`ENERGY_RECOVERY` is 14, an odd-looking number.** It is load-bearing: 15
  makes `alternate` immortal again, 13 makes it 87% lethal.

NOTE (2026-07-31): This document is superseded by README.md, PROJECT_OVERVIEW.md, CHANGELOG.md, and AUDIT_2026-07-30.md / AUDIT_2026-07-31_SENIOR.md. Do not cite for current facts.
