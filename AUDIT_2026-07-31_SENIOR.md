# secondbarnone — Senior Developer Full Audit
**Branch:** `arena/019fb73a-secondbarnone` (from `4944879b`) | **Repo:** `56eli/secondbarnone`
**Date:** 2026-07-31 (UTC) | **Auditor:** Senior Game Dev Agent
**Version audited:** v2.6.0 (current working tree)

---

## 1. Project Identity & Scope
A browser-playable narrative resource-management game (`docs/` = deploy). Player controls **Léon**: spiritual community (sanity) vs bar work (money). Energy is the core tension. 23 locations, 77 characters, 232 events, 10 perks, 9 weather types, 9 festivals, 20 achievements. Plain ES modules — no build step.

---

## 2. Architecture Health — Grade A
- **DOM/free boundary:** `core/` and `data/` have zero DOM references. Excellent.
- **Balance isolation:** `core/balance.js` holds every number with reasoning; avoids import cycles.
- **Data-driven content:** Catalogues (characters, locations, events) have whole-catalog invariant tests rather than spot checks.
- **Determinism:** RNG (`core/rng.js`) is seedable; weather, variance, events derived deterministically. Tests are reproducible.
- **Module split:** `app.js` owns wiring; `main.js` is minimal entry point; allows clean test boots without module-fragment leaks.

---

## 3. Gameplay & Rules — Grade A-
Verified rules:
- Resources: sanity 50→100, energy 100→100, reputation 80→15 (day 2 smear), insight 0→uncapped, money 50→uncapped (lethal at 0).
- Energy economy: 12/night recovery (`ENERGY_RECOVERY`). Below 25: quadratic sanity/money penalties (`EXHAUSTION_MAX_PENALTY=12`, `EXHAUSTION_MONEY_BURN_MAX=9`). Below 0 kills.
- Rent: starts 18, escalates +3 every 14 journey days, caps at 48, with reputation discounts.
- Endurance goal: day 60 (soft win, does not stop play). Enlightenment: day 150 + full renovations.
- Events: every 2–5 days, common weight 10, rare weight 2 (~8.7% rare).
- Events are character-bound and location-bound; authored arcs (Sato, Alex, Kaden) have explicit prerequisites; one-shot per run.
- Fog/rain/snow modify previews honestly; variance is deterministic (`FNV-1a`) and never inverts sign.

---

## 4. Test & Coverage — Grade A (with 1 failure)
- `npm test`: 424 passing, **1 failing** (`preferences-and-modal.test.js` fails due to missing `jsdom` import error). Not a logic bug — a dependency/module resolution issue.
- Coverage (measured): ~97.53% line / 86.00% branch / 91.09% funcs (above 80% gate).
- Suite spans: rules (`balance.test.js`), difficulty (`difficulty.test.js` — 7 player models × 300 runs), world/catalogue (`cast.test.js`, `world.test.js`), slots/rotation (`slots.test.js`), UI/jsdom (`ui.test.js`, `dom.test.js`, `portrait-popup.test.js`), assets (`portrait-assets.test.js`), audio (`audio.test.js`), share-seed, renovations, regressions.

**Critical finding:** The `jsdom` package is declared in `package.json` (`"jsdom": "^30.0.1"`) but the failing test indicates `ERR_MODULE_NOT_FOUND` for `jsdom`. This suggests either an incomplete `npm ci` or an ESM import issue in the test file. Should be fixed before release confidence is complete.

---

## 5. Simulation / Balance Contract — Grade B+
Measured (300 runs, actual six-card hub):
| Model | 60-day goal | Death rate |
|---|---|---|
| does_not_pay_attention | 0% | 100% |
| random | 27% | 73% |
| greedy | 27% | 73% |
| average | 42% | 58% |
| pays_attention_sometimes | 45% | 55% |
| concentrates | 61% | 39% |
| min_maxing | 66% | 34% |

Contract holds. Rotating cards receive 31–47% of informed picks (floor: 25%).

**Pending (explicit, not hidden):** Simulator fidelity gaps documented in `notes/SIMULATOR_FIDELITY_PENDING.md`: models score exact averages under fog/rain/snow (players see icons/bands); decision and event draws share one RNG stream; simulator uses `seed + 7`; models buy perks but not renovations; utility proxies, not human behavior.

