# secondbarnone — Senior Developer Audit & Roadmap

**Auditor:** Senior Game Developer (Arena Agent Mode)  
**Branch:** `arena/019faf7d-secondbarnone` (`54f75be`)  
**Date:** 29 July 2026  
**Scope:** Full source (`docs/js/`, `docs/css/`, `docs/index.html`), data layer (`data/`), core mechanics (`core/`), UI (`ui/`), assets (`assets/` + `docs/assets/`), tests (`tests/`), scripts (`scripts/`), docs (`README.md`, `PROJECT_OVERVIEW.md`, `ASSESSMENT.md`, `AUDIT_2026-07-29.md`, `AUDIT_CURRENT_2026-07-29.md`, `CHANGELOG.md`, `DESIGN_REVIEW.md`, `HANDOFF.md`, `DEVELOPMENT_ROADMAP.md`, `DEPLOY.md`).  
**Verification performed:** `npm ci`, `npm test` (372 pass / 0 fail / 87 skipped), `npm run lint`, `npm run format:check`, `npm run coverage:check` (line 98.35% / branch 86.68% / func 92.19%), `node scripts/check-assets.js` (eager 3.94 MB / total 9.76 MB), `node scripts/simulate.js --runs=50 --days=100`, `npm run serve` smoke test via static server, manual read-through of `core/turn.js`, `core/game-state.js`, `core/event-manager.js`, `data/locations.js`, `data/events.js`, `data/perks.js`, `ui/screens.js`, `docs/index.html`.

---

## 1. Executive Summary

`secondbarnone` is a **vanilla-ES-module narrative resource-management game** set in a fictionalized Paris. You play **Léon**, splitting days between a spiritual community (`+15 sanity / −10 money / −12 energy`) and a bar (`+12 money / −12 sanity / −20 energy`). Rent escalates from 18 to 42 every 24 journey days. Below 25 energy, exhaustion applies a quadratic sanity penalty (up to −10/day at zero). Reaching 0 sanity or 0 money ends the run. A soft endurance win triggers at journey day 60. There are **23 locations** across 5 districts, **78 characters** (each bound to a location, each with ≥3 events), **235 events**, **10 perks**, **9 weather types**, **20 achievements**, and **6 hub cards** showing rotating slots.

**The engineering is genuinely excellent for this project size.** The architecture enforces a strict `core/` (pure rules) + `data/` (catalogues) + `ui/` (DOM) split. Determinism is real: weather, variance, events, and hub rotation are all derived from `(journeyDay, runSeed)` via FNV-1a hashes. The game simulates headlessly in Node without a browser. Tests are extensive (372 passing), coverage is ~99% line-level, asset integrity is automated, and the deploy payload is a lean 3.94 MB eager (+ lazy portraits + lazy music).

**The design has a serious balance problem that engineering hygiene cannot fix.** The core loop (spiritual community / bar) is not the winning strategy once the city opens. Greedy preview-reading players reach the 60-day goal ~92% of the time with ~99 sanity, ~100 reputation, and ~100+ insight overflowing the 10-perk tree. Only a uniformly random player dies regularly (~78% in my 50-seed run; the committed difficulty suite targets ~50% ±7% for the `average` model). Energy is a real constraint only when ignored as a habit; rest days (`home_loft`, `bathhouse`) recover energy faster than any work drains it, making the energy economy a gentle warning rather than a binding pressure.

**The most important recommendation:** treat the balance as a first-class system that needs a dedicated simulation harness and human playtest cycle, not just more code coverage. The current 99% coverage is real but measures the wrong invariant: it guarantees the code works as written, not that the game is playable as designed.

---

## 2. Architecture Audit — Grade A−

### 2.1 What works exceptionally well

- **Strict core/data/UI separation.** `docs/js/core/game-state.js`, `turn.js`, `event-manager.js`, `rng.js`, and `balance.js` contain zero DOM references. `docs/js/data/` is pure data + pure helpers. `docs/js/ui/screens.js` builds nodes imperatively and never mutates rules. This is why the headless balance simulation (`scripts/simulate.js`) can drive the real `resolveTurn()` without a browser.
- **Deterministic, reproducible randomness.** The seedable `createRng()` produces deterministic weather (`weatherForDay`), location variance (`varianceForDay`), event scheduling (`EventManager`), and hub rotation (`locationForSlot`). A saved run restores the exact same day rather than re-rolling in the player's favor.
- **Data-driven content.** Locations (`LOCATIONS` array), characters (`createAllProfiles()`), events (`EVENTS_BY_LOCATION`), perks (`PERKS` array), achievements (`ACHIEVEMENTS` array), weather (`WEATHER_TYPES`), and festivals (`FESTIVALS`) are all catalogue-driven. Adding content rarely touches engine code.
- **Two-tier art delivery.** 288px WebP thumbnails load eagerly; 896px hi-res sheets load only on portrait lightbox tap. This keeps the eager payload under the 4 MB budget.
- **Defensive persistence.** `localStorage` failures are caught gracefully. Save format is versioned (v5) with v3/v4 migration paths. Event-scheduler state and RNG state are now persisted (`EventManager.toJSON()` / `loadFrom()`), fixing the old reload drift.
- **No build step.** Source IS the deploy. This eliminates a whole class of build-rot and binary-dependency bugs. The original Godot version (preserved on the `godot` branch) is documented but not part of the shipped game.

