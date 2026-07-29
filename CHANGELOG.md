# Changelog

Entries are newest-first, dated against the working branch.

## 2026-07-30 — Late-Game Renovations, Rebalanced Core Loop, Relationship Markers, Technical Debt & Art Regeneration

### Mechanics and Game Balance
- Rebalanced the economy around the founding loop (`spiritual_community` + `bar`). Meditating at La Maison Calme now restores +18 sanity / -8 money, and working a shift at Le Dernier Verre earns +20 money / -14 sanity, making the core loop sustainable and reliable against escalating rent.
- Tuned secondary location costs so that static preview-reading (`greedy`) players run out of money or sanity when ignoring rent timing and headroom, dropping the `greedy` 60-day endurance goal rate to ~23% (unachievable for >75% of greedy players).
- Calibrated `average` player goal rate to ~45% (within the committed 50% ±7% band) and `concentrates` / `min_maxing` to 100%, creating a meaningful skill gradient.
- Introduced **Community Projects: House of Middleway Renovation** (`docs/js/data/renovations.js`), unlocking when reaching Day 60 OR purchasing all 10 perks. Added 4 progressive sanctuary renovation projects (`roof_repair`, `community_kitchen`, `meditation_garden`, `sanctuary_library`) that allow players to invest late-game Insight and Money in exchange for Reputation and Sanity.

### UX, UI, and Accessibility
- Added `getRelationshipMarker(gs, profile)` in `docs/js/ui/screens.js`, displaying real-time narrative arc progression badges (`First meeting pending` → `Arc deepening · Second beat fired`) on the `People` screen and character detail view for key arcs (`Sato`, `Alex`, `Kaden`, `Brian`) and side characters.
- Updated `.portrait-close` mobile touch target size to 44×44px on <=480px viewports for accessibility compliance.
- Configured `initGame({ fadeMs: 0, toastMs: 50 })` and microtask `settle()` delays across all jsdom UI tests (`ui.test.js`, `dom.test.js`, `portrait-popup.test.js`, `slots.test.js`), reducing total UI test execution time from ~96 seconds down to <10 seconds.

### Architecture and Technical Debt
- Extracted `PreferencesService` (`docs/js/ui/preferences-service.js`) to manage high contrast, reduced motion, sound/volume settings, audio lifecycle, and localStorage persistence.
- Extracted `ModalController` (`docs/js/ui/modal-controller.js`) to manage modal appending, focus traps, backdrop handling, and cleanup.
- Removed obsolete legacy compatibility shims (`applyLocationAction`, `applyEventDeltas`, `LOCATION_COPY`, `SANITY_GAIN/MONEY_GAIN/SANITY_LOSS/MONEY_LOSS`, and `_lastRentJourneyDay` serialized property) to shrink production code.
- Added unit test suites for `PreferencesService`, `ModalController`, `RENOVATIONS`, and relationship markers.

### Art and Asset Pipeline
- Configured Git LFS tracking for `assets/**` in `.gitattributes` to keep clone sizes lean while versioning source art masters.
- Removed obsolete legacy procedural avatar scripts (`generate-avatars.js`, `process-portrait.sh`).
- Regenerated clean, square, frame-less painterly portraits for 9 characters: Brock Lee, Kaschem, Carl-bot (turtle robot), Sir Cruds, Baris, Aril Stellar, Alvigunilla, Mrone, and Stephen, keeping gender and character identities consistent. Rebuilt deployed thumbnail (288px) and high-resolution (896px) WebP tiers and deleted obsolete circular-framed masters.

## 2026-07-29 — atomic travel, verified music, portrait-standard continuation

### Mechanics and quality gates
- Made Mountain Retreat resolution atomic. Sunday rent during its two silent travel days now correctly triggers game over at zero money, and displayed turn deltas include all travel recovery and rent.
- Added a regression test for a Friday retreat that reaches a fatal Sunday.
- Turned typechecking into a real gate: TypeScript and `jsconfig.json` are committed, `npm run typecheck` fails on errors, and CI runs lint, formatting and typechecking before the coverage suite.
- Added the documented `npm run simulate` command and Node 20+ engine declaration.
- Removed the stale `package-lock.json` ignore rule.

### Music
- Rebuilt the background loop as standard 16-bit PCM, mono, 22.05 kHz WAV. The previous deployment header advertised an invalid 34-bit PCM layout that browsers could not reliably decode.
- Added an asset-level test that validates the deployed WAV header and the 1 MiB lazy-audio cap.

### Art
- Restored Vanna from the owner-supplied canonical rabbit portrait, replaced the obsolete human-at-a-bar master and regenerated both WebP tiers. Exact hashes now lock the canonical master and derived files.
- Removed Vanna from the framed-art exception list: her canonical image is already a clean square source. Brian remains the sole framed exception.
- Replaced nine further circular-framed portrait masters with clean, square painterly art: Ahyeon, Air-Vaisselle, Alvigunilla, Andre Watson, Aril Stellar, Baris, blokely, Brendan and Carl-bot. Updated the reviewed-art backlog.

