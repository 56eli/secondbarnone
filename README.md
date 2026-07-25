# Balance of Spirit

A small narrative balance game. You play Léon, who runs a spiritual community by
day and tends bar by night. Every day you pick one. The community restores your
sanity but costs money; the bar pays but grinds you down. Rent hits every Sunday.
Let either stat reach zero and the run ends.

**Play:** https://56eli.github.io/secondbarnone/

---

## Why this is plain HTML/CSS/JS

This started as a Godot 4.7 project. Godot is a great engine, but shipping it
requires a step no coding agent can do in a sandbox: running the Godot binary to
compile a `.pck` archive. Release binaries aren't downloadable from the agent
environment, so an agent could edit `.gd` files forever and never produce a build
anyone could play. An earlier attempt to hand-assemble a `.pck` shipped a
corrupt, unplayable file.

Rewritten as vanilla ES modules, the source **is** the build:

| | Godot version | This version |
|---|---|---|
| Deploy payload | 39.5 MB | **564 KB** (70× smaller) |
| Build step | Godot binary + export templates | none |
| Agent can build & test it | no | yes |
| Automated tests | none | 56 |
| Time to first frame | multi-MB WASM boot | near-instant |

The original Godot sources are still in `scripts/`, `scenes/` and
`project.godot` for reference. They are no longer what gets deployed.

## Running locally

No dependencies and no build:

```bash
npm run serve       # → http://localhost:8000
```

Any static server works — `python3 -m http.server -d docs` is equivalent. The
game must be served over HTTP rather than opened as a `file://` URL, because ES
modules are subject to CORS.

## Tests

```bash
npm test            # 56 tests
```

Two layers:

- **`tests/game.test.js`** — 45 rule tests with no DOM. Calendar maths including
  leap years, stat clamping, Sunday rent charged exactly once, the burnout
  threshold, the 2-5 day event schedule, weighted rarity, game-over conditions,
  and 25 seeded 300-turn playthroughs asserting state never goes invalid.
- **`tests/dom.test.js`** — 11 tests that boot the real `index.html` in jsdom,
  load the real `main.js`, and drive the UI by clicking actual buttons: screen
  navigation, the result modal, stat rendering, double-click protection, game
  over, and restart.

Randomness goes through a seedable RNG (`docs/js/core/rng.js`), so tests are
deterministic while normal play stays random.

`tests/dom.test.js` needs jsdom. It's optional — without it those tests skip
rather than fail:

```bash
npm install --no-save jsdom
```

Asset integrity is checked separately, which catches a broken portrait path
before it ships as a missing image:

```bash
node scripts/check-assets.js
```

## Project layout

```
docs/                      ← deployed by GitHub Pages (main /docs)
  index.html
  css/style.css
  js/
    main.js                entry point: HUD, screen switching, modal
    core/
      game-state.js        stats, calendar, history, mood/season
      event-manager.js     scheduling, weighted selection
      turn.js              one turn, resolved in order
      rng.js               seedable RNG
    data/
      characters.js        14 characters
      events.js            29 events
    ui/screens.js          hub, location, characters, modal, game over
  assets/                  optimised WebP + SVG (484 KB)

assets/                    full-resolution source art (19 MB, not deployed)
scripts/                   dev tooling + legacy Godot .gd sources
tests/
```

`docs/js/core/` has no DOM references at all, which is what makes the rules
testable in isolation.

## Assets

The source art in `assets/` is 19 MB of 1024×1024 PNGs — far more than the game
displays. `scripts/optimize-assets.sh` downscales and converts to WebP:

```bash
./scripts/optimize-assets.sh     # 19 MB → 484 KB, needs ImageMagick
```

Portraits go to 512px (they render at ~84px, so this covers retina), backgrounds
to 1000px wide. Six characters use small hand-written SVGs, copied verbatim.
Portraits fall back to an initials chip if a file is ever missing.

## Deploying

GitHub Pages already serves `main` → `/docs`. Any push to `main` that touches
`docs/` goes live in about a minute:

```bash
npm test && git add -A && git commit -m "..." && git push origin main
```

No settings to change, no export step.

## Game rules

- Start at 50 sanity / 50 money, capped at 100, on Thursday 1 January 2026.
- Spiritual Community: **+15 sanity, −10 money**.
- The Bar: **+12 money, −12 sanity**.
- Rent: **−18 money** every Sunday, charged once.
- A random event fires every 2-5 days, drawn from the pool for the location you
  chose. Weights are 10 for Common and 2 for each Rare, so roughly one event in
  six is rare.
- Burnout unlocks only after 3 consecutive bar days.
- The same event never fires twice in a row.
- Reaching 0 in either stat ends the run.

## Accessibility

Semantic buttons and headings throughout, visible focus rings, `aria-selected`
on the character list, `role="dialog"` with `aria-modal` on the result modal,
and full keyboard operability. `prefers-reduced-motion` disables particles and
collapses transitions.

## Known gaps

- The UI was verified with jsdom, not a real browser — Chromium couldn't be
  downloaded in the environment this was built in. Layout and animation should
  get a human eye on a real device.
- No save/resume; a refresh restarts the run. `localStorage` persistence would
  be a natural next step.
- No audio.
