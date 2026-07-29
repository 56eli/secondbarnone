# Art status report — portraits & locations

The canonical "what art is missing or wants redoing" list for **secondbarnone**.
Update it whenever art is added, replaced or found wanting.

**Status as of the July 2026 image pass: nothing is missing.**
All **78 characters** have painted WebP portraits and all **22 locations** have
painted WebP backgrounds. There are no procedural SVG placeholders left in the
deployed payload, and `tests/portrait-assets.test.js` fails the build if one
reappears.

---

## ✍️ Wanted: new / improved art

Two lists for art that *exists* but should be replaced — deliberately left
empty for a human to fill in. Add a row, run the workflow at the bottom, tick
it off.

### Characters wanting a better portrait

| Id | Character | What's wrong with the current portrait | Priority |
|---|---|---|---|
| _(empty — add rows here)_ | | | |

### Locations wanting a better background

| Id | Location | What's wrong with the current background | Priority |
|---|---|---|---|
| _(empty — add rows here)_ | | | |

---

## 👥 Portrait coverage

| | Count |
|---|---|
| Total cast | **78** |
| Painted WebP portraits | **78** (100%) |
| Procedural SVG placeholders | **0** |

### Painted this pass — the last 10 placeholders (pre-v2.0)

The ten characters below were the entire remaining backlog at the time.
**Note:** As of the v2.0 standardization (2026-07-29), the house style changed:
new and regenerated portraits are **clean square** (no baked frame).
Previews are round via CSS only. The lightbox shows clean square art.

The descriptions below reflect the style at the time they were added. All
future generations follow the frame-less square standard (see
`ART_STANDARDIZATION_SPEC.md` and `PORTRAIT_REFERENCE.md`).

| Id | Character | Portrait reads as |
|---|---|---|
| `air_vaisselle` | Air-Vaisselle | Blissed-out dishwasher, headphones, steaming sink |
| `blokely` | blokely | Bricklayer-sculptor at his salvaged-material garden wall |
| `jits` | Jits | Jiu-jitsu instructor sitting easy in a worn gi |
| `jared` | Jared | Sound engineer mid-adjustment at a small mixing desk |
| `orshi` | Orshi | Poetry translator with her drafts, after midnight |
| `brendan` | Brendan | Schoolteacher marking papers in the quiet corner |
| `hazel` | Hazel | Herbalist inspecting a jar, apothecary shelves behind |
| `yungnosaj` | yungnosaj | Producer field-recording the rain |
| `carl_bot` | Carl-bot | Tablet-on-a-stand with a warm smiling screen |
| `docbot` | DocBot | First-aid kiosk with a politely concerned face |

**On the two bots.** They were previously excluded as "intentionally
stylised machines". They now get painted *object* portraits in the same
circular vignette style — still unmistakably machines, but no longer visibly
cheaper than everyone else in the People list. This was the right call once
every human had art: they were the only remaining visual outliers.

### Repainted — the four off-style portraits

Coverage was complete, but four portraits were not in the house style at all.
Three (`kaj`, `arian`, `dorian`) were **pixel-art sprites** and one
(`lakshay`) was **flat cartoon vector carrying a visible stock watermark** —
they read as four different games sitting next to each other in the People
list. Each was repainted as a warm semi-realistic oil painting in the same
circular distressed-frame vignette as the rest of the cast, and each now
carries the character trait its profile is built on.

| Id | Character | Was | Now reads as |
|---|---|---|---|
| `kaj` | Kaj | Pixel-art sprite, flat grey backdrop | Reader absorbed in a book by lamplight, towers of finished books fencing the cushion in |
| `lakshay` | Lakshay | Cartoon vector, stock watermark | Delighted sysadmin at his cellar server rack, LEDs and a singing bowl under the vaulted ceiling |
| `arian` | Arian | Pixel-art sprite in a stone-wall frame | Storyteller mid-toast in the bar gloom, warm grin over tired eyes, shapes watching from the dark |
| `dorian` | Dorian | Pixel-art sprite, generic dark study | Very old man immovable in a red leather armchair, contentedly declining everything |

The watermark is worth calling out on its own: `lakshay.webp` shipped a
third-party stock overlay into the deployed payload. It is gone.

---

## 🗺️ Location backgrounds

All 22 locations have a deployed 1000px WebP background.

### Repainted — House of Middleway, sunny pass

Brian's chapel first shipped as a dusk scene: storm-grey cloud, bare autumn
trees, a small dark barn set back and to one side of the frame. It read as a
horror-film cold open, which is the opposite of what the location is for —
Brian's whole problem is that he is *too* warm, too welcoming, grinning a
little too long. The art has to carry the holy, sunlit tone so the unease
comes from him and not from the weather.

| | Was | Now |
|---|---|---|
| Light | Dusk under storm cloud, ~0.18 mean luminance | Late-morning sun, godrays through the canopy, ~0.44 |
| Composition | Chapel small and off-centre | Converted barn chapel dead centre, doors open, path leading in |
| Season | Bare autumn branches, mud | Green summer canopy, wildflower meadow |
| Read | Ominous, abandoned | Radiant, tended, expecting you |

Two tests guard it: mean luminance must exceed 0.35 *and* be the highest of
any deployed background, and the same figure pushed back through the
`.location` scrim must still be dark enough for white text. Brightening a
background is exactly the change that quietly breaks legibility, and jsdom
cannot see it.

### Repainted this pass — Paris coherence

The game is set in Paris, but six backgrounds had drifted somewhere else
entirely. These were regenerated to match the setting:

