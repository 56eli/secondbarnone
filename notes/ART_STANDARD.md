# Portrait art standard and frame-removal backlog

**Active policy — 29 July 2026**

All newly generated or regenerated portraits must be clean, square 1024px-or-larger PNG masters. Do **not** bake a circular or oval frame, cream ring, border, vignette, torn-paper edge, text, watermark or UI into the artwork. The game makes inline avatars round with CSS; the lightbox deliberately presents the clean square art.

## Frozen exceptions

- **Brian**: preserve the current portrait exactly. Never regenerate or reframe it.
- **Vanna**: preserve the canonical close-up rabbit portrait exactly. It is already a clean square image; do not regenerate it. Its source and deployed tiers are locked by SHA-256 tests.

All portraits except Brian follow the frame-less standard. Brian is the only framed exception.

## Regenerated frame-removal batch — current pass

The following visually-audited, circular-framed portraits were replaced with clean square masters and both deployed WebP tiers were rebuilt:

`cary`, `crveni`, `daniela`, `diamndsdancin`, `docbot`, `fraghis`, `friend`, `hanans`, `hazel`, `iulian`, `ahyeon`, `air_vaisselle`, `alvigunilla`, `andre_watson`, `aril_stellar`, `baris`, `blokely`, `brendan`, `carl_bot`.

The batch was selected from visibly framed portraits with clear character/location briefs, not randomly. Non-human requirements were preserved: DocBot is an unmistakably mechanical clinic kiosk.

## Next visual-QA queue

Continue in reviewed batches after an image-by-image check:

`cat`, `geo`, `gordon`, `jared`, `jits`, `kaschem`, `mrone`, `oh`, `qustoge`, `renata`, `raul`, `scatmandu`, `seth`, `siekamcebule`, `sir_cruds`, `susan`, `yungnosaj`.

## Character constraints

- **groovyphoenix is she/her**, a glowing firebird—not a human woman or generic bird.
- HawkinsTV, Carl-bot and DocBot remain mechanical objects with expressive screens.
- Cat remains an actual cat.
- Check `CHARACTER_AND_LOCATION_TEMPLATES.md` and the location binding before generation.

## Production checklist

1. Read the character profile and location in `docs/js/data/characters.js`.
2. Generate a clean square master without a baked frame.
3. Visually inspect for borders, text and watermarks.
4. Replace only `assets/portraits/<id>.png`.
5. Run `node scripts/build-portraits.js --only=<id>`.
6. Run `npm test` and `node scripts/check-assets.js`.
7. Update this file and the character template.
