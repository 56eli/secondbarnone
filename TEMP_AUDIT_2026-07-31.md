# secondbarnone — Full Senior Game Development Audit

**Audit date:** 31 July 2026 (UTC)  
**Audited revision:** `7cd7f0f922b49690aac431efce5df34dc1f2f856`  
**Branch:** `arena/019fb82b-secondbarnone`  
**Release source:** `crazy-branch:/docs`  
**Package:** `2.6.0`

> Temporary review document requested by the owner. It is intentionally separate from the historical audit archive and can be removed after review.

## 1. Executive verdict

**Overall: B+ release-candidate code; safe as a public preview, not yet a fully verified final release.**

The project is a strong, unusually well-tested narrative survival/balance game for a small vanilla web codebase. Its identity is clear: one daily location decision creates a readable conflict between money, sanity, energy, reputation, weather, rent, and authored character events. The deterministic seed/share promise, six-card hub, 23-location city, 77-character cast, and 232-event catalogue are coherent and data-driven.

The latest remediation merge substantially improves the project: it restores the approved difficulty gradient after the hard energy-collapse change, makes the simulator use the same observable previews and production seed model, hardens saves and modal lifecycle, adds browser CI, and reconciles the documentation set.

The release recommendation is:

- **Keep deployed as a preview:** yes.
- **Merge further gameplay/content work immediately:** no; first complete verification and governance cleanup.
- **Call balance final:** not yet; the automated contract is healthy, but human playtesting is missing.
- **Commercial/storefront ready:** no; browser-engine, assistive-technology, mobile, and asset-provenance evidence are still incomplete.

No P0 crash, dependency vulnerability, unsafe network behavior, or known data-loss defect was found in this revision.

## 2. Verified inventory and architecture

| Area | Current state |
| --- | --- |
| Runtime | Static HTML/CSS/ES modules; no production build step or runtime dependencies |
| Gameplay catalogue | 23 locations / 5 districts, 77 characters, 232 events |
| Progression | 10 perks, 4 House of Middleway renovations, 21 achievements |
| Systems | Money, sanity, energy, reputation, insight, rent, weather, festivals, variance, travel, mastery/endurance |
| UI | Six-card hub, location previews, People screen, practice/renovation screens, settings, story/result/portrait modals |
| Persistence | Versioned local save, migrations, autosave, pending-result recovery, validated portable JSON import/export |
| Assets | 23 backgrounds, 77 portrait thumbnails plus 77 hi-res lightbox portraits, lazy WAV music |
| QA | 446 Node/jsdom tests, 20 test files, 9 Playwright cases, TypeScript checking via `jsconfig.json` |
| Deployment | GitHub Pages from `crazy-branch:/docs`; source is the shipped build |

The architecture is proportionate and healthy. `main.js` is a small boot entry point; `app.js` wires lifecycle and UI; `GameState`, `turn`, `event-manager`, `preview`, and the seedable RNG provide useful seams; catalogue data is separated from rules and rendering. The shared preview layer is especially important because it prevents the simulator and player-facing information from drifting apart.

Main structural risks are maintainability rather than correctness:

- `game-state.js` (1,060 lines), `screens.js` (1,321), and `events.js` (2,405) are large change surfaces.
- The application remains DOM-string/rendering heavy, so browser-only behavior and CSS cascade bugs need regression coverage.
- There is no production bundling/minification step; this is acceptable for the current payload, but the asset tier is close enough to budget that future growth needs discipline.
- The source-art masters are ordinary Git blobs (~250 MB working-tree art and ~258 MiB local packed objects), which is operationally expensive even though deployment payload is small.

## 3. Game design and balance audit

### Strengths

