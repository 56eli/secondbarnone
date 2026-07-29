# secondbarnone

A small narrative balance game. You play **Léon**, who runs a spiritual community
by day and tends bar by night. Every day you pick one place to be. The community
restores your sanity but costs money; the bar pays but grinds you down. Rent hits
every Sunday. Let sanity or money reach zero and the run ends.

Those two places are where you start. There are **23 locations across five
districts**, and they reveal through the six main hub cards as the run goes on — a rooftop, a bathhouse, a
night market, a pirate radio station, a temple ruin an hour out on the bus.
Every location has a **host** from the cast; every event belongs to someone you
know. Every portrait — HUD, host banners, the People screen, event cards — is
**clickable/tappable**, and the small avatar is a preview: tapping it opens the
artwork full-size and nothing else. Bios stay on the People screen.
Weather is written down four days in advance and closes the outdoor ones.
Insight buys practices, and a gentle daily focus cue makes the next decision easier to read. Survive **60 days**
and the run acknowledges it — without forcing you to stop.

Keep an eye on **energy**. A full night returns about a seventh of the bar, so a
week of rest puts you right and a week of pushing puts you in the ground.

**Play:** https://56eli.github.io/secondbarnone/

For design details and internals, see [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md).

---

## Why this is plain HTML/CSS/JS

Shipping a Godot web build required a binary the agent sandbox could not reach.
The game was rewritten as vanilla ES modules so the source **is** the build:

|                 | Godot version                   | This version                                                                   |
| --------------- | ------------------------------- | ------------------------------------------------------------------------------ |
| Deploy payload  | 39.5 MB                         | **~2.9 MB** to play (+4.4 MB of full-size portraits, fetched only when tapped) |
| Build step      | Godot binary + export templates | none                                                                           |
| Automated tests | 0                               | **374**                                                                        |
| Coverage        | —                               | **~99.7%**                                                                     |

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
npm run check           # tests + asset integrity
```

Current coverage — `npm run coverage:check`:

```
all files    99.65 line | 90.38 branch | 96.00 funcs
```

Randomness goes through a seedable RNG (`docs/js/core/rng.js`), so tests are
deterministic while normal play stays random.

Asset integrity is checked separately:

```bash
node scripts/check-assets.js
```

## Project layout

```
docs/                      ← deployed by GitHub Pages (main /docs)
  index.html
  css/style.css
  js/
    main.js                entry point (three lines)
    app.js                 wiring: HUD, screens, modal, autosave, game over
    core/
      game-state.js        stats, calendar, practices, save/load
      event-manager.js     scheduling, weighted selection
      turn.js              one turn, resolved in order
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

assets/                    full-resolution source art (not deployed)
scripts/                   dev tooling (serve, assets, coverage gate)
tests/
```

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
| **Energy**     | 100   | 100%         | Gauge. Recovers ~14/night — a full week from empty to full. Exhaustion costs sanity, steeply. |
| **Reputation** | 10    | 100%         | Gauge. Gates places.                                                                          |
| **Money**      | 50    | **uncapped** | Wallet. Still ends the run at 0. HUD bar is a comfort meter against 100.                      |
| **Insight**    | 0     | uncapped     | Spent on perks.                                                                               |

## Game rules

- Start Thursday 1 January 2026.
- Spiritual Community: **+15 sanity, −10 money**.
- The Bar: **+12 money, −12 sanity**.
- Rent: starts at **−18 money** every Sunday, rises by 3 every 24 journey days, and caps at 42 before modest discounts.
- A random event fires every 2–5 days. Weights are 10 for Common and 2 for each
  Rare, so roughly one event in six is rare.
- Burnout unlocks only after 3 consecutive bar days.
- The same event never fires twice in a row.
- Reaching 0 sanity or 0 money ends the run.
- Reaching journey day **60** awards a soft win without ending the run.
- Energy recovers **14 points each night**: seven nights restore 98 points and an eighth tops off an empty bar. Rest remains valuable but costly.
- Below 25 energy every action costs extra sanity, on a curve that is nearly
  free at the threshold and **−10 a day** at empty. One hard day is fine; a
  fortnight of them is not.
- Every location's printed numbers are an **average**. The day you actually get
  swings around them — deterministically, so the preview never lies — but the
  swing never flips what a place is for.
- Runs autosave to `localStorage` after every day and resume on reload.

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
    cards included—so requirements are visible before they unlock. There is no
    separate City or Map navigation screen.

## Accessibility

Semantic buttons and headings throughout, visible focus rings, `aria-selected`
on the character list, `role="dialog"` with `aria-modal` on the result modal,
`role="meter"` on the stat bars, and full keyboard operability.
`prefers-reduced-motion` disables particles and collapses transitions.

## Art policy and known gaps

All new portrait art is frame-less and square; CSS supplies round inline
avatars. Brian and Vanna are frozen exceptions—Vanna's bunny portrait must
never be changed. The current regeneration queue lives in
[`notes/ART_STANDARD.md`](notes/ART_STANDARD.md).

- The UI is jsdom-verified; a human pass on a real phone is still worthwhile.
- Background music is off by default and lazy-loaded from the Settings screen
  the first time you turn it on (a ~800 KB warm piano loop; autoplay policies
  are respected).