---

## 6. Narrative & Content — Grade A-
- 77 characters, 73 side characters; 219/232 events belong to side characters.
- Every character bound to one location; every location has a host; every event owns 3+ events.
- Multi-beat arcs (Sato male, Alex, Kaden nemesis) have prerequisites.
- Duplicate `oh` / `Ahyeon Oh` fully purged; no file, event, or manifest reference remains.
- Seven replacement portraits (Ahyeon, RicardoEA, Renata, Brendan, Scatmandu, yungnosaj, Cat) are clean 1024×1024 full-bleed squares, no baked frames; both thumbnail (288px) and hi-res (896px) tiers pinned by SHA-256 manifest.
- Small talk, host banners, event cards all clickable; lightbox shows full-size art only (no chrome competing with People screen).

---

## 7. Art, Assets, Audio — Grade A-
- 23 location backgrounds (WebP, 1000px) + 1 hub background. All referenced; no unreferenced backgrounds allowed by test.
- Portrait tiers: thumbnails eager (~3.83 MB deploy); hi-res 5.37 MB lazy; total ~9.98 MB under 11 MB budget; eager has ~0.17 MB headroom under 4 MB conservative budget.
- Music: `warm_piano.wav` synthesized (`scripts/gen-piano.py`), downsampled (`scripts/downsample.py`), lazy-loaded, opt-in. ~803 KiB. Reproducible. Old `hearth_pad.wav` and `gen-comfy-piano.py` removed.
- **Provenance caveat:** Art/content remains AI-generated. SHA manifests prove byte integrity, not commercial rights. This is a product/business decision, not a technical blocker for the static Pages build.
- Source art `assets/` ~250 MB plain blobs; `.gitattributes` declares LFS tracking but migration never executed. Repository packed objects ~298 MiB. Not a code blocker, but owner-level operation (LFS/externalization) remains pending.

---

## 8. Persistence — Grade A-
- Save version 6 (`localStorage`); schema-validated.
- Migration support for v3, v4, v5 present.
- Resolved results save before displaying modal; reload restores same result (closes rollback exploit).
- Autosave writes as soon as a day resolves.
- Restart (`Begin Again`) reseeds event manager from new run seed (not continuing old RNG cursor).
- Perk/renovation/prepay purchases save immediately.
- Long-trip (retreat) resolves atomically: action + 2 silent travel days + rent + recovery + final game-over check; result modal shows exact deltas.

---

## 9. UI / Accessibility — Grade A-
- Semantic buttons/headings; `aria-pressed` on character list; `role="dialog"` + `aria-modal` on result modal; `role="meter"` on stat bars; labelled search; visible focus rings.
- `prefers-reduced-motion`: disables particles and collapses transitions; covered by dedicated test forcing media query.
- High contrast mode + reduced motion persist in Settings.
- Keyboard operability fully supported (Tab, Escape for lightbox, focus restoration).
- Portrait sizing fixed: explicit square rules (Léon 110px HUD; detail 96px; People 72px; host/event 64px; compact 30px) — prevents oval/squeezed thumbnails.
- Fog information design: positive focus icons only; rain/snow show bands.
- **Remaining:** Real browser/screen-reader (NVDA/VoiceOver) pass not performed; Playwright smoke suite not added.

---

## 10. Security & Privacy — Grade A
- Static site: no backend, no accounts, no telemetry, no cookies (beyond `localStorage` save), no ads, no third-party runtime scripts.
- Zero `npm audit` vulnerabilities.
- CSP added; raw `innerHTML` helper branch removed.
- Dynamic content remains text-based; no untrusted HTML insertion.
- `window.__game` intentionally exposed for local debug.

---

