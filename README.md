# secondbarnone

A small narrative balance game. You play **Léon**, who runs a spiritual community
by day and tends bar by night. Every day you pick one place to be. The community
restores your sanity but costs money; the bar pays but grinds you down. Rent hits
every Sunday — and climbs. Let sanity or money reach zero and the run ends.

Those two places are where you start. There are **23 locations across five
districts**, and they reveal through the six main hub cards as the run goes on — a rooftop, a bathhouse, a
night market, a pirate radio station, a temple ruin an hour out on the bus.
Every location has a **host** from the cast; every event belongs to someone you
know. Every portrait — HUD, host banners, the People screen, event cards — is
**clickable/tappable**, and the small avatar is a preview: tapping it opens the
artwork full-size and nothing else. Bios stay on the People screen.
Weather is written down four days in advance and closes the outdoor ones.
Insight buys practices, and a gentle daily focus cue makes the next decision easier to read. Survive **60 days**
and the run acknowledges it — without forcing you to stop. A hundred days,
well-known, well-traveled and still standing earns the mastery ending.

Keep an eye on **energy**. A full night returns an eighth of the bar, and a
week of *pushing* empties it outright — literally: seven back-to-back bar
shifts flatline a full tank. Being drained costs sanity **and money**:
takeaway instead of cooking, cabs instead of walking. Rest is a decision,
not a formality.

**Play:** https://56eli.github.io/secondbarnone/
**Share your city:** the Settings screen exposes this run's seed as a link.
Anyone opening it plays the same Paris — same weather, same event timing.

For design details and internals, see [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md).
For what is authoritative where, see **Documentation map** below.

---

## Why this is plain HTML/CSS/JS

Shipping a Godot web build required a binary the agent sandbox could not reach.
The game was rewritten as vanilla ES modules so the source **is** the build:

|                 | Godot version                   | This version                                                                   |
| --------------- | ------------------------------- | ------------------------------------------------------------------------------ |
| Deploy payload  | 39.5 MB                         | **3.87 MB** eager (+5.82 MB of full-size portraits fetched only when tapped; 0.80 MB music is lazy) |
| Build step      | Godot binary + export templates | none                                                                           |
| Automated tests | 0                               | **395**                                                                        |
| Coverage        | —                               | **~98.2%**                                                                     |

Legacy Godot sources have been removed from this branch. The original engine
project may still exist on a historical `godot` branch if one was preserved
remotely; it is not part of the shipped game.

## Running locally

No build step:

```bash
npm install         # only needed for the test suite
npm run serve       # → http://localhost:8000
```

Any static server works — `python3 -m http.server -d docs` is equivalent. The
game must be served over HTTP, not opened as a `file://` URL, because ES modules
are subject to CORS.

## Tests

```bash
npm test                # complete rule, asset and jsdom UI suite
npm run coverage        # with a coverage table
npm run coverage:check  # enforce the 80% floor, non-zero exit if below
npm run check           # lint + format + typecheck + tests + asset integrity
```

Current measured coverage (30 July 2026) — `npm run coverage:check`:

```
all files    98.20 line | 85.47 branch | 92.22 funcs
```

Randomness goes through a seedable RNG (`docs/js/core/rng.js`), so tests are
deterministic while normal play stays random — except where determinism is a
promise: weather, daily variance and the event draw all derive from the run
seed and survive a reload unchanged.

### Difficulty assessment

`npm run simulate -- --runs=300 --days=61` drives seven deterministic player
models through the **actual six-card hub**: `random`, `doesnt_pay_attention`,
`pays_attention_sometimes`, `average`, `greedy`, `concentrates`, and
`min_maxing`. The dedicated `tests/difficulty.test.js` encodes the current
tuning contract (Hard Winter, 30 July 2026 — one canonical tuning, no easy
mode). Measured 60-day goal rates:

| Model | Goal | Reading |
| --- | ---: | --- |
| `doesnt_pay_attention` | **0%** | alternating the founding pair blindly always dies |
| `random` | **20%** | luck is not a plan |
| `greedy` | **21%** | naive preview-reading dies ~4 of 5 runs |
| `average` | **36%** | the reference player faces hard-but-winnable odds (contract band: 35–50%) |
| `pays_attention_sometimes` | **38%** | attention is the game |
| `concentrates` | **52%** | engaged play wins just over half |
| `min_maxing` | **61%** | the ceiling — nobody is immortal |

