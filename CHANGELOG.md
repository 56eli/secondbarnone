# Changelog

Entries are newest-first, dated against the working branch. Every balance
claim in an entry must match `npm run simulate` output for that entry's
revision — an entry that describes numbers the code doesn't have is a bug,
and gets corrected in place rather than remembered fondly.

## 2026-07-30 (v2.6.0) — Lifecycle, cast/art, fog focus and release hardening

A release-sized owner-directed pass: correctness findings from the current
audit are closed, the duplicate Oh character is removed, seven forbidden-frame
portraits are repainted and SHA-pinned, rotating cards earn a real share of
informed play, and the warm music returns to piano. Version **2.6.0**.

### Gameplay correctness and persistence

- **Three-day retreat fixed end to end.** The action day plus two silent travel
  days resolve atomically; Continue now enters the next playable morning
  (`N+3`) exactly as the simulator does. No second action or rent-free exploit
  is possible on the return date.
- **Bankruptcy bypass closed.** Rent prepayment and renovations refuse a
  transaction that would spend the wallet to zero. Invalid/negative prepayment
  week counts are rejected.
- Repeated prepayments now buy the next *uncovered* Sunday instead of charging
  repeatedly for one `Set` entry.
- Endurance is monotonic: dying after day 60 ends the run but no longer erases
  the earned 60-day milestone or closing note.
- Resolved results save **before Continue**. Reloading the result screen restores
  the same modal and totals rather than rolling the whole choice back.
- Perk, renovation and rent-prepayment purchases save immediately.
- Begin Again reseeds the event manager from the new run seed, reproducing a
  fresh shared city rather than continuing the old RNG cursor.

### Events, cast and identity

- Authored events are one-shot per run. Sato, Alex and Kaden beats declare
  explicit prerequisites, so conclusions cannot precede introductions.
- **Sato is male** throughout profile and event copy, aligned with the
  authoritative template and portrait.
- **Oh is fully purged.** The accidental duplicate profile, three events,
  master, thumbnail, hi-res tier and manifest entry are gone. The canonical
  florist is **Ahyeon Oh** (`ahyeon`).
- To retain the 3-resident/9-event floor at every affected place: Ahyeon Oh and
  her flower events move to Community Garden; Brock Lee and his produce events
  move to Saturday Market; Hazel and her herb events move to Canal Walk.
- Live catalogue: **77 characters, 232 events; 219 (94.4%) side-character
  events**.

### Information design, UI and accessibility

- Fog no longer says “fog — no telling.” It shows only each location's strongest
  positive focus icon(s), derived from base effects—e.g. money for the bar and
  sanity for La Maison Calme—with no numbers or +/- signs. Similar leading
  gains can show together. Rain/snow bands are unchanged.
- Side-character previews are larger while remaining below Léon's 110px HUD
  portrait: 72px People rows, 96px detail, 64px host/event portraits. The old
  `width:56px` plus `flex-basis:42px` contradiction was the oval/tiny root
  cause; equal width/height/flex bases now guarantee circles.
- People uses ordinary native buttons with `aria-pressed`, not a falsely claimed
  listbox. Screen navigation focuses the destination heading.
- Portrait lightbox traps Tab as well as handling Escape; footer contrast is
  raised; the in-game Reduced Motion toggle stops particle timers and hides the
  layer.
- Persisted settings are schema-normalized and volume-clamped before audio is
  touched. Share City has an explicit Copy Link action with feedback.
- Removed the unused `innerHTML` escape hatch and added a restrictive static
  Content Security Policy.

### Rotating-card balance

- Free Clinic, Soup Kitchen, Library, Open Mic and Letting Office receive modest
  multi-resource improvements; they remain costly days rather than free wins.
- New test contract: informed models must choose one of the four rotating cards
  at least **25%** of the time. Measured range is **31–47%**.
- 300-seed / 61-day hub goals: inattentive **0%**, random **27%**, greedy
  **27%**, average **42%**, sometimes attentive **45%**, concentrates **61%**,
  min-maxing **66%**.
- **Simulator fidelity is still pending**, explicitly—not silently declared
  solved. Models still see exact averages under weather-hidden previews and
  share decision/event RNG. See `notes/SIMULATOR_FIDELITY_PENDING.md`.

### Owner-directed art and audio