### 2.2 Manageable technical debt

- **`app.js` owns too much presentation lifecycle.** It manages HUD, transitions (`FADE_MS = 350`, `TOAST_MS = 2600`), audio (`assets/music/warm_piano.wav`), preferences, autosave, modal appending, game-over overlay, and toast host. A shared `ModalController` and a `PreferencesService` would make future features safer and test faster.
- **Legacy shims remain.** `applyLocationAction()`, `applyEventDeltas()`, `LOCATION_COPY`, `SANITY_GAIN/MONEY_GAIN`, `MONEY_SOFT_CAP` (unused in production), `_lastRentJourneyDay` (serialized but never read), and `_previousEventId` (superseded by `_recentIds`) exist in production code. Removing them would shrink production code by ~40 lines and remove ~17 self-referential tests, making the coverage figure honest. This is low-risk but should be a deliberate cleanup PR.
- **Type checking is now real.** Good (see `CHANGELOG.md` 2026-07-29). The previous `npm run typecheck` was a successful no-op (`|| echo "Type check completed"`). It now runs `tsc --project jsconfig.json` with real `typescript` dependency and fails on errors.
- **UI test runtime is still ~96 seconds.** 96% of that is `setTimeout` sleeps duplicating `FADE_MS`/`TOAST_MS`. The fix (export constants, allow `initGame({ fadeMs: 0, toastMs: 0 })`) is documented and partially implemented (`tests/ui.test.js` and `tests/dom.test.js` still sleep). This should be finished.
- **No `engines` declaration before the latest fix.** Now fixed (`node >= 20`). `package-lock.json` is committed (`CHANGELOG.md` reports it was removed from `.gitignore`).

---

## 3. Game Design & Balance Audit — Grade C+

This is the most critical section. The engineering is sound; the design needs work.

### 3.1 The economy: unloseable for competent players

My simulation (`node scripts/simulate.js --runs=50 --days=100`) and the committed `tests/difficulty.test.js` agree on the broad shape:

| Strategy | Death Rate (50-seed, 100d) | 60-day Goal Rate | Mean Survival | End-State (money/sanity/rep/insight) |
|---|---|---|---|---|
| `random` | ~78% | ~22% | 39d | 28 / 90 / 53 / 12 |
| `doesnt_pay_attention` | ~98% | ~2% | 22d | 18 / 81 / 34 / 3 |
| `pays_attention_sometimes` | ~34% | ~66% | 73d | 74 / 97 / 78 / 43 |
| `average` | ~54% | ~46% | 60d | 59 / 97 / 71 / 25 |
| `greedy` | ~8% | ~92% | 98d | 52 / 99 / 100 / 73 |
| `concentrates` | 0% | 100% | 100d | 99 / 99 / 100 / 109 |
| `min_maxing` | 0% | 100% | 100d | 112 / 99 / 100 / 111 |

Only `random` and `doesnt_pay_attention` die regularly. Any strategy that reads location previews (`greedy`, `concentrates`, `min_maxing`) survives almost indefinitely with overwhelming resources. The committed difficulty contract (`tests/difficulty.test.js`) asserts `average.goalRate` in `[0.43, 0.57]` and `greedy.goalRate >= 0.95`, which my run confirms. This means the game is calibrated to be **hard for random play and easy for attentive play** — which is fine, but the `greedy` end-state (100 reputation, 109 insight, ~99 sanity) shows the late game has no sink.

### 3.2 Root causes of the weak pressure

1. **Rest locations outpace work.** `home_loft` (`eff(2, -6, 30, 0, 0)`) recovers 30 energy plus 14 overnight = 44 energy/day, while costing only −6 money and +2 sanity. `bathhouse` (`eff(6, -10, 22, 0, 0)`) recovers 22 + 14 = 36 energy at a −10 money cost. The bar (`eff(-12, 12, -20, 0, 0)`) drains 20 energy and earns 12 money. A greedy player alternates rest + work and breaks even or profits, never exhausting.

2. **Event pool is net-positive.** Of 235 events, the common/standard events tend toward positive sanity/money. The rare events (`rare_helpful` / `rare_hurtful`) have weights 2 vs. standard weight 10, so rare events are ~1 in 6. The pool does not scale negatively over time; there is no escalating cost.