- The daily choice is legible and consequential; rest is a real strategic choice rather than a free reset.
- The founding pair establish the economy immediately: the community restores sanity at a cost, the bar pays at a sanity/energy cost.
- Energy has a clear design rule: ordinary recovery is 13 per night; seven nights restore 91 and the eighth tops off; sustained pushing collapses.
- Exhaustion costs both sanity and money on a quadratic curve, making low energy a strategic warning rather than a binary status effect.
- Weather, festivals, deterministic daily variance, weekday gates, reputation locks, and hub slot identity add planning without requiring hidden navigation.
- Events are location-bound and character-bound, with one-shot behavior and explicit arc prerequisites.
- The 60-day endurance acknowledgement and 150-day enlightenment target provide long- and short-horizon goals without forcibly ending the run.

### Automated balance contract

The canonical simulator was run at 300 seeds / 61 days against the real six-card hub:

| Model | Goal rate | Interpretation |
| --- | ---: | --- |
| Inattentive | 0% | Blind founding-pair alternation always fails |
| Random | 29% | Luck is not a plan |
| Greedy | 26% | Naive preview reading fails often |
| Average | 48% | Reference player is near a fair challenge |
| Sometimes attentive | 55% | Attention is rewarded |
| Concentrates | 59% | Engaged play is strong but not safe |
| Min-maxing | 64% | Ceiling remains fallible |

This is a good difficulty gradient and is protected by tests. The simulator now uses exact/banded/veiled information consistent with the UI, independent decision/event RNG streams, production event seeding, renovation funding rules, and energy-death diagnostics.

### Balance risks / required evidence

- The proxy player models are authored utility functions, not human subjects. They validate drift and relative tuning, not fun, fairness, or onboarding.
- There is no evidence yet from fresh players, expert players, or repeated mobile sessions.
- A 48% reference success rate may be excellent for a replayable strategy toy but frustrating if the intended audience reads it as a casual narrative game; this is a product decision requiring playtest data.
- The hard zero-energy ending is coherent but high-severity. Onboarding must make energy costs, exhaustion, and recovery sufficiently understandable before the player loses a run.
- The 150-day enlightenment arc is a very long commitment for a browser session and should be validated for save/revisit behavior, not just simulation survival.

## 4. Narrative, content, and player experience

The strongest product asset is authored specificity. Léon, Kaden, Sato, Alex, the spiritual community, Paris locations, hosts, small talk, event arcs, and the smear campaign create a recognizable tone rather than a generic resource game. The location-host-event join rules are heavily tested and prevent catalogue drift.

The six-card hub is a strong information-design decision: two stable anchors plus four deterministic rotating slots preserve learnable geography while giving the wider city a reason to be discovered. The day-one House of Middleway welcome is a good narrative exception because it is implemented in unlock evaluation, not duplicated in the renderer.

UX positives include:

- readable effect previews with weather/festival/perk explanations;
- fog that withholds exact numbers while still communicating a useful focus cue;
- clickable/tappable portrait previews with full-size lightbox;
- shareable deterministic city seed;
- settings for audio, motion, and portable saves;
- result persistence before Continue, preventing reload rollback;
- focused destination headings and centralized dialog behavior.

UX risks to verify manually:

- Confirm new players understand that a card's average preview can differ from resolution variance.
- Confirm locked-card reasons, rent pressure, exhaustion, and day-two reputation loss are discoverable without reading documentation.
- Test 320px layout with long names, event text, modal buttons, and the People screen under real font rendering.
- Test keyboard-only traversal, focus return after each modal, screen-reader announcements, reduced motion, and zoom/reflow.
- Confirm all error paths for malformed save import are calm, local, and understandable.

## 5. Technical quality, persistence, security, assets, and performance

### Persistence and lifecycle — strong

Save schema v6, migrations, integer/catalogue normalization, autosave, pending-result recovery, portable JSON validation, public `advanceSilentDay()`, rent handling, and fresh-run reseeding address the highest-risk lifecycle paths. The prior long-trip private-state mutation and result rollback concerns are remediated and covered by tests.

Remaining recommendation: add an explicit compatibility test corpus containing representative v3, v4, v5, v6, malformed, oversized, and adversarial imports. This makes future migrations safer than relying only on generated fixtures.

