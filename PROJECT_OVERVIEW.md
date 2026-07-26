# secondbarnone — design & architecture

A **browser-playable narrative resource-management game**. You play **Léon**,
who runs a spiritual community by day (sanity) and tends bar by night (money).
Each day you choose one. Neglect either side and the run ends.

This document covers design and internals. For setup, testing and deployment,
see [README.md](README.md).

> **Status:** playable, 312 tests, ~99% coverage on the shipped code.
> Implemented in vanilla ES modules — no engine, no build step.
>
> Money is an uncapped wallet (still lethal at 0). Every location has a host
> with small talk; 51 of 64 events belong to side characters. Léon stays prominent
> in the HUD. Weather stays calm and useful. Soft win at day 100.

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
| Deploy payload | 39.5 MB | **~2.8 MB** |
| Build step | Godot binary + export templates | none |
| Automated tests | 0 | **312** |
| Coverage | — | **~99%** |

Legacy Godot sources have been removed from this branch. The shipped game is
the HTML/CSS/JS build under `docs/` only.

---

## Architecture

The guiding rule: **`docs/js/core/` and `docs/js/data/` contain no DOM
references.** All game rules are testable headlessly; everything that touches
the document lives in `ui/` and `app.js`.

```
docs/js/
  main.js            entry point — calls initGame() and nothing else
  app.js             wiring: HUD, screens, modal, toasts, autosave, game over
  core/
    game-state.js    stats, calendar, practices, save/load
    event-manager.js event scheduling and weighted selection
    turn.js          resolves one day in a fixed order
    rng.js           seedable RNG
  data/
    characters.js    78 character profiles
    locations.js     22 locations across 5 districts
    events.js        64 event definitions
    weather.js        9 weather types, derived per day
    items.js         12 carryable items
    perks.js         10 perks in a prerequisite tree
    festivals.js      9 fixed calendar events
    achievements.js  22 predicates over a state snapshot
  ui/
    screens.js       hub, map, location, practice, almanac,
                     characters, modal, game over
```

Every module under `data/` is pure data plus pure helpers, which is why the
test suite can assert over the whole catalogue rather than sampling it.

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

### Resources

| | Start | Max | What it is |
|---|---|---|---|
| **Sanity** | 50 | 100 | Reaching 0 ends the run |
| **Money** | 50 | uncapped | Wallet. Reaching 0 ends the run; HUD bar is comfort vs 100 |
| **Energy** | 100 | 100 | Recovers overnight; running low costs sanity |
| **Reputation** | 10 | 100 | Gates locations |
| **Insight** | 0 | — | A currency, not a gauge. Spent on perks |

The two founding locations keep their original numbers exactly — Spiritual
Community is still +15/−10 and the Bar is still +12/−12 — so the opening of a
run plays as it always did. Everything else is layered on top.

**Exhaustion.** Below 25 energy every action costs extra sanity, scaling to −6
at empty. `Second Wind` widens the threshold and softens the fall.

### Locations

**22 locations across 5 districts.** Each carries tags (`quiet`, `night`,
`market`, `pilgrimage`, …) which are the join key for the whole game: weather
modifies by tag, perks bonus by tag, and events gate by tag.

Locations unlock on journey day, reputation, weekday, or a required perk/item.
A fresh run can reach three places; a long, well-regarded one can reach all 22.

Every location costs something — money, energy or sanity. That invariant is
enforced by test, because a free location would collapse the decision.

### Weather

**9 types, derived not rolled.** `weatherForDay(day, seed, season)` is a pure
function of an FNV-1a hash, so the forecast can be read four days ahead in the
almanac without rolling anything, and a save restores the exact same sky.

Weather modifies effects by tag and can close tags outright — a storm shuts
every outdoor location unless you are carrying the rain shell. Snow is
winter-only, heatwaves are summer-only, blossom wind is spring-only.

### Rent

Charged on Sundays, once each. Reduced by the `Tenants' Union Card` perk,
skippable by paying ahead at the letting office, and waived entirely on
Rent Amnesty Day.

### Practice and milestones

- **10 perks** in a prerequisite tree, bought with insight. Test-enforced to be
  acyclic and declared in a buyable order.
- **9 festivals** on fixed calendar dates, and **21 achievements** expressed as
  pure predicates over a state snapshot.

The former task-contract system and long-form journal were deliberately retired
so the run remains about one readable daily choice. The hub retains five concise
history lines, and its focus cue can quietly flag resource pressure or rent.

### Events

**64 events.** **51 (79.7%)** belong to side characters, exceeding the
50% catalogue floor enforced by test. Events are gated by location id, by
location tag, by weather, or by a minimum day — so no event can fire anywhere
at any time.
Kaden finally has his own arc: four events that escalate the rent pressure
from refiled paperwork to a buyout offer on very good paper.

Scheduling is unchanged and still deterministic: 2–5 journey-days apart, with
the last four events filtered out of the pool to avoid repetition.

### Turn order

`resolveTurn()` in `core/turn.js` applies, in this exact order:

1. the day's effects — location, weather, festival, perks, items
2. the exhaustion penalty
3. Sunday rent
4. the scheduled random event, scaled by perks
5. achievements
6. the game-over check
7. one concise history line

Order still matters: rent lands before the event, so an event can pull a player
back from the brink that rent pushed them toward.

Step 1 is factored out as `computeDayEffects()`, which is also what the UI
calls to show the exact numbers a location is offering *before* the player
commits. The preview and the resolution cannot drift, because they are the
same function.

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

**26 painted portraits** of Léon, the major antagonists, and community and bar
regulars, rendered as WebP at 512px.

**22 location backgrounds** now cover every playable location. The five
new environmental scenes (soup kitchen, flea market, pawn shop, open mic and
letting office) are optimized WebP at 1000px. Background paths are derived
from the location catalogue by `scripts/check-assets.js`, so adding a location
cannot silently ship a broken image path.

**52 generated SVG avatars** from `scripts/generate-avatars.js`. Deterministic —
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

**312 tests** across six files.

| File | Tests | Scope |
|---|---|---|
| Six test files | **312** | Rules, catalogues, systems, DOM, UI, coverage edges |

The data tests are written as invariants over the whole catalogue rather than
spot checks, which is how they earn their keep — they caught three real design
bugs during the expansion: two locations that cost the player nothing (a free
lunch that would have broken the economy), a festival dated 29 September that
could never fire in a 30-day month, and an exhaustion penalty that rounded to
zero just below its own threshold.

Coverage on shipped code:

```
app.js             99.68 line | 90.36 branch |  94.92 funcs
core/*            ~99-100 across the board
data/*            ~99-100 across the board
ui/screens.js      99.55 line | 94.15 branch |  98.59 funcs
────────────────────────────────────────────────────────────
all files          99.78 line | 94.04 branch |  98.64 funcs
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

- **Not verified in a real browser.** The UI is jsdom-verified; a human pass on
  a real phone is still worthwhile (HUD identity row + map grid).
- **No audio.**
  has not bitten yet.