| Location | Was | Now |
|---|---|---|
| Night Market | Red paper lanterns, East Asian night market | Le Marais street market, awnings and bulb lights on wet cobbles |
| Fontainebleau Retreat | Snow-capped alpine mountains and a pagoda-ish cabin | Fontainebleau forest — sandstone boulders, beech trees, a slate-roofed cottage |
| Saint-Denis Basilica Crypt | Outdoor hilltop ruin at sunset | Actual Gothic crypt interior — vaulted stone, tomb effigies, candlelight |
| Saturday Market | Generic sunny market with English signage | Canal-side Parisian market under overcast winter light |
| Sato's Studio | Bright airy daylit yoga room, off-palette | Cold, expensive Saint-Germain studio at dusk, boulevard outside |
| Radio Station | Cluttered bedroom with legible English signage | Parisian attic pirate station, zinc rooftops through the dormer |

### Repainted — Paris coherence, second pass

The first coherence pass fixed the six most obviously misplaced scenes but
stopped there. Five more were still set somewhere other than Paris, and two of
them (`free_clinic`, `home_loft`) had no committed PNG master at all, so
`npm run assets` could not even rebuild them.

| Location | Was | Now |
|---|---|---|
| Community Clinic | English-language posters, non-Paris street outside | Worn clinic room, tall French windows onto a Haussmann facade and a green Paris bench |
| Community Garden | Red-brick tenements with fire escapes — New York | Raised beds in a Paris courtyard ringed by limestone, wrought iron and zinc mansards |
| Rooftop | Generic North American downtown of glass towers | Zinc roofs and chimney pots to the horizon, the Eiffel Tower small and lit |
| Agence du Quartier | British suburban terraced houses through the window | Tired letting agency on a wet Paris street, plane tree and Haussmann block opposite |
| Home Loft | Anonymous high-rise skyline | Chambre de bonne under the eaves, dormer window onto wet Paris rooftops |

All five now carry a full-resolution PNG master in `assets/backgrounds/`, and
two tests pin the change: the retired art is blocked by content hash, and the
masters are asserted to exist so the WebPs stay rebuildable.

### Retired backgrounds

Four pre-Paris scenes (`bar`, `spiritual_community`, `public_library`,
`river_walk`) were superseded by their `paris_*` replacements but kept
reappearing in the deployed payload, because `optimize-assets.sh` rebuilt
every PNG it found instead of only the ones the catalogue references. The
script is now catalogue-driven and a test asserts they stay gone.

### Hub background — placeholder retired

The hub screen was painted with `hub_background.svg`: a 900-byte file of five
blurred coloured circles. It is now a real painting — a Paris street corner at
blue hour with the bar on one side and the community room on the other, which
is the entire premise of the game in one image. Deliberately dark and
low-contrast in the centre so the hub's text and buttons stay readable.

---

## 🧱 How portrait art is built

Portraits ship in **two tiers**, both generated by
`scripts/build-portraits.js`:

| Tier | Path | Size | Used by |
|---|---|---|---|
| Thumbnail | `docs/assets/portraits/<id>.webp` | 288px | Every inline avatar (HUD, People, host banners, event cards) |
| Hi-res | `docs/assets/portraits/hi/<id>.webp` | 896px | The tap-to-enlarge lightbox only, fetched on demand |

The largest avatar the game renders inline is 84 CSS px, so the old 512px
sheets were ~6x oversized on every page load; the lightbox, meanwhile, renders
up to 560 CSS px and wanted *more* than 512px. Splitting the tiers cut the
eager payload from ~4.85 MB to **~2.93 MB** while making the enlarged view
genuinely sharp.

### Adding or replacing a portrait

1. Paint or generate a square source image (1024px+) in the house style:
   warm semi-realistic digital painting, chest-up, circular vignette implied
   by a distressed cream-painted border, a background detail that signals the
   character's role. No text anywhere in the image.
2. Save it as `assets/portraits/<id>.png` (or `.webp`).
3. Run `node scripts/build-portraits.js --only=<id>` — this emits both tiers.
   Omit `--only` to rebuild everything and prune orphans.
4. Run `npm run check` (tests + `scripts/check-assets.js`).
5. Update the tables above.

`build-portraits.js` picks the **largest** available source rather than the
first matching format, and never upscales, so a low-resolution legacy file can
never masquerade as a hi-res sheet.

### Adding or replacing a background

1. Save a ~1500px wide landscape source to `assets/backgrounds/<name>.png`.
2. `convert assets/backgrounds/<name>.png -resize 1000x\> -quality 80 \
   -define webp:method=6 docs/assets/backgrounds/<name>.webp`
3. Reference it from the location's `bg` field in `docs/js/data/locations.js`.
4. Run `npm run check`. Unreferenced backgrounds fail the asset test, so
   retiring an image means deleting the file too.

Keep backgrounds dark and low-contrast — they sit behind a scrim and UI text
has to stay legible over them.

---

## 💾 Payload budget

`scripts/check-assets.js` budgets the two tiers separately, because a player
only pays for one of them up front:

| | Size | Limit |
|---|---|---|
| Eager (HTML/CSS/JS + thumbnails + backgrounds) | ~2.93 MB | 4 MB |
| Lightbox tier (on demand, ~80 KB per portrait opened) | ~4.36 MB | — |
| Total on disk | ~7.29 MB | 8 MB |

Nobody downloads all 78 hi-res sheets; opening a portrait costs one of them.