The table is measured against the real six-card hub (`poolMode: 'hub'`, 300
runs). A second harness exists as a stress bound: `tests/balance.test.js`
lets every model teleport to any open location (`poolMode: 'unlocked'`) over
a 200-day horizon, and there the inattentive styles die always (0% goal)
while `concentrates` and `min_maxing` each win ~88%. The two harnesses are
calibrated separately — never mix their numbers. The models are balancing
instruments, not claims about real players; human playtests remain the final
authority. See CHANGELOG (30 July 2026) for what the tuning is and why.

Asset integrity is checked separately:

```bash
node scripts/check-assets.js
```

It also warns when the eager payload leaves less than 10% headroom against the
4 MB budget, so budget conversations happen in review rather than in a failed
CI build.

## Project layout

```
docs/                      ← deployed by GitHub Pages (main /docs)
  index.html
  css/style.css
  js/
    main.js                entry point (seed-URL parsing + boot)
    app.js                 wiring: HUD, screens, modal, autosave, game over
    core/
      game-state.js        stats, calendar, practices, save/load
      event-manager.js     scheduling, weighted selection
      turn.js              one turn, resolved in order; preview vs resolution
      rng.js               seedable RNG
    data/
      characters.js        78 characters
      locations.js         23 locations (each with a host)
      events.js            235 events, keyed by location (3+ per character)
      weather.js / perks.js
      festivals.js / achievements.js
    ui/screens.js          six-card hub, location, practice, portrait lightbox
  assets/
    portraits/             288px thumbnails, one per character
    portraits/hi/          896px sheets for the enlarge-on-tap lightbox
    backgrounds/           1000px location art

assets/                    full-resolution source art (not deployed — see below)
scripts/                   dev tooling (serve, assets, coverage gate, simulator)
tests/
```

### Repository size and history, in one honest paragraph

The working tree's `assets/` source art is ~243 MB and the packed Git dir is
~277 MB: `.gitattributes` declares LFS tracking for `assets/**`, but the
migration was never executed, so all masters are plain blobs — and history is
a two-snapshot squashed import (29 July 2026), so every master exists twice in
the pack. If you just want to read the code, clone with
`git clone --depth 1`. Migrating the masters to LFS (or an external store) is
a recorded open decision; rewriting history to do it is a deliberate act,
not an accident to slip into a PR.

## Cast

78 characters. Léon is the protagonist; **Kaden** is the arch nemesis; **Sato**
and **Alex** are rivals with multi-beat arcs. The remaining 74 are side
characters. Every character is bound to **one location** and has **at least three
events** that fire only there, so a place is somewhere specific people are
rather than a slot machine with scenery. **222 of 235 events** belong to side
characters.

Léon's portrait and name sit in the HUD on every screen.

## Resources

|                | Start | Cap          | Notes                                                                                         |
| -------------- | ----- | ------------ | --------------------------------------------------------------------------------------------- |
| **Sanity**     | 50    | 100%         | Gauge. 0 ends the run.                                                                        |
| **Energy**     | 100   | 100%         | Gauge. Recovers 12/night — eight nights from empty to 96. Below 25 it drains sanity **and money**, steeply. |
| **Reputation** | 10    | 100%         | Gauge. Gates places; shaves rent by 1–2.                                                      |
| **Money**      | 50    | **uncapped** | Wallet. Still ends the run at 0. HUD bar is a comfort meter against 100.                      |
| **Insight**    | 0     | uncapped     | Spent on perks.                                                                               |

## Game rules

- Start Thursday 1 January 2026.
- Spiritual Community: **+18 sanity, −8 money, −14 energy**.
- The Bar: **+20 money, −14 sanity, −26 energy**.
- Rent: starts at **−18 money** every Sunday, rises by 3 every 14 journey days, and caps at 48 before modest reputation/perk discounts.
- A random event fires every 2–5 days. Weights are 10 for Common and 2 for each
  Rare, so at the current 9–13-event location pools roughly **one event in
  twelve** is rare (measured 8.7% weighted across the catalogue).
- Burnout unlocks only after 3 consecutive bar days.
- The same event never fires twice in a row.
- Reaching 0 sanity or 0 money ends the run.
- Reaching journey day **60** awards a soft win without ending the run; a
  day-100 mastery ending exists for the well-traveled.
- Energy recovers **12 points each night**: eight nights restore 96 from empty
  and a ninth tops off. Rest remains valuable — and it always costs a day.
- Below 25 energy every day costs extra sanity, on a quadratic curve that is
  nearly free at the threshold and **−12 a day** at empty — plus a money burn
  that peaks at **−9 a day** (Second Wind postpones both from 25 to 17). One
  hard day is fine; a fortnight of them is not.