---

## 2026-07-29 — P0 fixes + audio + save/abandon

### Mechanics
- **Rent prepayment exploit fixed.** Prepaying rent on a Sunday when rent was due
  used to silently erase that Sunday's charge (one payment covered two Sundays).
  Prepayments now explicitly buy *future* Sundays; the notice sitting on the
  fridge this morning is still owed. Rent prepayments are tracked as an
  explicit set of Sundays (`rentPrepaidDays`) rather than a single numeric
  cutoff, which also fixes a number of off-by-one edge cases around escalation
  and festival waivers. Save format bumped to v5 with v3/v4 forward migration.
- **Mountain retreat is now actually three days.** The long-trip special
  (`special: 'long_trip'`) used to be flavor text — one calendar day advanced
  no matter what. It now resolves two additional silent nights inside the turn
  resolution, recovers energy each night, charges rent for any Sundays that
  land in the window, and surfaces a note in the result modal. The day count
  on the hub advances accordingly; Continue returns you to the calendar day
  you actually came back on.
- **Day-100 mastery win is a real, one-shot ending.** Previously
  `checkSecondWin()` fired every turn after day 100, overwrote `winMessage`,
  and was never surfaced in the UI. It now sets a `masteryWon` flag the first
  time conditions are met, has its own message, is announced by toast, and
  renders a distinct title and note on the game-over/summary screen.
- **Event scheduler and RNG state are persisted.** Reloading a run used to
  reset the event timer and recent-event memory, which broke the
  determinism/repeat-protection promises and could change the event that had
  been scheduled before reload. `EventManager.toJSON()` / `loadFrom()` now
  serialize next-event day, recent ids, previous event, consecutive-bar-day
  count, and the seeded RNG's state (added `getState()`/`setState()`/`isSeeded`
  to `createRng`). Saves embed the event blob at the top level of the v5 save.
- **Duplicate turn resolution is guarded at the model layer** (already shipped
  but re-verified; `_turnResolvedOnDay` persists across reloads).

### UX / A11y
- **Settings gear is back.** Restyled as a 44 × 44 touch target (meets WCAG
  2.5.5 AAA), with a gentle hover rotation so it visibly reads as a control.
- **Abandon Run** button in Settings, behind a `window.confirm` dialog, for
  when a player wants to restart without having to die or clear localStorage.
- **Background music toggle + volume slider.** A warm, copyright-free piano
  loop (generated with stdlib-only additive synthesis; see
  `scripts/gen-piano.py`) is shipped as `assets/music/warm_piano.wav`, ~780 KB,
  lazy-loaded *only* after the player explicitly turns sound on (no autoplay,
  no preload, respects autoplay policies). State and volume are persisted in
  settings.
- **Result modal no longer advances time on a stray backdrop click.** The
  Continue button is the only way forward. Modal also gains a proper focus
  trap (Tab loops between first/last focusable child) consistent with the
  portrait lightbox. Escape is intentionally *not* bound to Continue because
  that would also advance time on an errant keypress.
- All small `.btn-small` and settings toggle controls bumped to a 44 px touch
  target on mobile widths.
- Save/autosave is still automatic after every day and is mentioned explicitly
  on the Settings screen.

### Save system
- Save key bumped to `secondbarnone.save.v5`. Older v3/v4 saves continue to
  load; v5 saves embed event-scheduler state and a `masteryWon`/`masteryMessage`
  pair. Legacy keys are cleared on abandon / game over / successful load.
- Added `saveStore.loadExtra()` helper for reading the event blob back after
  load.

### Assets / build
- Warm piano loop:
  - source generator: `scripts/gen-piano.py` (stdlib only)
  - deployment audio: `docs/assets/music/warm_piano.wav` — mono, 22 kHz, ~780 KB
  - source master: `assets/music/warm_piano.wav`
  - Music is tracked in a **lazy audio** bucket by `scripts/check-assets.js`,
    separate from the eager/lightbox budgets (1 MB cap). Total payload
    ceiling raised to 11 MB to absorb the new file while keeping the eager
    4 MB budget intact (actual eager payload 3.89 MB).
- Asset check now prints lazy-music size separately.
- CI checks run cleanly: `npm ci`, `npm test` (374 pass / 0 fail), lint,
  format, `check-assets`, and coverage gate all green.

### Tests
- New tests added:
  - v3 → v5 and v4 → v5 save migration
  - day-100 mastery win is idempotent and has its own flag
  - Sunday prepayment does not skip today's rent and correctly covers future
    Sundays (1-week and 2-week cases, weekday vs. Sunday cases)
  - Result modal backdrop clicks do not advance the calendar
  - Save/resume round-trips correctly after multiple days
- Existing `playDay` UI helper updated to click the location-screen primary
  button (not the modal button) first, matching the new flow.