### Security/privacy — strong for the product

The game is static and local-only: no backend, no analytics, no third-party runtime calls, and no account data. A restrictive CSP, safe text rendering, validated save import, and localStorage-only persistence keep the attack surface small. Continue treating imported JSON as hostile data and avoid reintroducing HTML insertion helpers.

### Assets/performance — good, but near the ceiling

Measured asset budget:

- eager/conservative tier: **3.85 MB / 10 MB limit**;
- hi-res portrait lightbox tier: **5.37 MB**, on demand;
- lazy music: **0.78 MB / 1 MB limit**;
- total docs payload: **10.01 MB / 11 MB limit**.

Asset integrity, dimensions, manifest hashes, and payload checks pass. The two-tier portrait strategy is sensible. The main risk is the repository masters, not the shipped payload: ordinary Git storage is expensive and future art additions will make it worse. The project correctly documents LFS/external storage options instead of claiming an incomplete migration.

## 6. Verification performed in this audit

| Command / evidence | Result |
| --- | --- |
| `npm ci` | Pass; 111 packages installed, 0 vulnerabilities |
| `npm run check` | Pass; lint, format, typecheck, 446 tests, assets |
| `npm run coverage:check` | Pass; 97.41% lines, 85.31% branches, 90.57% functions |
| `node scripts/simulate.js --runs=300 --days=61` | Pass; canonical gradient above |
| `node scripts/check-assets.js` | Pass; all references, portraits, budgets |
| `npm run test:e2e` | **Blocked locally**; Chromium/WebKit executables are not installed |
| `npx playwright test --list` | 9 cases enumerate successfully (reported by PR verification) |
| GitHub `check` on `crazy-branch` at audited SHA | Pass; remote quality workflow green |
| Pushed-branch GitHub Actions run (`f8edb22`) | Pass; `quality`, `browser`, and `balance` all green |
| Local Playwright run | Blocked; browser executables are unavailable in this sandbox |
| GitHub Pages deployment at audited SHA | Pass; deployment reports success |
| `gh` repository state | Default branch remains `main`; Pages/release docs identify `crazy-branch` |

The local E2E failures are environmental, not test assertions: Playwright reports missing browser executables. The remote workflow must remain the authoritative engine-backed result.

## 7. Recent changes reviewed

### PR #53 — merged 31 July

This is the audited release-candidate remediation:

- restored recovery from 12 to 13 and the approved hard-collapse difficulty bands;
- aligned simulator previews, RNG streams, event seed, death cause reporting, renovations, and mastery;
- added shared `core/preview.js`;
- centralized modal focus trap, inert background, scroll lock, focus restoration, and Escape policy;
- added portable validated JSON saves and stricter normalization;
- replaced long-trip private mutation with `advanceSilentDay()`;
- added 9 Playwright cases across Chromium desktop, 320px Chromium, and 768px WebKit;
- upgraded CI with lint, formatting, typecheck, coverage, asset gates, balance summary, and browser job;
- aligned Node requirements to 22.22.2+ and made lint warnings fatal;
- reconciled canonical docs and archived superseded audits.

### Earlier recent work

PRs #45 and #48/#49 established the v2.6 lifecycle/content pass, hard energy-collapse rule, renovation/enlightenment arc, cast/art corrections, fog focus, travel and save fixes, and balance tooling. PR #51 restored the warm piano loop, fixed the day-one “fragile fraud” CSS leak, added Kaden to the smear modal, and removed the initial hub heading focus ring. PR #50 landed against historical `main`, demonstrating the branch-governance hazard: fixes there do not necessarily reach Pages.

## 8. Pending actions and ownership

### P0/P1 release blockers