- Winter bites **in and around** winter: snow falls December–February at full
  strength and still visits November and early March at half rate; hard frost
  lingers into March. The almanac's forecast is computed per actual calendar
  day, so shoulder-season snow is never a surprise.
- Every location's printed numbers are an **honest average**: weather,
  festival and your perks are included, and the swing is *not* — the day you
  actually get lands deterministically around the average, so you can trust
  what a place is for without ever knowing the dice in advance.
- **The weather edits how much of that preview you can see.** Rain and snow
  blur every card into rough `+`/`++`/`-`/`--` estimates (direction and
  scale, not arithmetic); fog hides the numbers and the reasons alike.
  Planning in bad weather is a judgement call, not a spreadsheet.
- **The city keeps a weekly rhythm.** The Saturday Market opens Saturdays
  only, the Puces de Saint-Ouen Sundays only, the open mic Fridays and
  Saturdays. A weekday-gated place shows its card on its day and the day
  before (so you see the rhythm coming); the rest of the week its slot moves
  on rather than holding a dead card.
- Runs autosave to `localStorage` after every day and resume on reload — a
  reload replays the exact same scheduled day rather than re-rolling it.

## Homely design notes

Eleven things that make the city feel like a home:

1. **Léon is always on screen** — portrait + name in the HUD.
2. **Day one begins with a friend.** Brian keeps a place for Léon at the
   House of Middleway, pinned to the fourth card of the hub (row 2, column 1)
   and playable straight away under every sky. The invitation bypasses its
   progression gates and weather closure on day one only; from day two the
   chapel goes back behind its ordinary gate.
3. **Every location has a host** you will likely see there.
4. **Most events belong to side characters** — 222 of 235 — with their face on the result.
5. **Daily greetings** that change with weekday and season.
6. **Host small talk** gives every location a familiar voice without turning it into a biography page.
7. **Dedicated backgrounds for all 23 locations**, including the newest environmental scenes.
8. **A gentle daily focus cue** surfaces low resources or upcoming rent without taking control away.
9. **Soft 60-day endurance goal** — long enough to see the whole arc, short enough to finish.
10. **Uncapped money** — tips stack; broke still kills the run.
11. **Percent gauges** for sanity, energy and reputation; money shows a real wallet total.
12. **The six cards are the complete city route.** Cards 3-6 keep their
    positions, and each slot cycles through every assigned location—locked
    cards included—so requirements are visible before they unlock. The single
    refinement: weekday-gated places (the markets, the open mic) only hold
    their card on their day and the day before, then step aside so the board
    never shows a promise you cannot keep this week. There is no separate
    City or Map navigation screen.

## Accessibility

Semantic buttons and headings throughout, visible focus rings, `aria-selected`
on the character list, `role="dialog"` with `aria-modal` on the result modal,
`role="meter"` on the stat bars, and full keyboard operability.
`prefers-reduced-motion` disables particles and collapses transitions; a
high-contrast mode and the same reduced-motion setting persist in Settings.

## Art policy and known gaps

All new portrait art is frame-less and square; CSS supplies round inline
avatars. Brian and Vanna are frozen exceptions—Vanna's bunny portrait must
never be changed. The current regeneration policy lives in
[`notes/ART_STANDARD.md`](notes/ART_STANDARD.md).

- The UI is jsdom-verified; a human pass on a real phone is still worthwhile.
- Background music is off by default and lazy-loaded from the Settings screen
  the first time you turn it on (a ~900 KB slow warm pad loop, generated by
  `scripts/gen-warmth.py`; autoplay policies are respected).
- Navigating between locations never flashes black: the incoming screen is
  fully ready underneath before the outgoing one dissolves (backgrounds are
  pre-loaded, and the dissolve honours `prefers-reduced-motion`).

## Documentation map

Canonical (current release contract — edit these as the game changes):

- **README.md** (this file) — what the game is and what its rules are.
- **PROJECT_OVERVIEW.md** — architecture, systems and internals.
- **CHANGELOG.md** — dated record of what changed, newest first.
- **AUDIT_2026-07-30.md** — the current full audit, including verification
  results and the resolution log of every finding.
- **DEVELOPMENT notes** in `notes/` — art standard, portrait exceptions and
  the balance postmortem that the tuning contract answers to.

Historical (frozen context, do not cite for current facts — each is marked
accordingly in its first lines): `ASSESSMENT.md`, `AUDIT_2026-07-29*.md`,
`AUDIT_CURRENT_2026-07-29.md`, `HANDOFF.md`, `DESIGN_REVIEW.md`,
`DEVELOPMENT_ROADMAP.md`.
