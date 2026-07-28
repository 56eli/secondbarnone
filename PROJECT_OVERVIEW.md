# secondbarnone — design & architecture

A **browser-playable narrative resource-management game**. You play **Léon**,
who runs a spiritual community by day (sanity) and tends bar by night (money).
Each day you choose one. Neglect either side and the run ends.

This document covers design and internals. For setup, testing and deployment,
see [README.md](README.md).

> **Status:** playable, 445 tests, ~99.0% coverage on the shipped code.
> Implemented in vanilla ES modules — no engine, no build step.
>
> Money is an uncapped wallet (still lethal at 0). Every location has a host
> with small talk; every character is bound to one location and owns at least
> three events there. Léon stays prominent in the HUD. Weather stays calm and
> useful. Soft win at day 60, optional mastery at day 100.
>
> **Read [docs/DESIGN_PRINCIPLES.md](docs/DESIGN_PRINCIPLES.md) before changing
> anything** — it records how decisions get made here and why, and every rule
> in it is the generalisation of a bug that shipped.
> [DEVELOPMENT_ROADMAP.md](DEVELOPMENT_ROADMAP.md) is the ordered list of what
> is still owed.

---

## History: why there is no engine

The game was originally built in **Godot 4.7**. That version still exists on the
[`godot`](https://github.com/56eli/secondbarnone/tree/godot) branch and is
preserved verbatim.

It was rewritten because shipping a Godot web build requires running the Godot
binary to compile a `.pck` archive. That binary is not reachable from an agent
sandbox, so the game could not be built, tested or deployed automatically — and
one attempt to hand-assemble a `.pck` produced a corrupt, unplayable file.

As plain ES modules the source _is_ the build:

|                 | Godot                           | Current                                            |
| --------------- | ------------------------------- | -------------------------------------------------- |
| Deploy payload  | 39.5 MB                         | **3.62 MB** to play (+4.36 MB on-demand portraits) |
| Build step      | Godot binary + export templates | none                                               |
| Automated tests | 0                               | **371**                                            |
| Coverage        | —                               | **~99.7%**                                         |

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
    balance.js       every tuning number, with the reasoning attached
    game-state.js    stats, calendar, practices, save/load
    event-manager.js event scheduling and weighted selection
    turn.js          resolves one day in a fixed order
    rng.js           seedable RNG
  data/
    characters.js    78 profiles, each bound to one location
    locations.js     23 locations, 5 districts, 4 hub slots
    events.js        244 events, keyed by location
    weather.js        9 weather types, derived per day
    perks.js         10 perks in a prerequisite tree
    observances.js    5 repeatable insight spends (the late-game sink)
    festivals.js      9 fixed calendar events
    achievements.js  20 predicates over a state snapshot
  ui/
    screens.js       hub, location, practice, almanac,
                     characters, settings, modal, game over
```

Every module under `data/` is pure data plus pure helpers, which is why the
test suite can assert over the whole catalogue rather than sampling it.

### Why `core/balance.js` is separate from `core/game-state.js`

Every number that decides how the game _feels_ — the energy recovery rate, the
exhaustion ceiling, the endurance goal — lives in one small module with its
reasoning written next to it. Retuning is then one file rather than a hunt
through five, and the balance suite has a single source of truth to assert
against.

It also breaks a genuine import cycle. `game-state.js` imports the whole of
`data/`, so a `data/` module that wanted a tuning constant could not import it
back from `game-state.js`. `achievements.js` needs `ENDURANCE_GOAL_DAYS` in
order to describe itself; it reads it from `balance.js` instead.
`game-state.js` re-exports the lot, so every existing importer is unaffected
and there is still exactly one definition of each value.

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

| Signal                | Fired when                    |
| --------------------- | ----------------------------- |
| `stats_changed`       | sanity or money changes       |
| `day_changed`         | the calendar advances         |
| `game_over_triggered` | a stat hits zero (fires once) |
| `history_updated`     | a history line is added       |

`on()` returns an unsubscribe function. `emit()` iterates a copy of the listener
list, so a handler may safely unsubscribe mid-dispatch.

---

## Game rules

### Resources

|                | Start | Max      | What it is                                                               |
| -------------- | ----- | -------- | ------------------------------------------------------------------------ |
| **Sanity**     | 50    | 100      | Reaching 0 ends the run                                                  |
| **Money**      | 50    | uncapped | Wallet. Reaching 0 ends the run; HUD bar is comfort vs 100               |
| **Energy**     | 100   | 100      | Recovers ~14/night — a week from empty to full; running low costs sanity |
| **Reputation** | 10    | 100      | Gates locations                                                          |
| **Insight**    | 0     | —        | A currency, not a gauge. Spent on perks                                  |

The two founding locations keep their original numbers exactly — Spiritual
Community is still +15/−10 and the Bar is still +12/−12 — so the opening of a
run plays as it always did. Everything else is layered on top.

#### Energy

Energy is the resource the run is actually tuned around, so its numbers are
derived from one readable rule rather than picked individually:

> **A full week of rest takes you from empty to full.**

`ENERGY_RECOVERY` is literally `MAX_ENERGY / ENERGY_FULL_RECOVERY_DAYS`, which
is ~14.3 a night. Every location's energy cost is then priced _against_ that
figure, and most working days cost more than a night returns — a bar shift is
−24, the retreat is −32, and only the rest locations pay energy back. That is
the whole pressure: you cannot simply keep working, and the game will not stop
you from trying.

**Exhaustion.** Below 25 energy every action costs extra sanity, on a
**quadratic** curve rather than a linear one: −1 a day just under the
threshold, −10 a day at empty. The shape is the point. A single hard day is
nearly free, so pushing through once is a legitimate move and does not need
punishing; the cost then climbs steeply, so _ignoring_ energy drains a full
sanity bar in ten days. Forgivable once, fatal as a habit.

`Second Wind` widens the threshold — you get warned sooner — and softens the
fall, but empty still hurts.

The balance suite asserts this as behaviour rather than arithmetic: the same
reference strategy wins 15 runs out of 20 when it watches its energy bar and 0
out of 20 when it does not, which is the strongest statement available that
energy is a real consideration and not decoration.

#### Variance

A location's printed numbers are what it offers **on average**, not what it
pays out. Each carries a `variance` bundle — the maximum swing per resource —
and the day you actually get lands somewhere inside it.

The swing is **derived, never rolled**. `varianceForDay(location, day, seed)`
is a pure FNV-1a hash, exactly like the weather, and that matters twice over:
the hub preview and the turn resolution call the same function so the numbers
on the card are the numbers you get, and reloading a save shows the same day
rather than re-rolling it in the player's favour.

Two invariants keep it from becoming noise. Variance never flips the **sign**
of a resource a location is built around — the bar always pays, the retreat
always costs — because a place whose contract can invert is a place you cannot
plan around. And it must move both the gains _and_ the costs, or a location
becomes either a free lottery ticket or a tax.

### Locations

**23 locations across 5 districts.** Each carries tags (`quiet`, `night`,
`market`, `pilgrimage`, …) which are the join key for the whole game: weather
modifies by tag and perks bonus by tag.

#### Hub slots

The hub shows six cards. Slots **1 and 2** are the founding pair and never
move. Slots **3-6** rotate — but every non-founding location is permanently
assigned to exactly one of them by `slot`, and each day the hub picks one open
location _per slot_. Places therefore rotate **through** a position and never
**between** positions.

The slots have a character, which is the reason the rule buys anything:

| Slot | Reads as                     | Examples                                                   |
| ---- | ---------------------------- | ---------------------------------------------------------- |
| 3    | somewhere quiet              | loft, bathhouse, library, pawnbroker, memorial garden      |
| 4    | outdoors, spirit and service | canal, rooftop, clinic, soup kitchen, ruins, chapel        |
| 5    | markets and the stage        | garden, Saturday market, flea market, open mic, Vermillion |
| 6    | night work and errands       | night market, radio, letting office, Sato's, the retreat   |

Five or six locations per slot, so no position is a near-constant and none is
a free-for-all. The previous behaviour was a straight shuffle across all four
cards, which meant the place under your thumb was different every morning and
the board had to be re-read from scratch daily.

The choice inside a slot is deterministic in `(slot, day, seed)`, so the hub
can rerender on any stat change without the board moving under the player's
hand. `dailySlotLineup()` lives in `data/locations.js` rather than the
renderer, so it is testable headlessly — and the rendered cards carry a
`data-slot` attribute so the DOM tests can assert the same rule the data tests
assert.

Locations unlock on journey day, reputation, weekday, or a required perk/item.
A fresh run can reach three rotating/fixed choices plus the day-one welcome; a long, well-regarded one can reach all 23 through the six-card hub rotation.

**The day-one welcome.** Journey day 1 is the single exception. Brian keeps a
place for Léon at the **House of Middleway**, so the chapel is offered on the
first morning regardless of its own gate (day 6, 15 reputation) and takes slot
4 — the fourth hub card, row 2 column 1 — outright rather than competing for
it. The chapel _lives_ in slot 4, so from day two it simply rejoins that
slot's rotation instead of moving somewhere else. From day 2 the ordinary gate applies again and it rejoins the
rotation like anywhere else, so the early economy is untouched.

The exception lives in `evaluateUnlock()` rather than in the hub renderer,
which matters: the preview maths and the hub agree without
being told separately, and the rule is testable headlessly. The one thing the
welcome does _not_ override is the weather — a storm shuts the clearing for
Brian the same as for anyone, because the alternative is a location whose
"closed by the weather" contract has a hole in it.

Every location costs something — money, energy or sanity. That invariant is
enforced by test against the _luckiest possible_ day rather than the average
one, because a free location would collapse the decision.

### Weather

**9 types, derived not rolled.** `weatherForDay(day, seed, season)` is a pure
function of an FNV-1a hash, so the forecast can be read four days ahead in the
almanac without rolling anything, and a save restores the exact same sky.

Weather modifies effects by tag and can close tags outright — a storm shuts
every outdoor location unless you are carrying the rain shell. Snow is
winter-only, heatwaves are summer-only, blossom wind is spring-only.

### Rent — the pressure curve

Charged on Sundays, once each. Reduced by the `Tenants' Union Card` perk and by
reputation, skippable by paying ahead at the letting office, and waived
entirely on Rent Amnesty Day.

**Rent escalates.** It opens at 18 and steps up by 2 every fortnight from
journey day 15, to a ceiling of 34. Before this, rent was flat for a 300-day
run *and fell* with reputation and perks — the only economic pressure in the
game got cheaper the longer you survived, and a four-branch `if/else` held the
city for 300 days at 99 sanity and 1,765 money.

Relief still applies on top of the risen figure, so investment keeps paying: it
buys back a rising cost instead of discounting a static one. The balance suite
asserts the perk tree is now worth at least three runs in twelve, which is the
justification for the escalation existing at all.

The almanac shows the current rent and the day of the next rise, because a
pressure the player cannot see coming is an ambush rather than a difficulty
curve.

**Paying ahead is never a discount.** `prepayCost()` prices each week at the
rent due on the Sunday it actually covers. Two separate exploits came from
getting this wrong — an inclusive bound that made one week cover two Sundays
(a 44% permanent discount), and then bulk-buying at the cheap early rate to
dodge escalation entirely (20%). Convenience mechanics buy certainty, never a
better price.

### Observances — the repeatable insight sink

The perk tree costs 66 insight in total and is fully bought by roughly day 20.
After that, insight accumulated for the rest of a long run with **nothing to
buy** — a currency the game kept awarding that had stopped meaning anything.

**Observances** (`data/observances.js`) are the other half of the economy: five
repeatable spends that affect the next few days rather than the whole run.
Perks are who Léon has become; observances are what he is doing about tomorrow.

The rules that keep them from becoming a second perk tree:

- **Repeatable, never permanent.** Everything expires.
- **One at a time.** Starting another sets the current one down, without a
  refund. Choosing is the gameplay.
- **Never a get-out-of-jail card.** Nothing restores a resource directly; they
  change the *shape* of a day — steadying its variance, softening rent, pushing
  the exhaustion threshold out. The worst case is that one did nothing, not
  that it saved a run which should have ended.

### Relationships

Every character carries an `affinity` count on the run, incremented when one of
their events fires. The People screen reads it, so the roster shows who this
run has actually met rather than handing over an encyclopaedia at turn one.

This is deliberately a plain counter rather than a tier system: the tiers should
be defined by the content that gates on them, and that content does not exist
yet. See roadmap item 1.4 — the engine work is done, the fourth-and-later events
are not written.

### Practice and milestones

- **10 perks** in a prerequisite tree, bought with insight. Test-enforced to be
  acyclic and declared in a buyable order.
- **9 festivals** on fixed calendar dates, and **20 achievements** expressed as
  pure predicates over a state snapshot. The old "survive to day 200" milestone
  was retired along with the 100-day goal: an achievement three times longer
  than the win condition is a number, not a reward.

The former task-contract system and long-form journal were deliberately retired
so the run remains about one readable daily choice. The hub retains five concise
history lines, and its focus cue can quietly flag resource pressure or rent.

### Events

**244 events.** **228 (93.4%)** belong to side characters.

The catalogue has one rule, and it is structural:

> **Every character is bound to exactly one location, and has at least three
> events, all of which fire only at that location.**

`data/events.js` is therefore declared as a **map of location id → events**
rather than as a flat list. `requiredLocation` is stamped on by
`buildEventPool()` from the declaring key, so an event physically cannot drift
away from the person it belongs to — the gate is not a field somebody has to
remember to fill in. Character bindings live in `characters.js` as
`locationId`, and the human-readable place name shown on the People screen is
_derived_ from it, so the two can never disagree.

The three-event floor is what turns a location from a slot machine with
scenery into somewhere specific people are. Each place has nine to thirteen
events drawn only from its own residents, so visiting the night market means
running into Cheezl, Fraghis or The Hand — never a stranger from across town.

Extra gates (`requiredWeather`, `minimumDay`, the burnout counter) stack _on
top of_ the location rather than replacing it. Kaden keeps his four-beat arc
escalating the rent pressure from refiled paperwork to a buyout offer on very
good paper, and Sato and Alex keep theirs.

A test walks every location under four skies and 300 days to prove that every
single event in the catalogue is actually reachable in play — dead copy fails
the build.

Scheduling is deterministic and faster: 1–3 journey-days apart, with
the last four events filtered out of the pool to avoid repetition. Events unseen
in the current run, and especially across previous runs, receive extra weight so
the larger catalogue broadens rather than repeats.

### Turn order

`resolveTurn()` in `core/turn.js` applies, in this exact order:

1. the day's effects — location, its daily variance, weather, festival, perks
2. the exhaustion penalty
3. Sunday rent
4. the scheduled random event, scaled by perks
5. achievements
6. the game-over check
7. one concise history line
8. **the calendar advances**

Order still matters: rent lands before the event, so an event can pull a player
back from the brink that rent pushed them toward.

**Step 8 is the important one.** Advancing the day used to live in the UI —
`resolveTurn()` applied the effects and the result modal's Continue handler
called `advanceDay()`. Because the autosave fired between those two points,
refreshing the page while the modal was open reloaded a save with the day's
gains banked and the calendar still on the day just played. Ten refreshes at
the loft took a run from 30 sanity / 20 energy to 100/100 without consuming a
single day, bypassing rent, the endurance goal and every day-gated unlock.

The fix is structural rather than a save flag: **resolving a day and advancing
past it are one operation**, so there is no persistable state in which a day
has been paid for but not consumed. The result modal is now a report on a day
that is already over — which is also what it always read as. A fatal day is the
one exception and does not advance, so the game-over screen names the right
date.

`tests/exploits.test.js` reproduces the original sequence and asserts it no
longer pays.

Step 1 is factored out as `computeDayEffects()`, which is also what the UI
calls to show the exact numbers a location is offering _before_ the player
commits. The preview and the resolution cannot drift, because they are the
same function.

---

## Cast

**78 characters.**

| Role           | Count          |
| -------------- | -------------- |
| Protagonist    | 1 — Léon       |
| Arch Nemesis   | 1 — Kaden      |
| Rival          | 2 — Sato, Alex |
| Side Character | 74             |

**Kaden** is a developer circling the community's land — never threatening,
just refiling paperwork while the rent notices do the work. **Sato** runs a
polished rival wellness studio; **Alex** runs the craft cocktail bar two streets
over. Each has a full profile in the same shape as everyone else.

The character screen groups by role (antagonists first) and filters on name,
role, location or biography text. A flat list of 78 was unusable.

### Everyone lives somewhere

Every character carries a `locationId` naming exactly one place in the
catalogue, and the cast is spread deliberately evenly: **three or four people
per location**, never fewer than three and never more than four. A location
with nobody in it is scenery; one with fifteen is a crowd you cannot tell
apart, and either way "who is here" stops being readable.

Placement is by fit rather than by filling gaps — Renata soaks at the
bathhouse, Kaj reads at the library, Crveni organises in the letting office
waiting room, Kopung keeps the mountain retreat. Every location's **host** is
one of its own residents, which is enforced by test: a host bound elsewhere is
the most visible possible version of the bug, since their face is on the card.

### Seth, "The Hand"

Nobody at the night market calls him Seth. He is **The Hand**, and has been for
long enough that stallholders who have known him a decade will ask whether The
Hand has a first name. The stories about where it came from disagree with each
other and he has never confirmed any of them; he answers to it without
hesitation and signs his delivery notes with a small drawing of one. His
profile, his relationship with Léon and two of his three events all use the
name people actually use, and a test asserts it stays that way.

### Ids and unicode

Display names include Cyrillic, fraktur, Hangul and emoji. Ids are ASCII slugs
derived from them, because ids map directly onto portrait filenames:

| Display name    | Id        | Portrait       |
| --------------- | --------- | -------------- |
| `𝕽𝖆𝖚𝖑`          | `raul`    | `raul.webp`    |
| `Kopung (고풍)` | `kopung`  | `kopung.svg`   |
| `Renata 🦥`     | `renata`  | `renata.webp`  |
| `Qusтoge`       | `qustoge` | `qustoge.webp` |

The UI always renders the original spelling. Slug uniqueness is enforced by test.

---

## Art

**78 painted portraits — the whole cast.** Every character now has real
painted art; the procedural SVG placeholders are gone, and a test fails the
build if one comes back. `docs/side_characters_report.md` is the canonical art
tracker and now carries two deliberately empty tables for art that exists but
should be _improved_.

**The off-style four.** Full coverage was not the same as a coherent cast.
`kaj`, `arian` and `dorian` shipped as pixel-art sprites and `lakshay` as a
flat cartoon vector with a third-party stock watermark baked into the
deployed payload — four different games sitting next to each other in the
People list. All four were repainted into the house style (warm
semi-realistic oil painting, chest-up, circular distressed cream frame, a
background detail that says who the person is) and each now carries the trait
its rewritten profile turns on: Kaj reading, Lakshay at his cellar server
rack, Arian mid-story over a glass, Dorian immovable in his armchair.

### Portraits ship in two tiers

| Tier      | Path                            | Size  | Used by                 |
| --------- | ------------------------------- | ----- | ----------------------- |
| Thumbnail | `assets/portraits/<id>.webp`    | 288px | every inline avatar     |
| Hi-res    | `assets/portraits/hi/<id>.webp` | 896px | the lightbox, on demand |

The largest avatar the game renders inline is **84 CSS px**, so the previous
single 512px sheet was ~6x oversized on every page load — while being too
_small_ for the enlarged view, which renders up to 560 CSS px. Splitting the
tiers cut the portrait eager payload from ~4.85 MB to **~2.93 MB** and made the
enlarged view genuinely sharp. `scripts/build-portraits.js` emits both tiers,
picks the largest available source rather than the first matching format, and
never upscales.

### The portrait lightbox

Every portrait — HUD, host banner, People screen, day-result event card —
is a clickable/tappable button. It opens **the artwork and nothing else**: no
name, no role, no bio, no relationship (see `renderPortraitPopup` /
`openCharacterPopup` in `docs/js/ui/screens.js`). The reasoning is that the
inline avatar is a _preview_ of a picture, so the popup is that picture at
full size; adding chrome would make it a second, worse character sheet
competing with the People screen, which is where a player goes to read. The
character's name survives only in `alt` text, for screen readers.

The lightbox fetches the hi-res sheet lazily and falls back once to the
thumbnail if it is missing, so a broken hi file degrades to "slightly soft"
rather than an empty frame.

**23 location backgrounds**, WebP at 1000px behind a dark scrim, covering every
playable location. Background paths are derived from the location catalogue by
`scripts/check-assets.js`, so adding a location cannot silently ship a broken
image path, and an _unreferenced_ background now fails a test rather than
quietly adding weight.

Six backgrounds were repainted in the July 2026 pass for **Paris coherence** —
the night market had East Asian lanterns, the "mountain retreat" had alpine
peaks in a game set in the Île-de-France, and the Saint-Denis crypt was drawn
as an outdoor hilltop ruin. The hub's `hub_background.svg` — a 900-byte file of
five blurred circles — was replaced with a painted Paris street corner showing
the bar and the community room facing each other.

A **second coherence pass** caught five the first one missed, because that
pass fixed the scenes that were obviously wrong and stopped: the clinic had
English-language posters, the community garden was a New York block of
red-brick tenements and fire escapes, the rooftop looked out on a North
American downtown of glass towers, the letting office onto British suburban
terraces, and the loft onto an anonymous high-rise skyline. All five are now
Haussmann limestone, wrought iron and zinc mansard roofs. Two of them
(`free_clinic`, `home_loft`) had never had a committed PNG master, so
`npm run assets` could not rebuild them at all; both now do, and a test
asserts every repainted background keeps its master.

Missing portraits fall back to an initials chip, which is exercised by test.

Source art in `assets/` is well over 100 MB; the deployed payload in
`docs/` is 3.70 MB eager plus 4.36 MB of on-demand portrait sheets (8.06 MB total; the hi-res tier is on demand).
`scripts/build-portraits.js` rebuilds both portrait tiers and prunes orphans in
one pass.

---

## Testing

**445 tests** across the suite.

| Area | Scope |
| ---- | ----- |
| Balance and simulations | Energy rate and pressure, exhaustion curve, variance, rent pressure, endurance reachability and invalid-state guards over seeded playthroughs |
| Cast and events | Character↔location binding, the three-events-each floor, event reachability, rarity weights and antagonist/rival arcs |
| Hub slots and UI | Six-card hub assignment and rotation, settings/audio controls, almanac, practice tree, People screen, modals, toasts and autosave |
| Assets and coverage edges | Portrait tiers, background references, retired-art hashes, accessibility affordances, save migration and branch/edge coverage |

`tests/portrait-assets.test.js` is new and checks the art itself rather than
the code that renders it: both tiers exist for all 78 characters, thumbnails
never exceed 288px, a hi-res sheet is never _smaller_ than the thumbnail it
enlarges, no orphaned or SVG portrait files ship, and every deployed
background is referenced by a location. It skips cleanly if ImageMagick is
unavailable.

It also pins the four portraits repainted in the off-style pass (`kaj`,
`lakshay`, `arian`, `dorian`) by content hash. Those four were pixel-art
sprites and one watermarked cartoon vector sitting in an otherwise painterly
cast, and no existing test could see the problem — the files existed, were the
right dimensions, and were under budget. The guard is a hash rather than a
"does this look painted" heuristic on purpose: blockiness and colour-count
metrics were measured against the real files first and **overlap between the
two styles**, so any threshold would fail on unrelated art sooner or later. A
hash fails if and only if the exact retired file returns, which is the real
regression — re-running the builder against a stale source. A companion test
asserts the superseded 512px WebP sources stay deleted, since those are what
the builder picked up the first time.

It also measures the House of Middleway background rather than trusting the
brief: the chapel was repainted from a dusk scene to a sunlit one, so the test
asserts its mean luminance is above 0.35 _and_ that it is the brightest
background in the game — and then checks the same figure back through the
`.location` scrim to prove the brighter art did not cost the panel its text
legibility. A tonal regression there is invisible to jsdom and easy to
reintroduce by re-running the optimiser against a stale source.

That "hi is never smaller than the thumb" assertion is a regression test for a
real bug: the first build picked sources by format preference, so three early
characters with a 160px PNG sitting next to a 512px WebP got an _enlarged_
view that was blurrier than the thumbnail.

The data tests are written as invariants over the whole catalogue rather than
spot checks, which is how they earn their keep — they caught three real design
bugs during the expansion: two locations that cost the player nothing (a free
lunch that would have broken the economy), a festival dated 29 September that
could never fire in a 30-day month, and an exhaustion penalty that rounded to
zero just below its own threshold.

Coverage on shipped code:

```
app.js             ~99-100 across the board
core/*            ~99-100 across the board
data/*            ~99-100 across the board
ui/screens.js      99.72 line | 84.06 branch |  97.10 funcs
────────────────────────────────────────────────────────────
all files          99.46 line | 90.38 branch |  96.03 funcs
```

`npm run coverage:check` enforces an 80% floor on all three metrics and exits
non-zero below it.

All randomness routes through `core/rng.js`, so tests are deterministic while
normal play stays random. Long seeded playthroughs (25 seeds × 300 turns) assert
that state never goes invalid.

---

## Accessibility

Semantic buttons and headings, visible focus rings, `aria-selected` and
`aria-activedescendant` on the character list, `role="dialog"` with `aria-modal`
on the result modal, labelled search input, and full keyboard operability.

Settings now expose text size, high contrast, non-colour stat bars and a
reduced-motion toggle. `prefers-reduced-motion` still disables particles and
collapses transitions — covered by a dedicated test that boots the app with the
media query forced on.

---

## Known gaps

- **Not verified in a real browser.** The UI is jsdom-verified; a human pass on
  a real phone is still worthwhile (HUD identity row, six-card hub grid and settings dialog).
- **Audio is intentionally minimal.** A compressed warm piano loop lives in `docs/assets/audio/` and is controlled from Settings; more sound design should stay optional and respect browser autoplay limits.
