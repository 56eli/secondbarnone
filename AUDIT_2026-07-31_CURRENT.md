# secondbarnone — Current Senior Game Developer Audit

- **Audited revision:** `26ef9c23d4cace025e2d73d1ae4bfdb27e7c8639`
- **Release branch:** `crazy-branch` (`docs/` via GitHub Pages)
- **Package version:** `2.6.0`
- **Audit date:** 31 July 2026 (UTC)

**Scope:** product/game design, rules, balance, architecture, persistence, narrative/content, UI/UX, accessibility, assets/audio, performance, security/privacy, QA, CI, deployment, repository governance, recent changes, pending work, and roadmap.

## Remediation update — work started 31 July 2026

The findings below record the audited baseline. The implementation pass is now
underway with the following status:

### Implemented in the working branch

- Restored the owner-approved difficulty gradient while keeping zero energy
  immediately lethal: recovery 12 -> 13; measured 60-day goals are now 0% / 29%
  / 26% / 48% / 55% / 59% / 64% from inattentive through min-maxing.
- Fixed simulator energy-death misclassification, strict-alternation semantics,
  hidden-weather observability, independent decision/event RNG, production seed
  alignment, renovation purchasing and mastery reporting.
- Added shared `core/preview.js` so UI and simulator cannot drift.
- Applied the full CI upgrade: lint, format, typecheck, one coverage run,
  ImageMagick visual gates, canonical balance summary and Playwright browser job.
- Aligned Node support to >=22.22.2 and made lint warnings release-fatal.
- Centralized modal focus trapping/restoration, inert background, scroll lock and
  Escape policy across result/story/portrait dialogs.
- Added portable, validated JSON save export/import and stricter loaded-save
  normalization.
- Replaced long-trip private state mutation with public
  `GameState.advanceSilentDay()`.
- Added a 9-case Playwright matrix for Chromium desktop/320px and WebKit 768px.
- Retained the owner-approved 25% music default.
- Began the canonical documentation truth pass and archived superseded audits.

### Awaiting external verification or owner-level access

- Browser binaries could not download in this sandbox because the Playwright CDN
  TLS connection was reset. Tests enumerate successfully; the new CI browser job
  must provide the first engine-backed run.
- The GitHub integration returns HTTP 403 for changing the default branch,
  protection/rulesets, and issue state. Owner actions are documented in
  `notes/REPOSITORY_GOVERNANCE.md`.
- Human playtesting, NVDA/VoiceOver and commercial provenance decisions cannot
  be completed by automated code changes alone. The owner chose to defer
  master-art migration for the lowest operational burden; inactive LFS rules
  were removed and options documented.

---

## 1. Executive verdict

`secondbarnone` is a distinctive, content-rich browser game with unusually strong deterministic rule coverage for its size. The no-build ES-module architecture is proportionate, the core daily choice is readable, the Paris setting has personality, save/result rollback protections are thoughtful, and catalogue-wide tests protect 23 locations, 77 characters, and 232 events.

**Current assessment after remediation: B+ / release-candidate code, awaiting remote browser and owner-level GitHub verification.**

There is no P0 crash, data-loss, dependency-vulnerability, or remote-deployment blocker in the audited revision. The full local gate is green and GitHub reports both CI and Pages successful at the audited SHA.

The most important audited finding was a **balance-contract regression introduced after the documented v2.6 balance pass**. The hard zero-energy ending added in PR #48 reduced 60-day success substantially while assertions were loosened and docs retained older numbers. Remediation keeps the hard ending, corrects simulator fidelity/diagnostics, raises recovery to 13, and restores the approved gradient: average **48%**, concentrates **59%**, min-maxing **64%**.

The second major concern is release governance: the repository default is stale/diverged `main`, Pages serves `crazy-branch`, neither is protected, 41 remote branches remain, and a previous fix demonstrably landed on the wrong branch before being repeated. That is a recurrence risk, not merely tidiness.

### Release recommendation

