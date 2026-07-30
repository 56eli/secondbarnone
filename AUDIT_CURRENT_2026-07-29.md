# Historical record (superseded)

> **Frozen context — do not cite for current facts.** The counts, balances,
> and recommendations in this document describe an earlier revision.
> Authoritative sources as of 30 July 2026: `README.md`,
> `PROJECT_OVERVIEW.md`, `CHANGELOG.md`, and `AUDIT_2026-07-30.md`
> (current audit and prioritized action plan). Kept for context only.

---

# secondbarnone — current technical and game-development audit

**Audited:** 2026-07-29  
**Revision:** `73f4ce50cd7119d98ad7c814f455f78f9956e287` on `arena/019faf40-secondbarnone`  
**Scope:** shipped static web game (`docs/`), game rules and persistence, content/data, automated quality gates, assets, accessibility, and release process. This is a code, test, asset and headless-simulation audit. It is **not** a substitute for a real-browser/mobile playtest.

---

## Executive summary

This is a well-structured small web game with unusually strong automated coverage. The architectural decision to use vanilla ES modules, keep `core/` and `data/` DOM-free, and make weather/variance deterministic is paying off: rules are easy to simulate and content is largely data-driven. The project currently contains **23 locations, 78 characters, 235 events, 10 perks, 9 weather types and 20 achievements**. It has a pleasingly small eager deployment payload and a substantial test suite.

The Mountain Retreat accounting defect identified during this audit was fixed immediately after reproduction: travel days now resolve atomically, including final deltas and a second game-over check after travel rent. A regression test covers a fatal Sunday during the trip.

The next largest risks are tooling truthfulness (the typecheck is a successful no-op), stale documentation, lack of real-device testing, and late-run design validation. None requires a rewrite.

### Health scorecard

| Area | Grade | Assessment |
|---|---:|---|
| Core architecture | A | Clear split between pure rules/data and UI; module boundaries are sensible. |
| Rule/persistence integrity | A- | Deterministic scheduler/weather state is persisted; long-trip accounting is now atomic and regression-tested. |
| Automated tests | A- | 374 passing tests and strong coverage; no browser-engine or visual validation. |
| Build and CI | B- | Reproducible `npm ci`; CI exists, but skips lint/format and the typecheck is not real. |
| Content pipeline | A- | Strong catalogue invariants and asset checks; source-art repository weight needs an explicit policy. |
| UX/accessibility | B | Good semantic foundation, focus handling and preferences; needs actual browser/assistive-tech validation. |
| Balance/design validation | B- | Simulation gives a good baseline, but its strategies are proxies for people and no telemetry/playtest evidence is captured. |
| Documentation/release readiness | C+ | Several canonical documents contain obsolete numbers or contradicted feature claims. |

---

## What was verified

The following was run against a clean dependency install:

| Command | Result |
|---|---|
| `git fsck --full --no-reflogs` | Pass |
| `npm ci` | Pass; 130 packages installed, no audit vulnerabilities reported |
| `npm test` | **374 passed, 0 failed, 0 skipped**; ~96 seconds |
| `npm run lint` | Pass |
| `npm run format:check` | Pass |
| `npm run coverage:check` | Pass: **98.35% lines, 86.68% branches, 92.19% functions** against an 80% gate |
| `node scripts/check-assets.js` | Pass; all referenced assets and both portrait tiers found |
| `node scripts/simulate.js --runs=100 --days=200` | Completed; see balance section |
| `npm audit --omit=dev --json` | 0 vulnerabilities |
| `npm run typecheck` | **False pass**; `tsc` is not installed and the script deliberately converts failure to success |

Asset check measurements: **3.94 MiB eager** (4 MiB limit), **5.96 MiB** on-demand portrait tier, **0.78 MiB** lazy audio, **10.70 MiB total** (11 MiB limit). The working-tree source-art directory is 241.29 MiB; packed Git history is 251.20 MiB.

---

## Findings and recommendations

### Resolved — Mountain Retreat atomic accounting

**Where:** `docs/js/core/turn.js`, `resolveTurn()` long-trip section.

A retreat resolves the normal action, checks game over, and *then* advances two silent nights. Rent can be charged during those nights, but there is no second `checkGameOver()` afterward.