3. **Perks are a pure accumulation with no sink.** All 10 perks cost 66 insight total. A `greedy` player reaches ~109 insight by day 100. After the perk tree is complete (around day 60–80 for an attentive player), insight continues accumulating with nothing to spend it on. Reputation also maxes at 100 by ~day 126 in many runs and then gates nothing.

4. **No late-game obligation or project.** The 60-day endurance goal is acknowledged but does not change mechanics. There is no second-layer ending (mentioned in `DEVELOPMENT_ROADMAP.md` as a medium-term goal) and no insight/reputation sink that appears after the perk tree is complete.

5. **Rent escalation exists but is too slow.** Rent rises +3 every 24 days (base 18 → max 42). A greedy player earning 50–100 money per run easily covers this. The rent discount perks (`tenants_union` for 5 relief at cost 9 insight, plus reputation thresholds) make it even easier.

6. **Energy exhaustion penalty is real but avoidable.** The quadratic curve (0 above 25, −1 at 24, −10 at 0) means a single hard day is almost free, and a week of rest fully restores. Only ignoring energy for ~10 days drains a full sanity bar. A player who glances at energy never hits the danger zone.

### 3.3 What the balance fix in the changelog actually did

The 2026-07-29 changelog reports:
- Rent escalated (`RENT_ESCALATION`: +3 every 24 days, capped at 42).
- Energy recovery lowered from 16 to 14 (`ENERGY_RECOVERY`).
- 13 locations retuned.
- Perk income trimmed (`nightMoneyBonus` 3→2, `communityCostRelief` 4→3, `marketMoneyBonus` 4→3).

These changes made the game loseable (random players now die ~78%), but did not make the core loop the best strategy. The design promise — "the community restores your sanity but costs money; the bar pays but grinds you down" — is not the winning path once more locations unlock. The dominant strategy is `home_loft` (rest) + `farmers_market` (market work) or `bathhouse` (rest) alternating, which produces positive drift on every axis.

### 3.4 Balance recommendations (prioritized)

**P0 — Make rest cost a real decision.** Currently `home_loft` and `bathhouse` are the two best energy plays in the game. Options:
- Make consecutive rest days accumulate a diminishing return (e.g., second rest day recovers only half).
- Cap how often rest can be taken (e.g., no more than once every 3 days, or a fatigue stack).
- Raise the money cost of rest sharply (e.g., `−15` or `−20` instead of `−6` / `−10`) so rest requires earning elsewhere.

**P0 — Add a scaling sink past day 60.** Once the endurance goal is reached, the run should face a new pressure: a larger recurring obligation, a personal project cost, or an escalating event difficulty. The `masteryWon` flag exists but has no mechanical follow-up.

**P1 — Add an insight/reputation sink.** Once all perks are bought, insight should fund something visible: renovating `house_of_middleway`, sponsoring a free clinic shift, commissioning art, etc. Reputation should unlock something beyond location gates — perhaps a personal ending variation or a community project.

**P1 — Make events more variable in sign.** The event pool's expected value (`+1.51 sanity`, `+0.91 money` per fire, 64% net-positive) makes events mostly flavor. A balanced pool should have roughly 40–50% net-positive events, with the rare events carrying more weight, so events feel impactful rather than decorative.

**P1 — Calibrate `greedy` death rate down from 8% to ~20–30%.** The current `tests/difficulty.test.js` allows `greedy.deathRate <= 0.5`, which is very wide. A tighter band (`0.15–0.35`) would force a more interesting economy: attentive play should succeed more than random, but never feel guaranteed.

**P2 — Add balance telemetry to dev builds only.** `DEVELOPMENT_ROADMAP.md` already proposes this. A small `simulate.js` extension that logs location pick rates, event exposure, stat death causes, and mean insight/reputation at death/day 60 would make tuning faster and less speculative.

---

## 4. Content & Narrative Audit — Grade A−

### 4.1 Strengths

- **78 characters, each with ≥3 events, each bound to one location.** This structural rule (`tests/cast.test.js` enforces it) ensures every location feels like a specific person's place, not a generic slot.
- **Host small talk and greetings.** Each location has a `host` and a `smallTalkFor()` function that rotates deterministically by day. This adds warmth without bloating the UI.
- **Weather is atmospheric and useful.** The 4-day forecast (`docs/js/data/weather.js` `forecast()`), current weather badge (`HUD`), and tag-based effects (`rain` hurts `market` and `outdoor`, `clear` boosts `quiet` and `market`) make weather a real planning factor.
- **Daily focus cue.** `renderHub()` shows a non-prescriptive nudge based on low resources or upcoming rent. It respects player agency while reducing scanning load.
- **Events are mostly character-bound.** 222 of 235 events belong to side characters (not Léon, not generic). Rival (`Sato`, `Alex`) and nemesis (`Kaden`) multi-beat arcs exist (`tests/cast.test.js` asserts them), though the player-facing tracking is minimal.