- **Safe to keep deployed as a preview:** yes.
- **Safe to call the current balance final:** no.
- **Commercial/storefront-ready:** no; human playtesting, browser/assistive-tech validation, and asset provenance policy are still required.
- **Next engineering move:** repair the balance/simulator truth chain before adding more content.

---

## 2. Verified baseline

### Commands and checks run

| Check | Result |
| --- | --- |
| `npm ci` | 108 packages installed; clean lockfile install |
| `npm run check` | Baseline pass: lint, Prettier, typecheck, 435 tests, asset integrity; remediation suite now contains 446 Node/jsdom tests |
| `npm run coverage:check` | Remediation pass: **97.41% line / 85.28% branch / 90.57% function** |
| `npm audit` | 0 vulnerabilities |
| `npm outdated` | Only TypeScript's next major (7.x); no urgent update |
| `node scripts/simulate.js --runs=300 --days=61 --verbose` | Completed; current results recorded below |
| `node scripts/simulate.js --runs=100 --days=200 --verbose` | Completed; long-horizon hub stress report recorded below |
| `node scripts/check-assets.js` | Pass; payload budgets below |
| Local static-server smoke | Root 200, JS MIME correct, missing/traversal requests 404 |
| Import-cycle scan | No circular dependency found across `docs/js/` |
| GitHub Actions | Latest `check` run successful at audited SHA |
| GitHub Pages API | `built`, HTTPS enforced, source `crazy-branch:/docs`, audited SHA deployed |

A direct TLS fetch of the public Pages URL was unavailable from the sandbox, so browser rendering of the remote endpoint was not independently asserted here. The Pages build/deploy jobs and source SHA are green through GitHub's API.

### Current product inventory

| Item | Current count/state |
| --- | ---: |
| Locations | 23 across 5 districts |
| Hub | 2 fixed founding cards + 4 deterministic rotating slots |
| Characters | 77: 1 protagonist, 1 arch-nemesis, 2 rivals, 73 side characters |
| Events | 232; 219 belong to side characters; all currently one-shot per run |
| Perks | 10 |
| Renovations | 4 |
| Weather types | 9 |
| Festivals | 9 |
| Achievements | **21** |
| Tests | Baseline 435/19 files; remediation branch 446 Node/jsdom tests/20 files + 9 Playwright cases |
| Save schema | v6 in `localStorage`, migrations from v3-v5 |
| Runtime | Static HTML/CSS/vanilla ES modules; no production dependencies or build step |

### Payload

| Tier | Measured | Budget |
| --- | ---: | ---: |
| Eager/conservative deploy tier | **3.85 MB** after remediation code | **10.00 MB owner-approved** |
| Portrait lightbox tier | **5.37 MB** | lazy/on demand |
| Music | **0.78 MB** | lazy, 1.00 MB cap |
| Total `docs/` payload | **10.01 MB** | 11.00 MB |

The audited 4 MB cap had only 0.16 MB remaining. During remediation the owner raised this conservative tier to **10 MB**; the separate 11 MB total and 1 MB audio caps remain.

---

## 3. Scorecard

| Area | Grade | Assessment |
| --- | --- | --- |
| Core game concept | **A-** | Strong one-choice-per-day identity, clear resource tension, memorable setting. |
| Current balance | **B+** | Approved gradient restored with hard energy death; deterministic contract is green, human feel remains unverified. |
| Architecture | **A-** | Proportionate, deterministic, data-driven; a few lifecycle/private-method seams remain. |
| Code quality | **B+** | Readable and typed JS; larger state/UI modules and stale comments increase change risk. |
| Narrative/content | **A-** | Large, location-bound authored catalogue with good voice and no duplicate event text. |
| Persistence/lifecycle | **A-** | Rollback-safe autosave, migrations, portable validated backups and public silent-travel lifecycle. |
| UI/UX | **B+** | Cohesive hub, useful previews, stable slots, strong portrait affordances. |
| Accessibility | **A- code / B human evidence** | Shared modal containment and browser matrix added; real AT remains unverified. |
| Automated QA | **A-** | 446 Node/jsdom tests, high coverage, full CI gates and 9 browser cases; first remote browser run pending. |
| Assets/audio/performance | **B+** | Two-tier portraits, reproducible audio, budget checks; eager budget is almost full. |
| Security/privacy | **A-** | Static, local-only, CSP, no telemetry/third parties, safe text insertion, 0 dependency vulnerabilities. |
| Documentation truth | **B+** | Canonical facts reconciled and superseded audits archived; historical entries remain intentionally dated. |
| Release/repository governance | **C** | Split branch authority, no protection/rulesets/tags, 41 branches; source-art migration deliberately deferred. |

