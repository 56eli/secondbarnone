# Portrait art standard, approval gate and visual-QA record

**Active policy — 29 July 2026**

Existing approved portrait art is **not a regeneration backlog**. A portrait may
be replaced only when all of the following are true:

1. A human reviewer records a concrete defect: wrong identity/sex/species,
   broken/corrupt image, watermark/text, or a clearly incompatible art style.
2. The character's `Sex`/identity, species and location are checked in
   `CHARACTER_AND_LOCATION_TEMPLATES.md` before any prompt is written. That
   template is authoritative when prose elsewhere disagrees.
3. The replacement is explicitly listed in a reviewed change request with a
   before/after visual check. A circular crop alone is **not** a defect: avatars
   are round in CSS and older approved art may have a decorative composition.
4. The source master, thumbnail and hi-res tier are reviewed together, then
   `npm test` and `node scripts/check-assets.js` pass.

No batch generation based only on a filename, a generic "frame" heuristic, or
an agent's aesthetic preference is permitted.

## Technical art standard for approved new replacements

Newly approved replacement masters must be clean, square PNGs, ideally
1024px-or-larger. Do not bake a circular/oval frame, border, vignette, text,
watermark or UI into a newly commissioned piece. The game makes inline avatars
round with CSS; the lightbox displays square art.

## Content locks

- **Brian** — retain the approved source and both deployed tiers exactly.
- **Vanna** — retain the owner-supplied canonical close-up rabbit source and
  both deployed tiers exactly.

These are **content locks**, not frame exceptions. Their three SHA-256 hashes
are asserted in `tests/portrait-assets.test.js`. Any approved change requires
an explicit owner review and deliberate hash update.

## Current visual-QA outcome

The complete current portrait sheet was reviewed on 29 July 2026. Apart from
the owner-directed Vanna restoration, no current approved portrait meets the
replacement threshold above. In particular, no images are to be regenerated
merely because they already have art or use a legacy decorative composition.

## Production checklist for a future approved replacement

1. Link the approved defect/change request and read the character template.
2. Write the prompt with the verified sex/identity, species, location and role.
3. Generate one clean square master; visually inspect it against the approved
   source and character brief.
4. Replace only `assets/portraits/<id>.png`, rebuild the two WebP tiers, and
   inspect both at actual UI sizes.
5. Run `npm test`, `npm run typecheck`, and `node scripts/check-assets.js`.
6. Update this record with reviewer, reason and exact affected IDs.