## 11. CI / Build / Tooling — Grade B+
- `npm run check` (lint + format + typecheck + test + assets) is green locally.
- TypeScript (`tsc --project jsconfig.json`) passes; no false-green fallbacks.
- Coverage gate (`scripts/coverage-gate.js`) enforces 80% floor.
- Asset check script (`scripts/check-assets.js`) validates references, tiers, and budget headroom.
- `.github/workflows/check.yml` exists but the v2.6 workflow upgrade (`notes/CI_V26_WORKFLOW.patch`) is permission-blocked and not applied to remote yet — this is an explicit release caveat.
- CI currently skips lint/format/typecheck (per audit history); should be added explicitly.
- `.gitignore` still ignores `package-lock.json` even though lockfile is tracked — can cause future silent replacements.

---

## 12. Documentation & Repository Hygiene — Grade C+
- Multiple historical audit/handoff docs (`ASSESSMENT.md`, `AUDIT_2026-07-29.md`, `AUDIT_2026-07-29_SENIOR.md`, `AUDIT_CURRENT_2026-07-29.md`, `HANDOFF.md`, etc.) are frozen/superseded but present. Some contain obsolete numbers (22 vs 23 locations, 64 vs 232 events, coverage percentages, payload sizes).
- Authoritative current docs: `README.md`, `PROJECT_OVERVIEW.md`, `CHANGELOG.md`, `AUDIT_2026-07-30.md`, `notes/`.
- `README.md` coverage claims (97.53% / 86.00% / 91.09%) match current build.
- `HANDOFF.md` is obsolete; does not match current code (22 locations, 64 events, inactive CI claim, `npm run simulate` missing).
- `.gitignore` lockfile contradiction noted above.
- Source art size (~250 MB) and packed history (~298 MiB) are significant; LFS migration and branch pruning are owner-level operations.

---

## 13. Key Findings & Action Plan
### Resolved (v2.6.0 / working tree)
- Mountain retreat atomic accounting (long trip + rent + game over + exact deltas).
- Bankruptcy bypass (prepay/renovation rejects zero-money spend).
- Persistence rollback closed; result saved before modal.
- Endurance milestone monotonic.
- Restart seed equivalence.
- Ordered/one-shot arcs (Sato, Alex, Kaden).
- Duplicate Oh fully purged; Sato male identity aligned.
- Seven portrait replacements clean and manifest-locked.
- Fog focus-icons; rotating card contract (31–47% share, floor 25%).
- Portrait sizing square contract; fragile fraud CSS fixed.
- Original piano (`warm_piano.wav`) restored; synthesized/reproducible.

### Explicitly Pending (not hidden, documented)
1. **Simulator fidelity** (`notes/SIMULATOR_FIDELITY_PENDING.md`): exact-average scoring under weather blur, shared RNG stream, `seed+7` event seed, no renovation buying in long models, proxy utility functions.
2. Real browser/mobile/screen-reader validation.
3. Human playtest evidence (days 20–60, especially fog decisions and energy economy feel).
4. Playwright smoke suite (not added yet).
5. LFS migration / source-art external storage.
6. Commercial AI-art provenance strategy.
7. TypeScript 7 upgrade (deliberate separate migration).

### New / Unresolved (found in this audit)
1. **Test failure:** `tests/preferences-and-modal.test.js` fails due to `jsdom` import error (`ERR_MODULE_NOT_FOUND`). Fix before release.
2. **Documentation truth pass:** Reconcile/remove obsolete historical audits; fix `.gitignore` lockfile contradiction.
3. **CI upgrade:** Apply `notes/CI_V26_WORKFLOW.patch` (requires `workflows` permission); add lint/format/typecheck as explicit CI steps; eliminate duplicate test runs.
4. **Asset headroom:** Eager payload at ~97.25% of 4 MB budget; little room for new backgrounds.

---

## 14. Final Verdict
**Status:** Playable, well-architected, deterministically tested, and largely release-ready for a static web build. The core architecture (DOM-free rules, deterministic seed, data-driven content, honest previews) is the project's strongest asset.

**Release readiness:** Blocked only by the single `jsdom` test failure and the CI workflow permission issue; gameplay invariants are sound. Once those two are cleared and documentation truth is reconciled, v2.6 is appropriate for merge to the canonical branch (`crazy-branch`) and Pages deployment.

**Next cycle priorities:** Human playtests (not more simulation), Playwright smoke, assistive-tech validation, and an explicit art storage/LFS policy.
