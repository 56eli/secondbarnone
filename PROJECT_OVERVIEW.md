# secondbarnone — design & architecture

A **browser-playable narrative resource-management game**. You play **Léon**,
who runs a spiritual community by day (sanity) and tends bar by night (money).
Each day you choose one. Neglect either side and the run ends.

This document covers design and internals. For setup, testing and deployment,
see [README.md](README.md).

> **Status:** playable, 107 tests, ~99% coverage on the shipped code.
> Implemented in vanilla ES modules — no engine, no build step.

---

## History: why there is no engine

The game was originally built in **Godot 4.7**. That version still exists on the
[`godot`](https://github.com/56eli/secondbarnone/tree/godot) branch and is
preserved verbatim.

It was rewritten because shipping a Godot web build requires running the Godot
binary to compile a `.pck` archive. That binary is not reachable from an agent
sandbox, so the game could not be built, tested or deployed automatically — and
one attempt to hand-assemble a `.pck` produced a corrupt, unplayable file.

As plain ES modules the source *is* the build:

| | Godot | Current |
|---|---|---|
| Deploy payload | 39.5 MB | **~940 KB** |
| Build step | Godot binary + export templates | none |
| Automated tests | 0 | **107** |
| Coverage | — | **~99%** |

The legacy `scripts/*.gd`, `scenes/*.tscn` and `project.godot` files remain in
the repository for reference. They are not deployed and not maintained.

---

## Architecture

The guiding rule: **`docs/js/core/` and `docs/js/data/` contain no DOM
references.** All game rules are testable headlessly; everything that touches
the document lives in `ui/` and `app.js`.

```
docs/js/
  main.js            entry point — calls initGame() and nothing else
  app.js             wiring: HUD, screen switching, modal, game over
  core/
    game-state.js    stats, calendar, history, season/mood, signals
    event-manager.js event scheduling and weighted selection
    turn.js          resolves one turn in a fixed order
    rng.js           seedable RNG
  data/
    characters.js    78 character profiles
    events.js        29 event definitions
  ui/
    screens.js       hub, location, characters, modal, game-over renderers
```

### Why `app.js` is separate from `main.js`

`app.js` exports `initGame()` rather than running on import. This lets the test
suite boot a fresh game against a fresh DOM repeatedly without re-importing the
module. The earlier approach — importing `main.js` with a cache-busting query
string — gave each boot its own module instance, which fragmented coverage
reporting and leaked state between tests.

`main.js` is now three lines: import, call, expose on `window.__game`.

### Signals

`GameState` implements a small emitter (`on` / `off` / `emit`) that mirrors the
Godot signals the original used:

| Signal | Fired when |
|---|---|
| `stats_changed` | sanity or money changes |
| `day_changed` | the calendar advances |
| `game_over_triggered` | a stat hits zero (fires once) |
| `history_updated` | a history line is added |

`on()` returns an unsubscribe function. `emit()` iterates a copy of the listener
list, so a handler may safely unsubscribe mid-dispatch.

---

## Game rules

### Stats

Both start at **50**, capped at **100**, floored at **0**.

| Action | Sanity | Money |
|---|---|---|
| Spiritual Community | **+15** | **−10** |
| The Bar | **−12** | **+12** |
| Sunday rent | — | **−18** |

Reaching **0** in either stat ends the run, with a message specific to which
stat broke.

### Calendar

Starts **Thursday, 1 January 2026** and advances one day per completed action.
Full Gregorian handling including month lengths, leap years and year rollover —
so a long run correctly passes through 29 February 2028.

Rent is charged on Sundays only, and at most once per Sunday. The guard is keyed
on day-of-month and is cleared by `resetGame()`.

### Events

29 events, each gated to one location.

| Rarity | Weight | Count |
|---|---|---|
| Common | 10 | 20 |
| Rare (Helpful) | 2 | 4 |
| Rare (Hurtful) | 2 | 5 |

Scheduling is **deterministic, not probabilistic**: after each event the next is
scheduled 2–5 journey-days ahead, and when that day arrives an event fires.

Additional gates:

- **Location** — only events matching the chosen location are eligible.
- **Burnout** — requires 3+ consecutive bar days.
- **Friend events** — skipped when no character names are available.
- **No immediate repeats** — the previous event is filtered out when possible.
- `minimumDay` and `allowedWeekdays` are supported per event (unused by the
  shipped pool, but honoured and tested).

### Turn order

`resolveTurn()` in `core/turn.js` applies, in this exact order:

1. the location action
2. Sunday rent
3. the scheduled random event
4. the game-over check
5. one history line

Order matters: rent lands before the event, so an event can pull a player back
from the brink that rent pushed them toward.

---

## Cast

**78 characters.**

| Role | Count |
|---|---|
| Protagonist | 1 — Léon |
| Arch Nemesis | 1 — Kaden |
| Rival | 2 — Sato, Alex |
| Side Character | 74 |

**Kaden** is a developer circling the community's land — never threatening,
just refiling paperwork while the rent notices do the work. **Sato** runs a
polished rival wellness studio; **Alex** runs the craft cocktail bar two streets
over. Each has a full profile in the same shape as everyone else.

The character screen groups by role (antagonists first) and filters on name,
role, location or biography text. A flat list of 78 was unusable.

### Ids and unicode

Display names include Cyrillic, fraktur, Hangul and emoji. Ids are ASCII slugs
derived from them, because ids map directly onto portrait filenames:

| Display name | Id | Portrait |
|---|---|---|
| `𝕽𝖆𝖚𝖑` | `raul` | `raul.svg` |
| `Kopung (고풍)` | `kopung` | `kopung.svg` |
| `Renata 🦥` | `renata` | `renata.svg` |
| `Qusтoge` | `qustoge` | `qustoge.svg` |

The UI always renders the original spelling. Slug uniqueness is enforced by test.

---

## Art

**11 painted portraits** (Léon, six community and bar regulars, plus the three
antagonists) rendered as WebP at 512px.

**67 generated SVG avatars** from `scripts/generate-avatars.js`. Deterministic —
the same id always produces the same face, so regenerating never churns the
diff. Palette, hair, eyes, mouth and accessory are each drawn from an FNV-1a
hash of the id. Under 1 KB each, versus ~2 MB for a painted portrait. Bots
(Carl-bot, DocBot) render as machines; Cat renders as a cat.

Backgrounds are WebP at 1000px wide behind a dark scrim. Missing portraits fall
back to an initials chip, which is exercised by test.

Source art in `assets/` is ~26 MB; the deployed payload is ~940 KB.
`scripts/optimize-assets.sh` regenerates avatars, downscales, converts and
prunes orphans in one pass.

---

## Testing

**107 tests** across three files.

| File | Tests | Scope |
|---|---|---|
| `tests/game.test.js` | 50 | Rules, headless: calendar, stats, rent, events, characters |
| `tests/dom.test.js` | 23 | Real `index.html` in jsdom, driven by clicking real buttons |
| `tests/coverage.test.js` | 34 | Edge cases: unseeded RNG, signal teardown, defensive branches |

Coverage on shipped code:

```
app.js            100.00 line | 94.12 branch | 100.00 funcs
core/*            ~99-100 across the board
data/*            100.00 line | 100.00 branch | 100.00 funcs
ui/screens.js     100.00 line | 91.03 branch |  96.43 funcs
────────────────────────────────────────────────────────────
all files          99.94 line | 96.32 branch |  99.02 funcs
```

`npm run coverage:check` enforces an 80% floor on all three metrics and exits
non-zero below it.

All randomness routes through `core/rng.js`, so tests are deterministic while
normal play stays random. Long seeded playthroughs (25 seeds × 300 turns) assert
that state never goes invalid.

---

## Accessibility

Semantic buttons and headings, visible focus rings, `aria-selected` on the
character list, `role="dialog"` with `aria-modal` on the result modal, labelled
search input, and full keyboard operability.

`prefers-reduced-motion` disables particles and collapses transitions — covered
by a dedicated test that boots the app with the media query forced on.

---

## Known gaps

- **Not verified in a real browser.** The UI is jsdom-verified; Chromium could
  not be downloaded in the environment this was built in. Layout and animation
  deserve a human eye on a real device.
- **No save/resume.** A refresh restarts the run. `localStorage` persistence
  would be the natural next step.
- **No audio.**
- The three antagonists exist as profiles but have **no dedicated events yet** —
  Kaden in particular is a natural fit for rent-pressure events.