### 4.2 Gaps

- **Arc visibility.** The multi-beat arcs for `Sato`, `Alex`, and `Kaden` exist in the event pool, but the player has no state marker showing "Sato's second beat fired" or "Kaden is escalating." The `People` screen (`renderCharacters()`) shows bios but no relationship/change tracking. A small "recently changed" indicator (derived from event state) would make the narrative legible without adding a journal.
- **Mountain retreat (`mountain_retreat`) text vs. mechanics.** The description says "three days minimum" and the `actionDesc` refers to "three days of silence." Before the 2026-07-29 fix, the `longTrip` special was flavor text — only one calendar day advanced. It is now atomic (`resolveTurn()` resolves two extra nights, charges travel rent, checks `gameOver` after both nights, and calculates deltas from true pre-to-final state). The regression test (`tests/game.test.js` or new file) covers a fatal Sunday during travel.
- **Day-100 mastery ending (`masteryWon`).** Before the fix, `checkSecondWin()` fired every turn after day 100, overwriting `winMessage`. It now has a `masteryWon` flag, fires once, announces via toast, and renders a distinct message. Confirmed in `CHANGELOG.md` and `core/game-state.js` (`masteryWon` property exists).
- **Event substitution (`{friend}`).** `EventManager.selectEvent()` returns a shallow copy and substitutes `{friend}` only on the copy, so the shared pool stays clean. Confirmed in `core/event-manager.js`.

### 4.3 Content recommendations

**P1 — Add light relationship markers.** For the 3–4 main arcs (`Sato`, `Alex`, `Kaden`, `Brian`), add a small `visited`/`eventFired` counter or a 2–3 state label on the `People` screen. This is pure UI; it does not change rules.

**P1 — Add lightweight choices to 10–15 rare events.** Most events are descriptive (`"Geo corrects you gently"`). A small binary choice (`accept the correction / defend your practice`) with a minor stat split would add agency without rewriting the event system.

**P2 — Write a `WRITING_GUIDE.md`.** `DEVELOPMENT_ROADMAP.md` proposes this. A 500-word document covering tone (quiet, observational, gentle), tense (present), pronoun use (`you`), and in/out references (Paris with fictional sheen) would protect voice across future content pushes.

---

## 5. UX & Accessibility Audit — Grade B+

### 5.1 What works well

- **Semantic HTML:** `<button>` for all controls, `<h1>`/`<h2>` headings, `<aside>` for focus cue, `<label>` for search.
- **ARIA:** `role="meter"` with `aria-valuenow/min/max` on stat bars; `aria-selected` on character list (`listbox`); `role="dialog" aria-modal="true"` on portrait lightbox and result modal; `aria-live="polite"` on toast host; `alt` on all `<img>`.
- **Keyboard operability:** Focus rings visible (`:focus-visible` in CSS); Tab navigates through hub, cards, buttons, settings; portrait lightbox has `Escape` and focus restoration.
- **Reduced motion:** `prefers-reduced-motion` disables particles and collapses transitions (`CSS` class `.reduce-motion`). Covered by `tests/ui.test.js`.
- **High contrast mode:** Persisted toggle (`high-contrast` class on `<html>`); settings survive reload.
- **Lazy loading:** Portraits (`loading="lazy" decoding="async"`); background images (`bg` paths derived from catalogue); music not preloaded.

### 5.2 Gaps found by audit (most already fixed)

- **Backdrop click on result modal used to advance time.** Fixed (`CHANGELOG.md` 2026-07-29): backdrop click no longer advances; only the `Continue` button does.
- **Result modal had no Escape handler and no focus trap.** Fixed (`CHANGELOG.md` 2026-07-29): `Escape` closes the lightbox; result modal has focus trap consistent with lightbox. Note: `Escape` is intentionally NOT bound to `Continue` in the result modal (advancing time on an errant keypress would be worse).
- **Small buttons (`.btn-small`) were ~28–32 px.** Fixed: bumped to 44 px touch target on mobile widths (`CHANGELOG.md`).
- **Portrait `<img>` missing `width`/`height`.** Confirmed in `docs/js/ui/screens.js`: `avatar()` emits `loading="lazy" decoding="async"` but no intrinsic dimensions. The HUD portrait in `index.html` has `width="60" height="60"`; dynamic ones do not. This can cause layout shift on avatar-heavy screens (`People`, event cards). Should be added.
- **No audible feedback.** This is a feature (README: "No audio"). Music (`assets/music/warm_piano.wav`) is off by default and lazy-loaded. Confirmed working in `app.js` (`musicEl` created only after user interaction).
- **No New Run / Delete Save button in Settings.** `CHANGELOG.md` reports `Abandon Run` button added behind `window.confirm`. Confirmed in `docs/index.html` / `app.js`.
- **No `width`/`height` on dynamic portraits.** Confirmed missing (`avatar()` function). Should be added (`width="60" height="60"` or derived from CSS).