---

## 4. Priority findings

No P0 issue was found.

### P1 — The post-v2.6 energy change invalidated the documented difficulty contract — **resolved in remediation branch**

PR #45 measured and documented the following 300-seed, 61-day hub goals: random 27%, greedy 27%, average 42%, sometimes-attentive 45%, concentrates 61%, min-maxing 66%.

PR #48 then made energy reaching zero an immediate game over. Its same change also lowered `tests/difficulty.test.js` thresholds:

- average: 35-50% -> 20-35%;
- concentrates floor: 50% -> 25%.

The current measured contract is:

| Model | Current goal | Current death | Documented goal |
| --- | ---: | ---: | ---: |
| `doesnt_pay_attention` | **0.0%** | 100.0% | 0% |
| `random` | **16.7%** | 83.3% | 27% |
| `greedy` | **20.0%** | 80.0% | 27% |
| `average` | **26.3%** | 73.7% | 42% |
| `pays_attention_sometimes` | **28.3%** | 71.7% | 45% |
| `concentrates` | **29.0%** | 71.0% | 61% |
| `min_maxing` | **33.0%** | 67.0% | 66% |

Informed rotating-card usage is still healthy at **28.5-44.6%** (test floor 25%), so the six-card hub itself is not the main problem. The issue is survivability and differentiation: `pays_attention_sometimes` and `concentrates` differ by only 0.7 percentage points, while the best proxy reaches the goal only one time in three.

The older `tests/balance.test.js` has a test named “a competent player reaches the goal most of the time,” but its assertion now accepts 15%, and its own comment says the fixed run set achieves roughly 2/12. That name, intent, and threshold no longer agree.

**Action:** make an explicit design decision.

1. If the intended fantasy is the documented “engaged play wins about three in five,” retune the economy around the hard energy death without removing that ending.
2. If the intended fantasy is a severe survival game where optimized play wins about one in three, update README, overview, tests, changelog interpretation, and player-facing expectations honestly.
3. Do not solve this by changing only thresholds again. Add before/after simulation output and human playtest evidence to any tuning PR.

### P1 — The simulator misclassifies energy deaths as money deaths — **resolved in remediation branch**

`scripts/simulate.js` records a death cause as:

```js
gs.sanity <= 0 ? 'sanity' : 'money'
```

There is no energy branch. Since PR #48 made zero energy lethal, every energy death is currently reported as a money death. The current report's “money 236” style diagnostics therefore cannot be trusted. This matters because the simulator is being used to tune an energy-centered game.

Related truth gaps:

- `doesnt_pay_attention` is described as alternating the founding pair, but the implementation randomly selects one of the two; a separate `alternate` strategy exists but is not in the player assessment.
- Models see exact averages under fog/rain/snow.
- Decision and event selection share one RNG stream.
- Production events use the city seed; simulation uses `seed + 7`.
- Models buy perks automatically but never fund renovations.

All six items are now addressed and recorded in `notes/SIMULATOR_FIDELITY.md`;
remaining limitations concern authored utility proxies and the need for human
playtests rather than mechanical browser/simulator drift.

**Action:** fix diagnostic correctness before the next balance pass, then split observable previews and decision/event RNG streams. Keep model percentages labelled as regression instruments, not human forecasts.

### P1 — Remote CI is green but incomplete — **workflow upgraded; remote run pending**

The active workflow runs:

1. `npm ci`;
2. `npm test`;
3. asset size/reference check;
4. `npm run coverage:check` (which runs the complete test suite a second time);
5. a separate 100-seed/200-day balance report.