- Repainted clean, square, full-bleed masters for **Ahyeon Oh, RicardoEA,
  Renata, Brendan, Scatmandu (male), yungnosaj and Cat (male actual cat)**.
  No baked circle/oval/frame/mat/text/UI; both 288px and 896px tiers rebuilt.
- Rebuilt `assets/portraits/manifest.json`: exact SHA-256 coverage for all 77
  live masters and both deployed tiers, no retired `oh` entry.
- Replaced the pad with a new project-original **warm, slow felt-piano loop**:
  `comfy_piano.wav`, 52 BPM, 18.46 s, mono 16-bit/22.05 kHz PCM, 795 KiB,
  synthesized reproducibly by stdlib-only `scripts/gen-comfy-piano.py`.
- Removed obsolete `hearth_pad.wav`, `gen-warmth.py`, all redundant source
  background WebPs and the superseded old CI patch. A new v2.6 workflow patch
  records the still-permission-blocked CI upgrade.

### Tooling, release and verification

- GitHub Pages/release documentation now targets canonical `crazy-branch:/docs`.
- The CI upgrade is reviewed and saved as `notes/CI_V26_WORKFLOW.patch`, but
  GitHub rejected the workflow edit because this App lacks `workflows`
  permission. Until an authorized checkout applies it, remote CI retains its
  previous tests/assets/coverage shape. All proposed legs passed locally.
- Local server serves WAV as `audio/wav`. Package/lock versions agree at 2.6.0;
  jsdom is updated to 30.0.1; dependency audit is clean.
- **425 tests pass, 0 fail, 0 skip. Coverage: 98.12% lines / 86.10% branches /
  92.56% functions. Assets: 3.83 MB non-hi/music tier + 5.37 MB on-demand
  portrait tier + 0.78 MB lazy music = 9.98 MB total.**

---

## 2026-07-30 (night) — Owner-directed portrait corrections + content-manifest lockdown

Ten portraits with owner-recorded defects regenerated in the house style, and
the mechanism that let old art silently come back is now test-locked.
Version bumped to **2.5.0**.

### Corrections (all male per `CHARACTER_AND_LOCATION_TEMPLATES.md`)

- `baris` — white deckle-edge composition → clean frame-less grocer, shelves
  of jars and bread, full bleed.
- `mrone` — incompatible realistic style → painted minimalist in his sparse
  loft, house brushwork.
- `seth` ("The Hand") — baked white oval frame + off-theme Americana props →
  weathered driver at the lantern-lit night market, no badge text.
- `siekamcebule` — baked frame → squinting community-kitchen cook chopping
  herbs in steam.
- `isra` — baked frame **and wrong sex** (template: Male) → the male
  architecture student with sketchbook and floorplan.
- `andre_watson` — baked frame → jazz trumpeter at rest in the back-room bar.
- `air_vaisselle` — baked frame → transcendent dishwasher, headphones and
  steam.
- `blokely` — baked frame → sculptor before his salvaged garden wall.
- `jits` — baked frame → calm instructor in gi at the mountain retreat.
- `gordon` — baked frame → silver-haired retired firefighter stacking
  chairs in the chapel hall.

All ten masters are clean square 1024px PNGs, visually QA'd (full-bleed, no
frame/ring/white edge/text/watermark), with both tiers rebuilt.

### Why old art kept coming back — and why it now can't

The two-commit squashed history shipped the upload-day portrait binaries
while the *text record* of the 30 July frame-less pass arrived through a doc
merge. Docs said replaced; players saw upload-day art. The fix is structural:
`assets/portraits/manifest.json` now pins the SHA-256 of every master and
both deployed tiers for **all 78 characters**, asserted byte-for-byte by
`tests/portrait-assets.test.js`. Approved changes re-pin the manifest in the
same commit (`scripts/build-portrait-manifest.js`, added to the ART_STANDARD
checklist); anything else that changes a single pixel fails the suite.

## 2026-07-30 (evening) — Winter theming, weekday rhythm, seamless navigation

The polish pass on top of Hard Winter. Everything is measured/verified; the
difficulty contract (`tests/difficulty.test.js`, 61-day hub harness and
`tests/balance.test.js`, 200-day unlocked harness) passes with the numbers
quoted in the README. Version bumped to **2.4.0**.

### Winter, in and around winter

