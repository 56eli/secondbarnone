# secondbarnone

A small narrative balance game. You play **Léon**, who runs a spiritual community
by day and tends bar by night. Every day you pick one place to be. The community
restores your sanity but costs money; the bar pays but grinds you down. Rent hits
every Sunday. Let sanity or money reach zero and the run ends.

Those two places are where you start. There are **22 locations across five
districts**, and they open up as the run goes on — a rooftop, a bathhouse, a
night market, a pirate radio station, a temple ruin an hour out on the bus.
Every location has a **host** from the cast; every event belongs to someone you
know. Weather is written down four days in advance and closes the outdoor ones.
Insight buys practices, and a gentle daily focus cue makes the next decision easier to read. Survive **100 days**
and the run acknowledges it — without forcing you to stop.

**Play:** https://56eli.github.io/secondbarnone/

For design details and internals, see [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md).

---

## Why this is plain HTML/CSS/JS

Shipping a Godot web build required a binary the agent sandbox could not reach.
The game was rewritten as vanilla ES modules so the source **is** the build:

| | Godot version | This version |
|---|---|---|
| Deploy payload | 39.5 MB | **~2.8 MB** |
| Build step | Godot binary + export templates | none |
| Automated tests | 0 | **312** |
| Coverage | — | **~99%** |

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
npm test                # 312 tests
npm run coverage        # with a coverage table
npm run coverage:check  # enforce the 80% floor, non-zero exit if below
npm run check           # tests + asset integrity
```

Current coverage — `npm run coverage:check`:

```
all files    99.78 line | 94.04 branch | 98.64 funcs
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
      locations.js         22 locations (each with a host)
      events.js            64 events (each with a character)
      weather.js / perks.js
      festivals.js / achievements.js
    ui/screens.js          hub, map, location, practice, …
  assets/                  optimised WebP + SVG

assets/                    full-resolution source art (not deployed)
scripts/                   dev tooling (serve, assets, coverage gate)
tests/
```

## Cast

78 characters. Léon is the protagonist; **Kaden** is the arch nemesis; **Sato**
and **Alex** are rivals with multi-beat arcs. The remaining 74 are side
characters. Every location has a host with their own small-talk list, and **51 of 64 events**
are tied to side characters, so the city feels peopled rather than abstract.

Léon's portrait and name sit in the HUD on every screen.

## Resources

| | Start | Cap | Notes |
|---|---|---|---|
| **Sanity** | 50 | 100% | Gauge. 0 ends the run. |
| **Energy** | 100 | 100% | Gauge. Exhaustion costs sanity. |
| **Reputation** | 10 | 100% | Gauge. Gates places. |
| **Money** | 50 | **uncapped** | Wallet. Still ends the run at 0. HUD bar is a comfort meter against 100. |
| **Insight** | 0 | uncapped | Spent on perks. |

## Game rules

- Start Thursday 1 January 2026.
- Spiritual Community: **+15 sanity, −10 money**.
- The Bar: **+12 money, −12 sanity**.
- Rent: **−18 money** every Sunday, charged once.
- A random event fires every 2–5 days. Weights are 10 for Common and 2 for each
  Rare, so roughly one event in six is rare.
- Burnout unlocks only after 3 consecutive bar days.
- The same event never fires twice in a row.
- Reaching 0 sanity or 0 money ends the run.
- Reaching journey day **100** awards a soft win without ending the run.
- Runs autosave to `localStorage` after every day and resume on reload.

## Homely design notes

Ten things that make the city feel like a home:

1. **Léon is always on screen** — portrait + name in the HUD.
2. **Every location has a host** you will likely see there.
3. **Most events belong to side characters** — 51 of 64 — with their face on the result.
4. **Daily greetings** that change with weekday and season.
5. **Host small talk** gives every location a familiar voice without turning it into a biography page.
6. **Dedicated backgrounds for all 22 locations**, including the five newest environmental scenes.
7. **A gentle daily focus cue** surfaces low resources or upcoming rent without taking control away.
8. **Soft 100-day endurance goal** — a reason to keep a long run going.
9. **Uncapped money** — tips stack; broke still kills the run.
10. **Percent gauges** for sanity, energy and reputation; money shows a real wallet total.

## Accessibility

Semantic buttons and headings throughout, visible focus rings, `aria-selected`
on the character list, `role="dialog"` with `aria-modal` on the result modal,
`role="meter"` on the stat bars, and full keyboard operability.
`prefers-reduced-motion` disables particles and collapses transitions.

## Known gaps

- The UI is jsdom-verified; a human pass on a real phone is still worthwhile.
- No audio.