It does **not** run lint, format check, or typecheck. It also does not explicitly install ImageMagick, so portrait dimension/luminance tests can skip depending on runner image. The desired 300-seed/61-day canonical report is not what remote CI publishes.

The reviewed workflow upgrade has now been applied directly and the obsolete
patch/authorization notes removed. The first remote browser/visual run remains
pending because this sandbox cannot download Playwright browsers.

**Action:** apply the reviewed workflow upgrade through an authorized PR, verify zero skipped visual tests, and make the single coverage run the test gate. Add workflow concurrency/cancellation for superseded branch pushes if CI volume grows.

### P1 — Branch and release governance has already caused deployment mistakes — **owner access required**

Current state:

- GitHub default branch: `main`.
- Pages/release branch: `crazy-branch`.
- `main` and `crazy-branch` have diverged (each has four commits after their merge base).
- Both report `protected: false`; no repository rulesets are configured.
- 41 remote branches exist, mostly merged Arena session branches.
- There are no GitHub Releases or version tags.
- An earlier fragile-fraud/audio fix was merged to `main` in PR #50 and did not deploy; PR #51 had to apply the release fix to `crazy-branch`.

This is a demonstrated operational defect. CI success does not prevent a reviewed fix landing on the non-release branch.

**Action:** choose one canonical branch. Prefer making `crazy-branch` the default immediately, then either merge/reconcile and retire `main`, or deliberately promote a single protected `main` and change Pages. Add required status checks, disallow direct pushes for release changes, prune merged session branches, and tag the next accepted release.

### P1 — Declared Node support is broader than the locked toolchain supports — **resolved in remediation branch**

`package.json` declares `node >=20`, but the locked direct/transitive toolchain includes:

- `jsdom@30.0.1`: `^22.22.2 || ^24.15.0 || >=26`;
- `eslint@10.8.0`: `^20.19.0 || ^22.13.0 || >=24`;
- other packages requiring specific modern 20/22 patch levels.

A user on early Node 20 satisfies the project declaration while not satisfying the locked dependencies.

**Action:** either declare `node >=22.22.2` (matching current CI/runtime) or deliberately downgrade tooling to a Node 20-compatible set. Add `.nvmrc`/`.node-version` if contributor consistency matters.

### P1 — Modal accessibility is incomplete despite “full keyboard operability” claims — **code resolved; human AT pass pending**

Strengths include semantic buttons, meter roles, destination-heading focus, visible `:focus-visible` treatment, reduced-motion handling, result-modal focus trapping, and portrait-lightbox Escape/focus restoration.

Remaining issues:

- `renderStoryModal` (Kaden smear and enlightenment victory) focuses an action but does not trap Tab. Keyboard focus can move into the obscured page.
- The page behind custom modals is not made `inert` or explicitly hidden from assistive technology.
- The result modal's comment says “Focus management + Escape,” but Escape intentionally has no behavior; documentation should describe this as a non-dismissable modal, not Escape support.
- No Chromium/WebKit/Firefox, NVDA, VoiceOver, zoom/reflow, or real-touch pass has been performed.

**Action:** centralize all dialogs through one modal primitive with focus trap, focus restoration, scroll lock, and `inert` background handling. Then validate on real browsers and at least NVDA or VoiceOver.

---

## 5. Secondary findings and risks

### Documentation truth is not under control

Examples in files marked canonical:

- README/current audits use the obsolete 27/42/45/61/66 balance table.
- `tests/difficulty.test.js` still says the old numbers were “Measured (300 runs each, v2.6)” while asserting lower bands.
- `PROJECT_OVERVIEW.md` says reputation starts at 10; production starts at 80 and drops to 15 on day two.
- Static `docs/index.html` initializes the reputation meter/text to 10, causing stale no-JS/fallback markup and a possible pre-boot flash.
- Overview says 20 achievements; production has 21 after the enlightenment achievement.
- Overview says 425 tests; current suite reports 435.
- README still advertises “a temple ruin”; that location is now LoC Mines.
- README says “Eleven things” and enumerates twelve.
- Coverage is currently 85.92% branch, while docs round/cite 86.00%; this is minor but illustrates manual metric drift.
- `AUDIT_2026-07-31_SENIOR.md` calls the build blocked by a missing-jsdom failure and CI authorization even though `npm ci`, CI, and deployment are now green; `AUDIT_2026-07-31_WRAPPED.md` then partially supersedes it with inconsistent simulation numbers.
- `notes/BALANCE_REGRESSION_POSTMORTEM.md` still says recovery 14, rent every 24 days, cap 42; current values are 12, 14 days, cap 48.