- **Fringe-month weather.** Snow and hard frost carry `fringeMonths`
  (November / early March at half weight) in `data/weather.js`; the pool
  widens but the per-day roll is never reshuffled, so mid-season weather is
  bit-identical to before. `weatherForDay` takes an optional month index;
  `GameState.peekDay()` reads a future date without mutating the calendar;
  the almanac forecast now carries each day's real month, so shoulder-season
  snow shows up in the four-day outlook instead of being flattened into
  season-only weather.

### The weekly rhythm

- **The Saturday Market finally runs on Saturdays** (user-reported open
  issue), the Puces de Saint-Ouen keeps its promised Sunday tarpaulins, and
  the open mic stays Friday–Saturday as its description always claimed —
  all through the existing `unlock.weekdays` gate.
- Locked-card reasons now name the day: "Only on Saturdays", "Only on
  Fridays and Saturdays" (`weekdayGateReason`, with `WEEKDAY_NAMES` moved to
  `core/balance.js` so the data layer can phrase reasons without an import
  cycle).
- **Slot fallthrough for weekday gates only.** A recurring weekly closure is
  not progression, so a weekday-gated place holds its hub card on its day
  and the day before, then steps aside for the next location in the cycle.
  Long-term locks (day/reputation/perk) still hold their cards as before —
  that visibility is the discovery system. This is what keeps the midweek
  board alive without touching the winter economy, and the 61-day contract
  was re-verified against it.

### Weather-bound previews

- **Fog veils, rain and snow blur.** `previewMode(weather)` in
  `ui/screens.js`: fog hides the chips *and* the "Adjusted by" reasons (a
  single flavour line instead); rain and snow collapse every chip into
  `+`/`++`/`-`/`--` bands (`BAND_STRONG = 6`); everything else shows the exact
  honest average as before. Applied on all six hub cards and the location
  page. The resolution itself is unchanged — this is an information rule,
  not a balance rule.
- The copy-pasted weather-emoji detection in the hub was replaced by a
  single `weatherEmojiIfAdjusted` helper while touching those call sites.

### No more black flicker

- The 350 ms `#fade` blackout on every hub↔location navigation is gone —
  element, CSS and JS. `transitionTo` now pre-loads the destination's
  background (a full `Image` decode, bounded by a 250 ms budget) and
  `showScreen` dissolves: the outgoing screen fades out *on top of* the
  fully-present incoming one, like the popups always did. `data-bg` on the
  hub/location screens feeds the preloader. `screenIn` was retired; the
  character-panel rise animation kept, renamed `riseIn`.

### Music

- The piano loop is replaced by something calmer, warmer, equally slow:
  `hearth_pad.wav` — 5 bars at 56 BPM of detuned-sine pads, a soft sub
  root, one faint bell per bar, low-pass warmth, seamless circular-reverb
  loop (~21 s, 0.90 MB, inside the 1 MB lazy-audio budget). New generator
  `scripts/gen-warmth.py`; `scripts/gen-piano.py` and both `warm_piano.wav`
  copies deleted. Settings copy updated.

### Cleanup verified, not assumed

- Removed: the `#fade` overlay and its CSS, `screenIn`, `gen-piano.py`,
  `warm_piano.wav` (master + deploy), the vague "Not on today of all days"
  lock reason, two stale "Removed obsolete inventory test" marker tails in
  `tests/ui.test.js`, and the duplicate block they hid (a real maintenance
  hazard: one of the two copies was being edited while the other ran).
- Balance after gating, measured (README updates match): 61-day hub goal
  rates — random 20% / dpa 0% / sometimes 38% / average 36% / greedy 21% /
  concentrates 52% / min-maxing 61%. The average-model attention knob was
  recalibrated 0.27 → 0.32 (documented in `scripts/simulate.js`, as is its
  habit when the economy shifts); the 200-day unlocked-pool contract holds
  (greedy 100% death / 0% goal; concentrates and min-maxing ~88% goal).

## 2026-07-30 (later) — Hard Winter: one canonical tuning, honesty pass

This pass landed the rebalance the entry below *described but never shipped*,
and fixed every finding of the 2026-07-30 audit (`AUDIT_2026-07-30.md`).
Version bumped to **2.3.0**.

### Mechanics — the tuning (measured, not described)

The one tuning, for everyone, no easy mode:

