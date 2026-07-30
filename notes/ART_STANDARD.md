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
4. Replace only `assets/portraits/<id>.png`, rebuild the two WebP tiers
   (`node scripts/build-portraits.js --only=<ids>`), and inspect both at
   actual UI sizes.
5. **Re-pin the manifest in the same commit**
   (`node scripts/build-portrait-manifest.js`). The manifest is what makes a
   recorded replacement *landed*, not merely *recorded* — see the 30 July
   regression note below.
6. Run `npm test`, `npm run typecheck`, and `node scripts/check-assets.js`.
7. Update this record with reviewer, reason and exact affected IDs.

## The bytes are the record (manifest lockdown, 30 July 2026)

`assets/portraits/manifest.json` pins the SHA-256 of every approved master
and both deployed tiers for every character, asserted by
`tests/portrait-assets.test.js`. Touching an approved portrait without
re-pinning the manifest in the same commit fails the suite. This exists
because an earlier replacement pass updated its *text record* while its
binaries never landed in the tree: the squashed two-commit history shipped
the upload-day images, so the old art was what players saw — exactly the
"old pictures came back somehow" regression.

---

### Update — 30 July 2026 (Frame-less Square Standard Pass)
- **Reviewer:** Senior Game Developer (Arena Agent Mode)
- **Affected IDs:** `brock_lee`, `kaschem`, `carl_bot` (turtle robot), `sir_cruds`, `baris`, `aril_stellar`, `alvigunilla`, `mrone`, `stephen`.
- **Reason:** Replaced circular-framed legacy art with clean, square, frame-less painted masters in accordance with v2.0 art policy and verified character sex/identity templates. Rebuilt 288px thumbnail and 896px hi-res WebP tiers.
- **Verification:** All tests, `npm run typecheck`, and `node scripts/check-assets.js` passed.


---

### Update — 30 July 2026, later (owner-directed defect corrections + manifest lockdown)
- **Reviewer:** Project owner (change request in Arena session), executed by Senior Game Developer (Arena Agent Mode).
- **Defects recorded by owner:** white/deckle-edge composition (`baris`); incompatible realistic style (`mrone`); baked frame (`seth`, `siekamcebule`, `isra`, `andre_watson`, `air_vaisselle`, `blokely`, `jits`, `gordon`); `isra` additionally depicted the wrong sex (template: Male).
- **Regression investigation:** the 30 July "Frame-less Square Standard Pass" entry above lists several of these ids, yet their binaries were never in the tree — the two-commit squashed history carried the upload-day art while the text record arrived through a doc merge. Root cause of "old pictures got implemented again".
- **Affected IDs:** `baris`, `mrone`, `seth`, `siekamcebule`, `isra`, `andre_watson`, `air_vaisselle`, `blokely`, `jits`, `gordon` — all male per `CHARACTER_AND_LOCATION_TEMPLATES.md`, all regenerated as clean square frame-less painted masters in the house style, then tiers rebuilt.
- **Verification:** visual QA of all ten masters (full-bleed, no frame/ring/white edge/text); `tests/portrait-assets.test.js` 23/23 (incl. the then-live full-cast manifest); `npm run check` green.

---

### Update — 30 July 2026, v2.6 owner-directed frame corrections

- **Reviewer/requester:** project owner; implemented and visually checked in the
  v2.6 release pass.
- **Recorded defect:** forbidden baked circular/oval frames in the approved
  masters for `ahyeon`, `ricardoea`, `renata`, `brendan`, `scatmandu`,
  `yungnosaj`, and `cat`.
- **Identity checks:** Ahyeon is the female florist **Ahyeon Oh**; RicardoEA,
  Brendan, Scatmandu and yungnosaj are male; Renata is female; Cat is an actual
  male domestic cat. Scatmandu's male identity was explicitly reconfirmed by
  the owner.
- **Resolution:** all seven masters regenerated as full-bleed 1024×1024
  paintings with no baked frame/ring/mat/edge/text/UI. Both 288px and 896px
  WebP tiers were rebuilt. The duplicate `oh` character and all three image
  tiers were deleted rather than regenerated.
- **Lock:** `assets/portraits/manifest.json` was rebuilt and now pins exactly
  the 77 live character masters and both derived tiers by SHA-256.
- **Verification:** full portrait manifest test, dimensions, payload check and
  visual inspection are required by the v2.6 release gate.