**Recommendation:** this audit should become the current audit pointer. Move superseded root audits to `archive/` or add a prominent supersession header. Generate inventory/balance/coverage tables from scripts where practical.

### Open issue hygiene

There are no open PRs and three open issues:

- **#44 Kaden smear:** implemented and owner-accepted for closure.
- **#47 URL description:** implemented exactly as `WIN GAME = GAIN LOC` and accepted for closure.
- **#46 music/default:** the owner explicitly accepted the restored track and **25%** canonical default on 31 July 2026.

Closing comments were prepared, but the connected GitHub integration returned
HTTP 403 for issue mutations. An owner-authorized connection must close them.

### Long-trip lifecycle brittleness — resolved

`GameState.advanceSilentDay()` now owns silent calendar movement, recovery, rent
and announcement. `turn.js` no longer mutates private calendar/stat internals.
The atomic pending-result and three-day return tests remain.

### Save handling is robust and now portable

Good protections:

- resolved results persist before Continue;
- pending modal restoration closes rollback;
- event scheduler/RNG state persists;
- schema versions v3-v6 migrate;
- corrupt JSON/storage failures are nonfatal;
- out-of-turn spending cannot consume the last money.

Settings now exports/imports a human-readable JSON backup. Imports migrate and
normalize through a fresh v6 `GameState`, reject completed/non-playable runs,
filter unknown catalogue ids and preserve safe scheduler/pending-result extras.
The automatic local slot remains intentionally singular, while a long run can
now be backed up or moved between browsers.

### Event supply is broad but finite per location

All 232 authored events are one-shot. That protects narrative credibility, but a player repeatedly favoring one location can exhaust its 9-13 event pool well before a long run ends. The global catalogue is large; the local experience can still become quiet.

**Recommendation:** do not add generic repeats immediately. Observe long-play behavior first, then add a small repeatable ambient pool per location only if human tests show dead air.

### Asset pipeline is strong, but storage and budget need decisions

Strengths:

- all portrait master/thumb/hi bytes are SHA-pinned;
- 77 thumbnail and hi assets exist;
- portrait tiers are appropriately lazy;
- all 24 deployed backgrounds (23 locations + hub) are referenced;
- warm-piano source/deploy relationship is tested;
- no single eager asset exceeds the configured cap.

Risks:

- the original 4 MB tier had only 0.16 MB headroom; the owner subsequently raised it to 10 MB;
- source `assets/` is about 252 MB;
- local packed Git objects are about 258 MiB in this shallow checkout;
- source masters remain ordinary Git blobs by explicit low-burden owner decision; inactive LFS attributes were removed;
- backgrounds vary in aspect ratio (1000x558/563/667, one 960x536). CSS can crop them, but composition should be reviewed at target viewports;
- AI-generated art/content is disclosed, but SHA provenance is integrity, not a commercial-use license chain.

The owner has deliberately raised the conservative tier to 10 MB. Continue reviewing growth against the separate total/audio caps rather than treating the larger ceiling as a reason to ship unoptimized art.

### Maintainability is good, not finished

- `game-state.js` is about 1,000 lines, `screens.js` about 1,350, `style.css` about 1,900, and `events.js` about 2,400 (mostly data).
- The present split is still understandable and no framework migration is warranted.
- `app.js`, screen renderers, and modal behavior should be split only along proven seams; avoid abstraction for its own sake.
- Data objects are often shallow-frozen rather than deeply immutable.
- Lint uses warnings for unused variables/prefer-const; CI would not fail those even after the workflow patch unless warnings are promoted or `--max-warnings=0` is used.

---

## 6. Area-by-area audit

### Game design and economy

