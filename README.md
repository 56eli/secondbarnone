# secondbarnone

A small narrative balance game. You play Léon, who runs a spiritual community by
day and tends bar by night. Every day you pick one. The community restores your
sanity but costs money; the bar pays but grinds you down. Rent hits every Sunday.
Let either stat reach zero and the run ends.

**Play:** https://56eli.github.io/secondbarnone/

For design details and internals, see [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md).

---

## Branches

| Branch | What it is |
|---|---|
| **`main`** | The HTML/CSS/JS game. Deployed to GitHub Pages from `/docs`. |
| **`godot`** | The original Godot 4.7 project, preserved verbatim. Not deployed. |

The two are separate implementations, not versions to reconcile. **Never merge
`godot` into `main`** — it would restore a 39.5 MB `docs/` and clobber the web
build.

## Why this is plain HTML/CSS/JS

Shipping a Godot web build requires running the Godot binary to compile a `.pck`
archive. That binary isn't reachable from an agent sandbox, so the game couldn't
be built or deployed automatically — and an attempt to hand-assemble a `.pck`
produced a corrupt, unplayable file.

Rewritten as vanilla ES modules, the source **is** the build:

| | Godot version | This version |
|---|---|---|
| Deploy payload | 39.5 MB | **~940 KB** (40× smaller) |
| Build step | Godot binary + export templates | none |
| Automated tests | 0 | **107** |
| Coverage | — | **~99%** |

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
npm test                # 107 tests
npm run coverage        # with a coverage table
npm run coverage:check  # enforce the 80% floor, non-zero exit if below
npm run check           # tests + asset integrity
```

Three layers:

- **`tests/game.test.js`** — 50 rule tests, no DOM. Calendar maths including leap
  years, stat clamping, Sunday rent charged exactly once, the burnout threshold,
  the 2–5 day event schedule, weighted rarity, game-over conditions, and 25
  seeded 300-turn playthroughs asserting state never goes invalid.
- **`tests/dom.test.js`** — 23 tests that boot the real `index.html` in jsdom,
  call the real `initGame()`, and drive the UI by clicking actual buttons:
  navigation, the result modal, stat rendering, double-click protection, the
  portrait fallback, reduced-motion, game over and restart.
- **`tests/coverage.test.js`** — 34 edge-case tests: the unseeded RNG branch,
  signal unsubscribe, and defensive paths normal play never reaches.

Current coverage — `npm run coverage`:

```
all files    99.94 line | 96.32 branch | 99.02 funcs
```

Randomness goes through a seedable RNG (`docs/js/core/rng.js`), so tests are
deterministic while normal play stays random.

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
    main.js                entry point (three lines)
    app.js                 wiring: HUD, screens, modal, game over
    core/
      game-state.js        stats, calendar, history, mood/season
      event-manager.js     scheduling, weighted selection
      turn.js              one turn, resolved in order
      rng.js               seedable RNG
    data/
      characters.js        78 characters
      events.js            29 events
    ui/screens.js          hub, location, characters, modal, game over
  assets/                  optimised WebP + SVG (~940 KB)

assets/                    full-resolution source art (~26 MB, not deployed)
scripts/                   dev tooling + legacy Godot .gd sources
tests/
```

`docs/js/core/` and `docs/js/data/` have no DOM references, which is what makes
the rules testable in isolation.

## Cast

78 characters. Léon is the protagonist; **Kaden** is the arch nemesis (a
developer circling the community's land); **Sato** and **Alex** are rivals who
run a competing wellness studio and cocktail bar. The remaining 74 are side
characters drawn from the community, the bar, and the neighbourhood.

The character screen groups them by role — antagonists first — and has a search
box that filters on name, role, location or biography text.

Character ids are ASCII slugs derived from display names, so portraits map onto
filenames safely even for names written in Cyrillic, fraktur, Hangul or emoji
(`𝕽𝖆𝖚𝖑` → `raul.svg`, `Kopung (고풍)` → `kopung.svg`). Display names keep their
original spelling everywhere in the UI.

## Assets

Source art in `assets/` is ~26 MB of 1024×1024 PNGs — far more than the game
displays. One command regenerates avatars, downscales the painted portraits,
converts to WebP and prunes orphans:

```bash
npm run assets      # ~26 MB → ~940 KB, needs ImageMagick
```

Portraits go to 512px (they render at ~84px, so this covers retina), backgrounds
to 1000px wide.

**Eleven characters have painted portraits** (Léon, the six community and bar
regulars, plus Kaden, Sato and Alex). The other 67 get deterministic SVG avatars
from `scripts/generate-avatars.js` — the same id always produces the same face,
so diffs stay clean, and each file is under 1 KB. Bots render as machines and
Cat renders as a cat. Portraits fall back to an initials chip if a file is ever
missing.

## Deploying

GitHub Pages serves `main` → `/docs`. Any push to `main` that touches `docs/`
goes live in about a minute:

```bash
npm run check && git add -A && git commit -m "..." && git push origin main
```

No settings to change, no export step.

## Game rules

- Start at 50 sanity / 50 money, capped at 100, on Thursday 1 January 2026.
- Spiritual Community: **+15 sanity, −10 money**.
- The Bar: **+12 money, −12 sanity**.
- Rent: **−18 money** every Sunday, charged once.
- A random event fires every 2–5 days, drawn from the pool for the location you
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
- The three antagonists have profiles but no dedicated events yet.