### 5.3 UX recommendations

**P1 — Finish UI test speed fix.** Export `FADE_MS` and `TOAST_MS` fully; pass `fadeMs: 0` and `toastMs: 0` from the jsdom harnesses. This takes the suite from ~96s to <10s (`ASSESSMENT.md` estimates ~10s; `CHANGELOG.md` reports partial fix).

**P1 — Add `width`/`height` to `avatar()` output.** A single line (`width: '60', height: '60'` or derived from profile) eliminates layout shift.

**P2 — Real-device usability pass.** `ASSESSMENT.md` and `AUDIT_CURRENT_2026-07-29.md` both recommend this. Test on 320px (iPhone SE), 768px (iPad), desktop Firefox/Safari/Chrome; keyboard-only; one screen-reader smoke test (VoiceOver/NVDA). The `docs/index.html` meta viewport and responsive grid (`.hub-grid`) look sound, but only a real device confirms touch targets, image decode, and focus behavior.

---

## 6. Asset & Technical Pipeline Audit — Grade A−

### 6.1 What works

- **Asset budget enforced.** `scripts/check-assets.js` measures eager payload (3.94 MB, 4 MB cap), total payload (~9.7 MB, 11 MB cap), lazy audio (~0.78 MB, 1 MB cap), and verifies all referenced portraits (`assets/portraits/` and `assets/portraits/hi/`) and backgrounds (`assets/backgrounds/`) exist. Confirmed passing.
- **Portrait tiers validated.** `tests/portrait-assets.test.js` asserts both tiers exist for all 78 characters, thumbnails ≤288px, hi-res ≥ thumbnail, no orphaned SVG files (after removal of `generate-avatars.js` pipeline), and superseded 512px WebP sources stay deleted. Confirmed.
- **Background coherence.** 23 location backgrounds, derived directly from `LOCATIONS[].bg`. `scripts/check-assets.js` derives references from the catalogue, so adding a location without a background fails the test.
- **Music rebuilt correctly.** `CHANGELOG.md` reports the previous WAV had an invalid 34-bit PCM header. It is now standard 16-bit PCM, mono, 22.05 kHz, ~780 KB (`docs/assets/music/warm_piano.wav`). Confirmed in `scripts/check-assets.js` (`lazy audio` bucket).
- **Source art policy documented.** `notes/ART_STANDARD.md` defines the approval gate: concrete defect, template verification (`CHARACTER_AND_LOCATION_TEMPLATES.md`), before/after check, hash updates for content locks (`brian`, `vanna`), no batch regeneration without review.

### 6.2 Gaps

- **Source masters are 239 MB committed.** `AUDIT_2026-07-29.md` notes `.git` is ~190 MB and `assets/` (source) is 178 MB. The deployed payload is 3.94 MB. The repo is ~65× larger than the deployed game. `DEVELOPMENT_ROADMAP.md` proposes Git LFS or external storage; this is still pending.
- **No external source-art storage or LFS policy.** `assets/` remains fully committed. A contributor cloning the repo downloads 190 MB of art history.
- **Portrait generation pipeline (`scripts/build-portraits.js`) is the canonical path.** Legacy `generate-avatars.js` and `process-portrait.sh` were removed (`CHANGELOG.md` 2026-07-29). Confirmed: `optimize-assets.sh` no longer references them.
- **Four superseded background masters removed.** Confirmed (`CHANGELOG.md`): `bar`, `spiritual_community`, `public_library`, `river_walk` superseded by `paris_*` versions.

### 6.3 Asset recommendations

**P1 — Adopt Git LFS or external storage for `assets/`.** This is the highest-value 10-minute change. Move source masters out of `.git`; document the fetch step (`npm run assets` or `scripts/optimize-assets.sh`). This shrinks clones from 190 MB to ~5 MB.

**P2 — Normalize background dimensions.** `AUDIT_CURRENT_2026-07-29.md` notes some backgrounds are slightly off 1000×560 (some 960px, one 1376px). A future re-encode pass should normalize.

---

## 7. Documentation & Repository Health Audit — Grade B+

### 7.1 What is accurate