**What works**

- One consequential choice per day is a strong, legible loop.
- Sanity/money/energy form an understandable triangle.
- Rent, weather, festivals, variance, perks, and unlocks interact without requiring a heavy engine.
- The stable six-card layout builds location memory while rotating content.
- Day-one Brian welcome and day-two Kaden smear create an immediate social/story frame.
- Weather-hidden previews are an effective anti-spreadsheet idea.
- Soft day-60 success and optional long-form enlightenment suit the game's tone.

**What needs proof**

- Immediate zero-energy death changed difficulty dramatically.
- Most current simulated deaths are reported under the wrong cause, so diagnosis is weak.
- Human readability under fog/rain/snow has not been tested.
- Simulator models do not represent renovation spending or real hidden information.
- No end-to-end human evidence confirms days 1-20 onboarding, days 20-60 difficulty, or days 60-150 pacing.
- Renovations require 125 insight and 140 money in addition to the 68-insight perk tree; the day-150 gate is only a minimum and may resolve much later. This needs intentional pacing tests rather than a reachability-only unit test.

### Architecture and correctness

**What works**

- Plain ES modules are appropriate for scope.
- Core rules are DOM-free and testable headlessly; storage is injected despite browser-default helpers.
- Seeded weather/variance/event state makes reproduction practical.
- `balance.js` is a useful single source for top-level tuning constants.
- Data-driven catalogues and whole-catalogue assertions prevent common content drift.
- No import cycles were found.
- Dynamic UI content uses `textContent`; no untrusted HTML sink was found.

**Risks**

- Multi-day travel bypasses normal day advancement through private methods.
- The largest state/UI files are approaching the point where lifecycle changes need extra review.
- Simulator and production lifecycle are similar but still not the same observability/RNG model.

### Narrative and content

**What works**

- Every character is bound to one location and has at least three events.
- Every location has a host and a meaningful event pool.
- No duplicate event IDs, titles, or descriptions were found.
- Event descriptions average about 22 words (range 14-35), which supports concise modal reading.
- Ordered Sato/Alex/Kaden beats and one-shot events improve continuity.
- The writing is specific, warm, and more memorable than the mechanical scope alone would suggest.

**Risks**

- There is no concise current writing guide beyond examples/templates.
- Long local event pools can exhaust.
- AI-generated content needs an owner-approved commercial provenance policy before monetization.

### UX and accessibility

**What works**

- Hub is the complete city route; no redundant map layer.
- Preview treatment changes coherently with weather.
- Portrait popups are consistent and lazy.
- HUD resources, warnings, and focus cue are readable.
- Keyboard semantics and focus-visible styles are generally good.
- Reduced motion and high contrast are persistent settings.

**Risks**

- Story-modal focus containment and background inertness.
- No real-browser responsive/reflow test.
- Tiny secondary text reaches roughly 10-11px in several places; actual mobile legibility should be checked at 200% zoom and narrow widths.
- Initial reputation fallback markup is stale.
- Custom modal behavior has multiple implementations (`ModalController`, result-modal key handler, portrait popup, story modal), which is why accessibility behavior differs.

### Security and privacy

- Static site, no backend/accounts/ads/analytics/cookies.
- No third-party runtime scripts or network APIs.
- CSP restricts scripts/media/images to self; `style-src 'unsafe-inline'` is needed by current inline style generation but weakens style policy.
- No `eval`, `new Function`, `document.write`, or `innerHTML` content sink found.
- Save/preferences stay in local storage.
- Dependency audit is clean.
- `window.__game` allows local cheating/debugging, which is acceptable for this single-player local game.

No meaningful security blocker was found.

### Performance and delivery

- No production JS framework/dependency cost.
- Background predecode and cross-dissolve have bounded wait.
- Portrait and music lazy tiers are sensible.
- Total payload is acceptable for an art-heavy static game, but the “eager” budget is a conservative all-nonlazy-file total rather than measured initial network transfer.
- No Lighthouse/Core Web Vitals/network-throttling measurement has been performed.
- GitHub Pages legacy deployment is simple and currently green.

---