**Reproduction:** set the game to journey day 2 (Friday), money 32, high enough reputation for the retreat, and suppress events. Resolving `mountain_retreat` reaches Sunday during its two silent nights. The turn reports `extraRent: 16`; final state is `money: 0`, `gameOver: false` and the returned result reports `gameOver: false`.

This violates the stated rule that reaching zero money ends the run. It also creates misleading feedback: `result.deltas` is calculated *before* the two extra nights, so the modal's change chips omit both the recovery and travel-period rent even though its totals use the final state.

**Implemented:** the long-trip days are now one atomic resolution:

1. retain the snapshot of stats until after the extra nights and travel rent;
2. run achievements/win/game-over checks after every stat-changing phase, especially the final extra night;
3. calculate returned deltas from the true pre-turn state to the true final state;
4. add rule tests for a Sunday inside a long trip, including a zero-money death and exact displayed deltas.

The fix lives in `core/turn.js`, not `app.js`, and is covered by a dedicated regression test.

### Resolved — Type checking is an actual gate

**Where:** `package.json`, `npm run typecheck`.

TypeScript is now a tracked development dependency. `npm run typecheck` runs `tsc --project jsconfig.json` without a failure-swallowing fallback; `jsconfig.json` checks the shipped ES modules with `allowJs`, `checkJs` and `noEmit`. `package.json` now declares Node 20+ support, and the CI quality gate runs typechecking.

### P1 — Correct and consolidate project documentation

The repository contains multiple historical audit/handoff documents, but they disagree with shipped code and each other. Examples:

- README says 99.65% / 90.38% / 96.00% coverage; current measured coverage is 98.35% / 86.68% / 92.19%.
- `PROJECT_OVERVIEW.md` says 22 backgrounds, 360 tests, ~2.93 MiB eager payload and “No audio”; current build has 23 backgrounds, 374 tests, 3.94 MiB eager payload and lazy music.
- `HANDOFF.md` says 22 locations, 64 events, CI is not active, and recommends `npm run simulate`; the current repo has 23 locations, 235 events, an active workflow, and no `simulate` npm script.
- README and project overview describe earlier test/coverage counts and asset sizes as fixed facts.
- `.gitignore` still ignores `package-lock.json` even though the lockfile is correctly tracked. This can cause a future replacement lockfile to be silently ignored.

**Recommendation:** choose README plus a concise `docs/DEVELOPMENT.md` or one overview as the maintained source of truth; archive or clearly label historical postmortems/handoffs; derive volatile figures in CI instead of hard-coding them; add `"simulate": "node scripts/simulate.js"` if the documented command is desired; and remove the lockfile ignore rule.

### P1 — Add real-browser and device validation

The jsdom suite validates structure and interactions well, but cannot validate responsive layout, CSS rendering, image decode/loading, audio behavior, touch ergonomics, focus behavior in a real browser, or screen-reader announcements.

**Recommendation:** add a lightweight Playwright suite for Chromium/WebKit at 320 px, 768 px and desktop. Cover a fresh run, save/resume, a result modal, portrait popup, settings and a long-trip result. Add screenshot baselines only for the hub and a location screen; avoid brittle full-game snapshots. Then conduct a short manual pass with keyboard-only navigation and at least one mobile device.

### P2 — Tighten CI and reduce feedback time

The workflow runs tests, assets and coverage, but not lint, format checking or real type checking. It also runs the test suite once directly and again through the coverage gate, adding roughly 96 seconds of duplicate work.

**Recommendation:** make lint, format and genuine typecheck explicit CI steps. Either have coverage be the single test execution or cache/reuse its output so the suite is not run twice. Consider splitting fast pure-core tests from jsdom tests locally, while retaining the full suite in CI.

### P2 — Asset budget and source-art policy need headroom

The eager web payload is at **97.25%** of its 4 MiB budget and total payload is at **96%** of its 11 MiB budget. This is safe today but leaves little room for new backgrounds or music. Meanwhile source masters account for most repository size and Git history is already about 251 MiB.

**Recommendation:** set a target below the hard cap (for example 3.5 MiB eager and 10 MiB total), require an explicit trade-off for new art, and agree with the owner on Git LFS for `assets/**` or external source-art storage. Do not rewrite history without owner approval.

### P2 — Validate balance with people, then add development-only telemetry

The 100-seed, 200-day simulator currently reports:

| Strategy | Death rate | Reaches day 100 | Mean survival |
|---|---:|---:|---:|
| Random | 96% | 4% | 50 days |
| Alternate founding loop | 38% | 62% | 142 days |
| Greedy preview reader | 37% | 63% | 189 days |

This shows attention is rewarded and a random player is unlikely to succeed, but the strategies are authored utilities rather than humans. It does not answer whether the choices are legible, whether players understand weather/variance, or whether money/reputation/insight remain engaging after the city opens.

**Recommendation:** run 5–8 moderated playtests with day-1, day-20 and day-60 targets. Record decision rationale, deaths, ignored systems and moments of confusion. In development builds only, add opt-in/local diagnostic summaries for pick rates, event exposure, stat death cause and days survived; never add production tracking merely to tune balance. The current late-game resource sinks merit particular attention: all perks can be exhausted while insight and reputation continue accumulating.

### P2 — Improve narrative discoverability without bloating the UI

The content model is excellent: events are character-bound, hosts have small talk and locations feel authored. However, multi-beat arcs and relationship changes are hard to recognize without state markers, and location-specific event gating means players may not know where to return for a thread.

**Recommendation:** add a restrained “recently changed” marker in People or a compact journal entry when an arc beat fires. Keep it descriptive rather than quest-like. Test that the marker is derived from saveable event/arc state, not transient UI memory.

### P3 — Further accessibility and web hardening

Strengths already present include semantic buttons/headings, meter labels, visible focus styles, high contrast/reduced-motion preferences, lazy art, and focus trapping in the result modal. The portrait popup has a close button and Escape behavior. The day result correctly does not advance on backdrop click.

Follow-up improvements:

- test announcements and focus return with NVDA/VoiceOver rather than assuming ARIA works as intended;
- offer text-size and non-colour stat cues in Settings;
- add `width` and `height`/`aspect-ratio` for non-HUD inline portraits if layout-shift testing finds a problem;
- set an appropriate Content Security Policy and security headers where the Pages hosting configuration permits it; `el(..., { html })` is an escape hatch, so keep it unused for untrusted values.

---

## Architecture assessment

### What is working well

- **Pure, deterministic game layer.** `GameState`, `resolveTurn`, weather, variance and `EventManager` are DOM-free. This is the project’s strongest technical choice.
- **Data-driven content.** Locations, events, characters, perks, festivals, achievements and weather are catalogues with whole-catalogue invariant tests rather than ad hoc renderer logic.
- **Honest previews.** Per-day location variance and weather are seeded/hashes, so the player-facing preview matches resolution and does not reroll on refresh.
- **Persistence improved materially.** Save v5 stores scheduler/RNG state as well as game state, avoiding the old reload-driven event timing drift. Migration support for older saves is present.
- **Asset delivery is thoughtful.** Small portrait thumbnails load inline; 896-pixel images are loaded only by the portrait lightbox. Music is not preloaded or auto-played.
- **Defensive storage behavior.** LocalStorage failures are handled as best-effort instead of crashing play.

### Manageable technical debt

- `app.js` still owns transitions, audio, preferences, HUD, save flow and day-result presentation. It is not yet unmanageable, but a small modal/overlay controller and a preferences service would make future features safer.
- Several legacy compatibility exports/shims remain in the rules layer. Remove them only in a deliberate breaking-cleanup change, after confirming no external consumer needs them.
- Autosave is useful but insufficient as the only player-owned save path. Add export/import with schema validation before encouraging very long runs.

---

## Recommended delivery sequence

1. **Release blocker:** fix and test Mountain Retreat atomic resolution, including zero-money and result-delta cases.
2. **Quality gate:** make typecheck real; add lint/format/typecheck to CI; remove duplicate CI test execution.
3. **Truth pass:** reconcile README, overview, handoff and roadmap; fix lockfile ignore; add or remove the documented simulator command.
4. **Validation pass:** Playwright smoke tests plus mobile/keyboard/screen-reader manual testing.
5. **Design pass:** short human playtest round focused on day 20–100; then implement the smallest late-game sink and arc-discovery improvements supported by evidence.
6. **Sustainability:** define art storage/LFS policy and add save export/import.

---

## Bottom line

Keep the current architecture. It is lightweight, testable and appropriate for this game. Address the long-trip accounting bug and false-green typecheck first, then validate the presentation and economy with actual players. The most valuable next development is not a new subsystem; it is making the existing systems mechanically trustworthy, operationally verifiable and accurately documented.