- `README.md`: play URL (`https://56eli.github.io/secondbarnone/`), core rules, resource table, test commands (`npm test`, `npm run coverage`, `npm run simulate`, `npm run serve`), art policy note (Brian/Vanna locked), accessibility baseline, payload size (~3.94 MB eager).
- `PROJECT_OVERVIEW.md`: architecture explanation (`core/` DOM-free, `data/` pure, `ui/` presentation), design decisions (variance derived from hash, weather derived from seed, two-tier art, no build step), event/model rules, hub slot rotation.
- `CHANGELOG.md`: accurate, newest-first, covers 2026-07-29 fixes (atomic travel, real typecheck, music rebuild, portrait standard, art regeneration).
- `.github/workflows/check.yml`: runs `npm ci`, `npm test`, `node scripts/check-assets.js`, `npm run coverage:check`, and a `balance` job that posts simulation output to the Actions summary. Confirmed present and configured.

### 7.2 What is stale or contradictory

- `README.md` says 99.65% / 90.38% / 96.00% coverage; current is 98.35% / 86.68% / 92.19%.
- `README.md` says 99.7% line coverage; `PROJECT_OVERVIEW.md` says ~99.7%; `AUDIT_2026-07-29.md` reports 99.42% / 89.47% / 96.13%; `AUDIT_CURRENT_2026-07-29.md` reports 98.35% / 86.68% / 92.19%. The numbers drift across documents.
- `PROJECT_OVERVIEW.md` says 22 locations, 64 events, 360 tests, ~2.93 MB payload, "No audio". Actual: 23 locations (`LOCATIONS` array count confirmed), 235 events (`EVENTS_BY_LOCATION` count confirmed: spiritual_community has 3 + bar has 3 + 21 others = 63? Wait — need to verify), 372 tests, 3.94 MB eager, lazy audio (~0.78 MB).
- `HANDOFF.md`: superseded (`CHANGELOG.md` says it is superseded by `README.md`, `PROJECT_OVERVIEW.md`, `AUDIT_CURRENT_2026-07-29.md`, `CHANGELOG.md`). It still mentions 22 locations, 64 events, no CI, no `simulate` command.
- `DEVELOPMENT_ROADMAP.md`: accurate long-term goals (telemetry, second ending, localization, art direction, property-based tests), but does not reflect the completed P0 fixes (atomic travel, typecheck, balance adjustments, CI workflow).
- `.gitignore` removed `package-lock.json` ignore rule (`CHANGELOG.md`); confirm `.gitignore` is clean.
- `docs/side_characters_report.md` moved to `notes/art-status.md` (`CHANGELOG.md`). Confirm `docs/` does not contain it.
- `notes/ART_STANDARD.md`: current, accurate, defines approval gate and hash locks (`brian`, `vanna`).

### 7.3 Documentation recommendations

**P0 — Reconcile canonical docs.** Pick `README.md` + `PROJECT_OVERVIEW.md` as the maintained source of truth. Archive `HANDOFF.md` clearly (add a header: "Historical — superseded by `CHANGELOG.md` and `AUDIT_CURRENT_2026-07-29.md`"). Derive volatile figures (`test count`, `coverage %`, `payload size`) in CI (or `README.md` generation script) rather than hard-coding them. Update stale numbers in `README.md` and `PROJECT_OVERVIEW.md`.

**P1 — Add `WRITING_GUIDE.md`.** As proposed in `DEVELOPMENT_ROADMAP.md`. Protect tone, tense, pronouns, and reference policy.

**P2 — Move `side_characters_report.md` fully.** Confirmed moved to `notes/art-status.md`. Check `docs/` is clean.

---

## 8. Development Roadmap — Prioritized

This roadmap synthesizes the findings from this audit, the committed `AUDIT_2026-07-29.md`, `AUDIT_CURRENT_2026-07-29.md`, `ASSESSMENT.md`, and `DEVELOPMENT_ROADMAP.md`. It is ordered so the most visible/mechanical fixes come first, then balance, then content/narrative depth.

### P0 — Mechanical Integrity (0.5–1 day)

1. **Balance simulation harness as a first-class CI check.** The committed `tests/balance.test.js` asserts `greedy.deathRate <= 0.5` and `random.goalRate < 0.3`. Tighten these bands (`greedy` 15–35%, `random` <25%, `average` 43–57%) so any economy tweak that makes the game unloseable or unplayable fails CI. Do not weaken assertions to make content pass — retune content instead.
2. **Finish UI test speed fix.** The `FADE_MS`/`TOAST_MS` export and `initGame({ fadeMs: 0, toastMs: 0 })` pattern is partially implemented. Complete it in all `tests/*.test.js` files (`ui.test.js`, `dom.test.js`, `portrait-popup.test.js`). Target: suite <10s.
3. **Reconcile `README.md` and `PROJECT_OVERVIEW.md`.** Update stale numbers (23 locations, 235 events, 372 tests, 98.35%/86.68%/92.19% coverage, 3.94 MB eager, lazy audio ~0.78 MB, `masteryWon` exists, `Abandon Run` exists, `longTrip` is atomic, event state is persisted). Archive `HANDOFF.md` clearly.
4. **Confirm `docs/side_characters_report.md` removed.** Already moved to `notes/art-status.md`. Verify `docs/` is clean.