## 7. Recent changes review

The last two days contained a very high rate of broad changes. The sequence matters because later work invalidated earlier audit metrics.

| PR | Change | Audit assessment |
| --- | --- | --- |
| #40 | Renovations, relationship markers, modal/preferences extraction, portrait rebuild, LFS attributes | Good feature/architecture work; no LFS migration occurred and inactive attributes were later removed by owner direction. |
| #43 | Hard Winter retune, hidden-weather previews, weekly gates, winter polish, seed links, art locks | Strong systems pass; measured 52-61% engaged goals before later hard-death change. |
| #45 | v2.6 lifecycle/save fixes, one-shot ordered arcs, fog focus, rotating-share tuning, portraits/audio/docs | High-value stabilization; its 27/42/61/66 balance table is now obsolete. |
| #48 | Immediate energy-zero game over, Kaden day-two smear, day-150 renovation ending, music/default changes | Product-significant. Hard death compressed success; tests were loosened in the same PR without a full documentation retune. |
| #49 | Enlightenment achievement snapshot fix, long-trip resolved-day fix, metadata | Correct P0/P1 follow-up; validates the private lifecycle seam was fragile. |
| #51 | Restore original warm piano, fix day-one fragile-fraud CSS, show Kaden, remove heading focus ring | Good owner-reported UX fixes with focused regressions. |
| #52 | Archive old docs, clean `.gitignore`, add audit/CI notes | Useful hygiene, but the new audits still contain stale balance and release assertions. |

### Change-process observation

PRs #43, #45, #48, #49, #51, and #52 landed in less than a day and touched gameplay, art, audio, save schema, accessibility, balance tests, and documentation. Automated coverage remained green, but the accepted product contract drifted. The next cycle should reduce breadth per PR and require a short “design contract changed / unchanged” section for economy and endings.

---

## 8. Pending actions

### Must resolve before calling v2.6 balance-final

1. Decide the target difficulty after hard energy death.
2. Fix simulator energy-death classification and model naming/behavior.
3. Re-run and publish one canonical 300-seed/61-day table.
4. Human-playtest the chosen target.
5. Update difficulty tests, README, overview, and current audit together.

### Engineering/release actions

1. Verify the upgraded quality/browser/balance workflow on the release PR.
2. Use owner-authorized GitHub access to set/protect `crazy-branch`, close
   #44/#46/#47, and later prune merged session branches.
3. Run the new Playwright matrix remotely and fix any engine-specific result.
4. Conduct the human mobile/assistive-technology and balance passes.
5. Add a release tag and release notes after the remediation PR is accepted.
6. Complete the remaining master-art storage and provenance decisions.

### Owner/business actions

1. Conduct or authorize human/mobile/assistive-tech playtests.
2. Revisit source-art storage only if clone/storage cost becomes a concrete problem; current decision is no migration.
3. Approve a commercial provenance/licensing policy for generated content/art.
4. Approve branch pruning/history/storage changes.

---

## 9. Future roadmap

### Phase 0 — Truth and balance triage (1-3 days)

**Goal:** make code, tests, simulator, and docs describe one game.

- Add `energy` as a simulator death cause and report mean ending energy.
- Make `doesnt_pay_attention` truly alternate, or rename it to “random founding pair.”
- Record current hidden-weather/RNG limitations in simulator output itself.
- Choose the intended 60-day bands with the owner.
- If restoring a stronger skill gradient, retune action energy, nightly recovery, rest access, or hard-zero behavior as a cohesive economy—not one constant in isolation.
- Replace stale balance/count/resource values in all canonical docs and fallback HTML.
- Update the open issues to reflect actual acceptance state.

**Exit criteria:** one reproducible 300-seed report; tests and docs use the same bands; no misleading test names/comments.

### Phase 1 — Release pipeline and governance (2-5 days)

**Goal:** prevent the wrong branch or an incomplete gate from shipping.