- **Founding loop**: La Maison Calme **+18 sanity / −8 money / −14 energy**;
  Le Dernier Verre **+20 money / −14 sanity / −26 energy** (was
  +15/−10/−12 and +12/−12/−20).
- **Energy recovery is 12/night** (was 14): eight nights restore 96, a ninth
  tops off. Seven consecutive bar shifts empty a full tank — the fantasy the
  README always sold is now literally true.
- **Exhaustion costs money as well as sanity.** Below the threshold, a
  quadratic sanity curve to −12/day (was −10) and a new money burn to
  −9/day — running on empty is expensive: takeaway, cabs, no tips. Priced by
  `EXHAUSTION_MONEY_BURN_MAX` in `balance.js` and surfaced in the end-of-day
  modal.
- **Rent escalates faster**: +3 every **14** journey days (was 24), capping
  at **48** (was 42).
- **Rest relief trimmed**: Home Loft +28 energy (was +30), Bathhouse +18
  (was +22). Reactive deep-tank rest costs more days than proactive rest.
- **Second Wind now does what it says.** `exhaustionResist` used to *raise*
  the exhaustion threshold (exhaustion earlier and harsher at every energy
  level) while the description promised "exhaustion arrives later". The
  threshold now shifts down (25→17) and both exhaustion curves soften;
  `restBonus` trimmed 10→8 and cost raised 6→8 insight as the perk is now a
  genuine buff all around.