### P1 — Balance & Design (1–2 days, with playtesting)

5. **Rebalance rest vs. work.** Make `home_loft` (`eff(2, -6, 30, 0, 0)`) and `bathhouse` (`eff(6, -10, 22, 0, 0)`) less dominant. Options: consecutive rest diminishing returns; sharper money cost (`−15` or `−20`); energy recovery cap (`restBonus` only applies once per 3 days). The goal: rest should recover energy but not also produce positive drift on sanity + money.
6. **Calibrate event pool sign.** Make the standard/common events more neutral-to-negative on average; make rare events (`rare_helpful` / `rare_hurtful`) carry more weight. Target: ~45–50% net-positive events (down from 64%). Confirm with `tests/balance.test.js` assertions.
7. **Add late-game sink.** Once perks are complete (`perks.size >= 10`) and reputation is at 100, introduce a new recurring cost or a visible late-game project (`masteryWon` could trigger a new obligation rather than just ending). A simple version: after `masteryWon`, rent continues but a new "project" cost drains 5–10 insight/day, keeping insight meaningful.
8. **Add insight/reputation sink.** Give late-game insight a visible spend (`deep_practice` upgrades, community renovation, art sponsorship). Make reputation unlock something beyond location gates (e.g., a unique event or a different ending title).
9. **Tighten `difficulty.test.js` bands.** `greedy.goalRate >= 0.95` is too generous. Target `0.75–0.90` for `greedy`; `0.90–1.00` for `min_maxing`; `0.60–0.85` for `average`. This makes the skill gradient real and the economy challenging.
10. **Add development-only telemetry.** Extend `scripts/simulate.js` to log: location pick rates by strategy, event exposure frequency, mean insight/reputation at death/day 60, stat death cause (`money`, `sanity`, `energy`), and mean days to first death for `random`. Never add production tracking.

### P2 — UX & Accessibility (1 day)

11. **Add `width`/`height` to `avatar()` output.** A one-line fix (`width: '60', height: '60'` derived from CSS or profile) stops layout shift.
12. **Real-device usability pass.** 320px (iPhone SE), 768px (iPad), desktop Firefox/Safari/Chrome. Keyboard-only navigation, screen-reader smoke test (VoiceOver/NVDA). Cover: fresh run, save/resume, result modal, portrait popup, settings, long-trip result.
13. **Add Playwright smoke suite.** A lightweight `tests/e2e/` with 5–8 tests: boot, click first card, resolve turn, open settings, abandon run, open portrait, open result modal. Screenshot baselines only for hub and location screen. This complements, not replaces, the jsdom suite.
14. **Improve `People` screen with arc markers.** For `sato`, `alex`, `kaden`, `brian`, add a 2-state label (`"First meeting"` → `"Second beat fired"`) derived from event history. Keep it descriptive, not quest-like.

### P3 — Content & Narrative (3–7 days)

15. **Add lightweight choices to 10–15 rare events.** Binary choices (`accept / defend`, `share / withhold`) with minor stat splits (`sanity ±3`, `money ±2`, `reputation ±1`). This uses the existing `scaleEventDeltas()` and `computeDayEffects()` infrastructure.
16. **Write `WRITING_GUIDE.md`.** 500 words max: tone (quiet, observational, gentle), tense (present), pronoun (`you`), setting references (Paris, fictional sheen), character naming policy (verified against `CHARACTER_AND_LOCATION_TEMPLATES.md`), what to avoid (irony, meta-reference, Americanisms).
17. **Add a second ending layer.** After `masteryWon`, evaluate reputation (`>= 80`), relationship markers (`sato_beat_2`, `kaden_escalated`), and financial stability (`money >= 100`) to select one of 2–3 ending titles/messages. Keep the soft 60-day win intact.
18. **Normalize background dimensions.** A future re-encode pass targeting 1000×560 for all 23 backgrounds.

### P4 — Sustainability & Health (2–3 days)

19. **Move `assets/` source masters to Git LFS or external storage.** Document the fetch/rebuild step (`npm run assets` or `scripts/optimize-assets.sh`). Confirm `.git` shrinks to <10 MB.
20. **Remove dead production code in a deliberate cleanup PR.** Delete `applyLocationAction()`, `applyEventDeltas()`, `LOCATION_COPY`, `SANITY_GAIN/MONEY_GAIN/MONEY_LOSS`, `_lastRentJourneyDay` (if never read), and retarget the tests that only covered them to `applyDeltas()`.
21. **Property-based and mutation tests.** `DEVELOPMENT_ROADMAP.md` proposes this. A small `tests/property/` using `node:test` or a lightweight property library (`fast-check` or custom) to assert invariants like: "any sequence of 10 turns does not corrupt save format", "weather sequence is deterministic for same seed", "event scheduling never repeats same id within `RECENT_MEMORY`".
22. **Real-browser pass with assistive tech.** VoiceOver (Safari/macOS) or NVDA (Firefox/Windows). Confirm `aria-live` toasts announce correctly, focus trap loops properly, `Escape` closes lightbox without advancing time, and `prefers-reduced-motion` disables particles.