- Apply the CI upgrade: lint, `format:check`, typecheck, one full coverage run, asset check, ImageMagick, canonical balance summary.
- Consider `eslint --max-warnings=0` for release CI.
- Align Node engine/version files.
- Set the release branch as default and protect it with required checks.
- Reconcile `main` and `crazy-branch`; remove ambiguity from DEPLOY.md.
- Prune merged Arena branches after owner approval.
- Tag the accepted release.

**Exit criteria:** a test PR cannot merge with lint/type/visual failures; default branch equals documented release authority.

### Phase 2 — Human UX and accessibility validation (1-2 weeks)

**Goal:** validate the experience the DOM tests cannot see.

- Add small Playwright coverage for Chromium and WebKit at 320px, 768px, and desktop:
  - fresh run and day-one welcome;
  - day-two Kaden interlude;
  - one ordinary turn/result/Continue;
  - save/reload pending result;
  - long trip;
  - settings/audio toggle;
  - portrait popup;
  - game over/restart.
- Consolidate modal focus trap/inert/restore behavior.
- Run keyboard-only and 200% zoom/reflow checks.
- Perform one NVDA or VoiceOver pass.
- Run structured human playtests: onboarding (days 1-10), first pressure peak (10-30), goal attempts (to day 60), and at least two long-run renovation attempts.
- Capture choice reasons, perceived fairness, weather readability, and death cause—not just success rate.

**Exit criteria:** no blocker at target viewports/input modes; human notes support or revise the selected difficulty bands.

### Phase 3 — Simulator and long-run systems (2-4 weeks)

**Goal:** make future tuning safer and the 150-day arc worth carrying.

- Build a DOM-free observable-preview API so models see exact/banded/veiled information like players.
- Separate player-decision RNG from event RNG; align production and simulation seed conventions.
- Add renovation-aware long-horizon models and report day-150/actual-enlightenment distributions.
- Add save export/import with schema/version validation.
- Evaluate event exhaustion and add limited ambient repeats only if observed.
- Review renovation costs/rewards, reputation after 80/100, and insight after the perk tree.

**Exit criteria:** long-horizon reports include renovations and correct causes; 150-day pacing is intentional; players can back up a long save.

### Phase 4 — Asset/release maturity (later, owner-led)

- Keep master art unchanged for now; if concrete storage pain appears, revisit the documented LFS/separate-repository options without a casual history rewrite.
- Keep deployed assets in Git/Pages and preserve SHA manifest checks.
- Establish per-asset provenance/license records for commercial use.
- Measure Lighthouse/Web Vitals on throttled mobile and optimize before raising payload budgets.
- Add PWA/offline support only if it serves a real player need; do not let service-worker cache invalidation destabilize the current simple deploy.
- Maintain release tags and a short current changelog; keep old audits archived.

---

## 10. Definition of the next release candidate

The next release candidate should satisfy all of the following:

- [ ] Owner-approved difficulty target after immediate energy death.
- [ ] Simulator reports energy deaths correctly and documents model observability.
- [ ] Canonical 300-seed/61-day results pass agreed bands.
- [ ] At least a small human playtest supports felt fairness.
- [ ] CI runs lint, format, typecheck, coverage/tests once, visual asset tests, and asset budgets.
- [ ] Node engine declaration matches the locked toolchain.
- [ ] Story dialogs trap focus and background content is inert while modal.
- [ ] Browser smoke passes at mobile/tablet/desktop.
- [ ] Default/release branch ambiguity is removed and required checks are enabled.
- [ ] README, overview, HTML fallback values, and current audit agree on counts/rules/metrics.
- [ ] Open issues #44/#46/#47 are closed or explicitly re-scoped.
- [ ] A release tag identifies the deployed SHA.

---

## 11. Final assessment

The project does not need an engine migration, framework rewrite, backend, or more content to become healthier. Its strongest qualities already exist: a compact daily loop, deterministic systems, an unusually broad authored cast, a coherent static deployment, and strong catalogue-level regression tests.

The next step is discipline rather than expansion: settle the hard-energy difficulty target, make the simulator tell the truth about it, put the full local gate into CI, validate in real browsers with real people, and remove branch ambiguity. Once those are complete, `secondbarnone` will have a credible foundation for deeper long-run content, portable saves, and a tagged release.
