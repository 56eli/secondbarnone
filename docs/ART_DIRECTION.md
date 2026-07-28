# Art direction

The single page of standards that keeps art commissioned at different times —
by different hands, models and moods — looking like one game. If you are
making or repainting an asset, read this first. `docs/side_characters_report.md`
tracks *which* assets want work; this file defines *what good looks like*.

This standard was written in July 2026 (v2.6) after the game had shipped four
portrait batches whose inconsistency forced repaints. The goal is not a style
prison — it is a small number of load-bearing decisions, stated once.

---

## Portraits

**The one-sentence style:** a warm semi-realistic digital painting, chest-up,
reading clearly as a character at 42 px and still rewarding a full-screen look.

Load-bearing decisions:

| Decision | Standard |
| --- | --- |
| Frame | Chest-up (head, shoulders, top of torso), face occupying roughly the central 40–50% of the image |
| Border & vignette | Soft circular vignette with a distressed cream-painted border — the style established by the July 2026 cast pass |
| Background | Muted, warm neutral (stone, plaster, warm grey-olive) with **at most one** quiet detail that signals who the person is (tool, plant, colour accent). Icons-as-props, never scenes |
| Light | Soft, warm key light from one side; gentle shadows. No hard flash, no moody underlight |
| Palette | Warm and slightly desaturated; skin tones natural; one accent colour maximum |
| Finish | Painterly brushwork, not photographic. Calm, kind expression by default — this game's people are glad you came |
| Consistency forbiddens | No text, borders of other colours, heavy halos or divine glows (the lesson of the original Brian repaint), no frames-within-frames, no photographic backgrounds |

**Crop safety:** the largest inline avatar is a ~84 px circle and the lightbox
renders a square. Keep eyes inside the central square and nothing crucial in
the corners.

**Technical masters:** painted source at ≥1024×1024 PNG in
`assets/portraits/<id>.png`; `node scripts/build-portraits.js --only <id>`
derives the deploy tiers (288 px thumb, hi-res sheet for the lightbox). Never
edit the deploy WebP directly — it is a build product.

## Backgrounds

**The one-sentence style:** a warm, lived-in Paris in daylight, painterly,
with weather the almanac can believably sit on top of.

| Decision | Standard |
| --- | --- |
| Aspect & size | 1000×667 (3:2), painted landscape. UI text overlays the lower half, so keep the drama in the upper half and the foreground quiet |
| Time of day | Daylight. Late-morning or golden-hour warmth. (The pre-Paris dark set was relit for a reason: this is a game about ordinary days, not noir) |
| Palette | Same warm, slightly desaturated family as the portraits — the location cards show portrait and background together |
| Detail density | Real, but composed. One or two storytelling props that say whose place this is (Brian's sign, Kopung's kiln, Lakshay's singing bowl on the archive racks) rather than tourist clutter |
| Paris, specifically | Haussmann rooflines, cream stone, zinc mansards. Districts should be distinguishable: canal green vs. Marais stone vs. Belleville brick vs. the Edges' open sky |
| The one exception | **Les Mines de la Butte is underground and stays dark.** Its galleries are lit only by the working lamps — warm amber pools on cream gypsum, deep umber shadow. It is the single non-daylight scene, because the fiction (a walking circuit in the dark) demands it; it is not a licence to relight anything else dark |
| Consistency forbiddens | No text or signage legible enough to read (except established diegetic signage like LE DERNIER VERRE), no crowds — the cast lives in the portraits, the places stay calm enough to think in |

**Technical masters:** PNG master in `assets/backgrounds/<id>.png`; the deploy
WebP in `docs/assets/backgrounds/<id>.webp` is derived at 1000×667, quality
~80 (`scripts/optimize-assets.sh`). Background +3 portraits for a new location
costs roughly 135 KB of the 4 MB eager budget — `node scripts/validate-content.js`
prints the live projection.

## Representation checklist

The cast of secondbarnone is deliberately a whole neighbourhood, and the art
should keep it that way. Before a batch ships:

- [ ] Ages vary — the game has elders; do not smooth everyone into one
      Instagram age band
- [ ] Body types vary
- [ ] Skin tones vary and stay true to the written bios
- [ ] Gender presentation as written in the bio
- [ ] Nobody becomes glamorous by accident — plain people stay plain, warm,
      and specific
- [ ] Cultural signifiers in the bios are respected, not genericised

## When replacing art

1. Update or add a row in `docs/side_characters_report.md`.
2. Produce the master under `assets/` per the tables above.
3. `npm run assets` (or `build-portraits.js --only`) to derive deploy tiers.
4. `node scripts/check-assets.js && npm run test:assets`.