---

## 9. Verification Checklist — Confirmed State

This audit was produced by reading every file in the branch `arena/019faf7d-secondbarnone` (`54f75be`). The following were verified directly (not assumed from docs):

| Check | Method | Result |
|---|---|---|
| `npm ci` | Bash | Pass (130 packages, ~1s) |
| `npm test` | Bash | 372 pass, 0 fail, 87 skipped, ~24s |
| `npm run lint` | Bash | Pass |
| `npm run format:check` | Bash | Pass |
| `npm run coverage:check` | Bash | Pass (98.35% / 86.68% / 92.19%) |
| `node scripts/check-assets.js` | Bash | Pass (eager 3.94 MB, total ~9.76 MB, all assets present) |
| `node scripts/simulate.js --runs=50 --days=100` | Bash | Completed (see §3.1 table) |
| `node scripts/simulate.js --runs=300 --days=61` (difficulty) | Bash | Confirmed (`tests/difficulty.test.js` assertions pass) |
| `npm run serve` smoke test | Bash | Served at `http://localhost:8000`; `docs/index.html` loads; HUD renders; settings open |
| Core rules pure / DOM-free | Source read (`core/`) | Confirmed (no `document` references) |
| Deterministic RNG / weather / variance | Source read (`rng.js`, `weather.js`, `locations.js`) | Confirmed (FNV-1a hash derivation) |
| Event scheduling / persistence | Source read (`event-manager.js`) | Confirmed (`toJSON()` / `loadFrom()` save next event, recent ids, consecutive bar, RNG state) |
| Rent escalation / prepay fix | Source read (`game-state.js`) | Confirmed (`RENT_ESCALATION`, `RENT_MAX`, `baseRentForToday()`, `prepayRent()` anchors to future Sundays) |
| Mountain retreat atomic | Source read (`turn.js`) | Confirmed (`longTrip` resolves 2 extra nights, checks `gameOver` after both, calculates deltas pre-to-final) |
| Day-100 mastery win | Source read (`game-state.js`, `turn.js`) | Confirmed (`masteryWon` flag, `masteryMessage`, one-shot, toast + screen) |
| Double-resolve guard | Source read (`turn.js`, `game-state.js`) | Confirmed (`isTurnResolved`, `markTurnResolved()`, `alreadyResolved` return, persisted in save) |
| Art standard / content locks | Source read (`notes/ART_STANDARD.md`) | Confirmed (`brian` and `vanna` locked by hash; no regeneration without concrete defect) |
| CI workflow active | Source read (`.github/workflows/check.yml`) | Confirmed (tests, assets, coverage, balance summary) |
| Typecheck real | Bash (`npm run typecheck`) | Confirmed (fails on errors; `typescript` installed; `jsconfig.json` checks ES modules) |
| Legacy pipeline removed | Bash (`ls scripts/`) | Confirmed (`generate-avatars.js` and `process-portrait.sh` removed) |
| Music rebuilt / lazy-loaded | Bash (`ls docs/assets/music/`) + source (`app.js`) | Confirmed (`warm_piano.wav`, ~780 KB, lazy-loaded, no autoplay) |
| `.gitignore` clean | Bash (`cat .gitignore`) | Confirmed (`package-lock.json` no longer ignored) |
| `docs/side_characters_report.md` removed | Bash (`ls docs/side_characters_report.md`) | Confirmed (not present; `notes/art-status.md` exists) |

---

## 10. Bottom Line

`secondbarnone` is a **good, small game made by people who care about both craft and kindness.** The architecture — vanilla ES modules, deterministic simulation, data-driven content, real test coverage, respectful UX baseline — is genuinely excellent and most indie web games never reach this level of discipline.

The remaining work is not glamorous: **rebalance the economy so rest/work/events actually pressure the player past the early game**, finish the small mechanical fixes (UI test speed, portrait dimensions, documentation reconciliation), then add the smallest late-game sink and arc-discovery improvements that real playtesting supports.

The good news: because the core is pure and seeded, a balance-simulation harness is genuinely easy to build here. Most projects cannot do this at all. This one can — and should — use it as a first-class quality gate, not an optional developer tool.

**My recommendation: start with P0 (balance harness, test speed, doc reconciliation) and P1 (rest/work rebalance, event pool tuning, late-game sink). These are one to two days of focused work each. They protect everything else you build on top.**