1. **Run the remote browser job and inspect failures, not just job status.** Confirm Chromium desktop/320px and WebKit tablet behavior, especially modals, save import/export, long travel, hard energy collapse, and day-two story.
2. **Complete human UX/accessibility validation.** At minimum: one fresh-player playtest, one experienced-player session, keyboard-only pass, NVDA or VoiceOver pass, 320px phone pass, and reduced-motion/zoom pass.
3. **Resolve release branch governance.** Owner action is required because the integration received HTTP 403 for settings: set `crazy-branch` as default, protect it, require `quality`, `browser`, and `balance`, block force pushes/deletion, and keep `main` historical until intentionally reconciled.
4. **Make a deliberate product decision on open issues #44, #46, #47.** #44 (Kaden smear) and #47 (URL description) appear implemented but remain open; close them with verification links or document why they stay open. #46 requests a 30% music default while current documented owner direction is 25%; do not change it without clarification.

### P2 hardening

- Add migration fixture tests and import size/depth limits.
- Add a lightweight automated accessibility scan and a browser performance budget (first-load, lazy portrait, audio opt-in).
- Add a smoke test for the public Pages URL after deployment and record the deployed SHA.
- Split or further modularize `screens.js` and `game-state.js` only when a feature requires it; avoid a risky refactor without behavior locks.
- Decide whether to retain masters in Git, migrate to LFS, or use a separate art store; document the chosen policy before the next large art pass.
- Add a changelog release entry/tag only after branch and Pages verification.

## 9. Recommended roadmap

### Phase 0 — Release verification (now, 1–2 days)

- Run and triage the remote Playwright matrix.
- Perform human onboarding, mobile, keyboard, screen-reader, reduced-motion, and zoom checks.
- Close or explicitly disposition issues #44/#46/#47.
- Set/protect canonical branch, verify Pages SHA, and tag the accepted build.

**Exit gate:** all three CI jobs green, no P1 UX/accessibility defects, owner accepts the difficulty and music/default decisions.

### Phase 1 — Evidence and resilience (next 1–2 weeks)

- Gather 10–20 human play sessions with structured notes: first-death cause, first successful day 7/30/60, card comprehension, energy comprehension, frustration, and replay intent.
- Add save migration corpus, malformed-import limits, accessibility automation, and public smoke/performance checks.
- Use telemetry only if the owner explicitly wants it; default remains privacy-preserving local-only play.
- Freeze economy constants during testing; tune only against both simulator bands and human outcomes.

**Exit gate:** stable onboarding and no systematic confusion around energy, variance, weather, rent, or locked cards.

### Phase 2 — Content depth without system sprawl (2–4 weeks)

- Expand authored arcs only where they reinforce existing locations and hosts.
- Add more meaningful mid-run relationship consequences and a small number of replay modifiers rather than more raw locations.
- Improve the result/achievement history so the 60-day and 150-day arcs feel like a satisfying record.
- Add a controlled accessibility/content pass for event text, names, labels, and portrait alt text.

**Exit gate:** new content has catalogue tests, no new one-off renderer branches, and does not exceed asset budgets.

### Phase 3 — Long-term product decision (4–8 weeks)

Choose one direction rather than pursuing all of them:

- **Polished web release:** branch/tag/deployment discipline, performance, accessibility, sharing, and content polish.
- **Replayability update:** seeded challenge modes, optional modifiers, or alternate starting conditions with preserved fairness.
- **Engine/platform migration:** only with an explicit need; the current no-build architecture is currently an advantage, not technical debt to remove.

Avoid adding a second engine, backend accounts, analytics, or a large location expansion until Phase 1 confirms that the current loop is understood and replayed.

## 10. Final prioritization

1. Remote browser verification.
2. Human accessibility/mobile/onboarding validation.
3. Canonical branch protection and issue disposition.
4. Save compatibility and malformed-input hardening.
5. Human-informed balance tuning, if needed.
6. Only then: content/replayability roadmap.

The project has crossed from “feature implementation” into “release evidence.” The next best work is not another system; it is proving that the existing system is understandable, accessible, durable, and governed well enough to ship.