- **Preview shows the honest average, never the dice.** The deterministic
  daily swing is excluded from all previews (hub cards, location page, and
  the balance simulator's player models) and applies only at resolution.
  Exact-answer play is gone; planning around what a place *is for* remains.
- **Event RNG is seeded per run** from the run seed and persisted with the
  save: closing the tab before Continue and reloading replays the same
  scheduled day instead of re-rolling the event.
- First-event scheduling after *Abandon run* now matches a fresh boot
  (day 3–6), not day 2–5.

### Difficulty contract (`tests/difficulty.test.js`, 300 runs × 61 days)

| model | 60-day goal |
| --- | ---: |
| doesnt_pay_attention | **0%** |
| random | **29%** |
| greedy | **27%** |
| average | **43%** |
| pays_attention_sometimes | **48%** |
| concentrates | **61%** |
| min_maxing | **66%** |

200-day horizon: greedy 100% death / random 95% / founding-only alternation
100% (~day 19) / concentrates 3% / min_maxing 13% — attention wins, nobody is
immortal. The calibration legend lives in `tests/difficulty.test.js`.

### Features

- **Share-a-city seed links.** `?seed=N` boots a deterministic run (same
  weather, event timing and day swings); Settings shows the current run's
  link, click-to-copy. An existing autosave always wins over the URL seed.
- `forecast()` accepts per-day seasons: the almanac's 4-day outlook now uses
  each day's own season across month boundaries (`GameState.peekSeason()`).

### Bug fixes

- Portrait lightbox no longer leaks a `keydown` listener per open (module
  state from a prior popup is closed properly).
- Removed a dead always-true branch in `restart()` and the never-read
  `pendingAchievements` state.
- Daily focus cue and the energy bar now agree (cue uses `isExhausted`,
  almanac outlook uses the effective threshold instead of hardcoded 25/75).
- `locations.js` header count corrected (twenty-three locations).

### Tooling and CI

- CI legs for **lint + format:check + typecheck** were prepared (the same
  legs as `npm run check` locally) but could not be pushed from this
  workspace — that file needs a token with the `workflows` permission. The
  reviewed diff ships as `notes/CI_QUALITY_LEGS.patch`: `git apply` it from
  any checkout with the right permissions. *(Amended 2026-07-30 evening:
  this entry originally said "CI now runs…" — it does not yet.)*
- `check-assets.js` warns below 10% eager-budget headroom (currently 97%
  used) so the budget conversation happens before CI fails, not at it.
- New tests: reload-replays-the-same-event, restart cadence, lightbox
  listener hygiene, nudge/bar consistency, almanac season boundary, seed
  URLs (boots the real `main.js`), share link presence, exhaustion money
  burn, preview-vs-resolution split. **395 tests** pass; coverage
  98.20/85.47/92.22.
- README rare-rate claim corrected to the measured ~1-in-12 (was "one in
  six"). Stale counts corrected everywhere (locations header, PROJECT_OVERVIEW).

---

## 2026-07-30 — Late-Game Renovations, Relationship Markers, Technical Debt & Art Regeneration

> ⚠ **Corrected 2026-07-30 (later).** This entry originally claimed a core-loop
> rebalance and simulation outcomes (+18/−8, +20/−14, `greedy` goal ~23%)
> **that had not landed in the build** — the code still shipped the old
> +15/−10, +12/−12 numbers and `greedy` succeeded 99–100% of the time. The
> entry below now describes what that revision actually contained. The
> intended rebalance shipped later the same day (see entry above). Keeping
> this correction visible is the point: documentation is part of the release
> contract, per `notes/BALANCE_REGRESSION_POSTMORTEM.md`.

### Mechanics and Game Balance
- Introduced **Community Projects: House of Middleway Renovation** (`docs/js/data/renovations.js`), unlocking when reaching Day 60 OR purchasing all 10 perks. Added 4 progressive sanctuary renovation projects (`roof_repair`, `community_kitchen`, `meditation_garden`, `sanctuary_library`) that allow players to invest late-game Insight and Money in exchange for Reputation and Sanity.
- *(The core-loop tuning originally described here did not ship in this revision; see the entry above for the version that did, and `tests/difficulty.test.js` for the contract it answers to.)*

### UX, UI, and Accessibility
- Added `getRelationshipMarker(gs, profile)` in `docs/js/ui/screens.js`, displaying real-time narrative arc progression badges (`First meeting pending` → `Arc deepening · Second beat fired`) on the `People` screen and character detail view for key arcs (`Sato`, `Alex`, `Kaden`, `Brian`) and side characters.
- Updated `.portrait-close` mobile touch target size to 44×44px on <=480px viewports for accessibility compliance.
- Configured `initGame({ fadeMs: 0, toastMs: 50 })` and microtask `settle()` delays across all jsdom UI tests to cut the UI suites' runtime.

### Architecture and Technical Debt
- Extracted `PreferencesService` (`docs/js/ui/preferences-service.js`) to manage high contrast, reduced motion, sound/volume settings, audio lifecycle, and localStorage persistence.
- Extracted `ModalController` (`docs/js/ui/modal-controller.js`) to manage modal appending, focus traps, backdrop handling, and cleanup.
- Removed obsolete legacy compatibility shims (`applyLocationAction`, `applyEventDeltas`, `LOCATION_COPY`, `SANITY_GAIN/MONEY_GAIN/SANITY_LOSS/MONEY_LOSS`, and `_lastRentJourneyDay` serialized property) to shrink production code.
- Added unit test suites for `PreferencesService`, `ModalController`, `RENOVATIONS`, and relationship markers.

### Art and Asset Pipeline
- Configured Git LFS tracking for `assets/**` in `.gitattributes`. *(The attribute is present; the actual LFS migration of the masters has NOT happened — the repo still carries ~277 MB of plain blobs across two squashed snapshots. See README → "Repository size and history".)*
- Removed obsolete legacy procedural avatar scripts (`generate-avatars.js`, `process-portrait.sh`).
- Regenerated clean, square, frame-less painterly portraits for 9 characters: Brock Lee, Kaschem, Carl-bot (turtle robot), Sir Cruds, Baris, Aril Stellar, Alvigunilla, Mrone, and Stephen, keeping gender and character identities consistent. Rebuilt deployed thumbnail (288px) and high-resolution (896px) WebP tiers and deleted obsolete circular-framed masters.

## 2026-07-29 — atomic travel, verified music, portrait-standard continuation

### Mechanics and quality gates
- Made Mountain Retreat resolution atomic. Sunday rent during its two silent travel days now correctly triggers game over at zero money, and displayed turn deltas include all travel recovery and rent.
- Added a regression test for a Friday retreat that reaches a fatal Sunday.
- Turned typechecking into a real gate: TypeScript and `jsconfig.json` are committed and `npm run typecheck` fails on errors. *(This entry originally also claimed CI ran lint/format/typecheck — it did
 not; the legs were still pending at that revision and were applied in v2.6.0.)*
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
- Local checks run cleanly: `npm ci`, `npm test` (374 pass / 0 fail), lint,
  format, `check-assets`, and coverage gate all green. *(CI ran only
  tests + assets + coverage at this revision; the full `npm run check` leg
  set arrived 2026-07-30.)*

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
