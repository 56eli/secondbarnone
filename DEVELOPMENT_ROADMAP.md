# Historical record (superseded)

> **Frozen context — do not cite for current facts.** The counts, balances,
> and recommendations in this document describe an earlier revision.
> Authoritative sources as of 30 July 2026: `README.md`,
> `PROJECT_OVERVIEW.md`, `CHANGELOG.md`, and `AUDIT_2026-07-30.md`
> (current audit and prioritized action plan). Kept for context only.

---

# Long-term development considerations

## Next release (quality and safety)

- Do a real-browser pass at 320px, 768px and desktop widths; especially verify map focus order, image loading, modal focus return and touch targets.
- Add a small asset manifest/build check so portrait formats and payload budgets are generated rather than duplicated between code and tests.
- Add save-schema fixtures for every supported version and a visible recovery/export path. Local storage is convenient, but players should not lose a 100-day run when browser storage is cleared.
- Track balance telemetry in development builds only: location pick rates, average run length, stat death cause and event exposure. Use it to tune, not to add pressure or tracking to production.

## Medium term (depth without clutter)

- Give side-character arcs explicit state beats and a compact “what changed” marker in People. This makes the 51 character-led events easier to follow without adding a journal.
- Add a second ending layer after day 100 based on reputation, relationships and financial stability. Keep the current soft win intact so completion never requires grinding.
- Introduce an accessibility settings panel: text size, high contrast, reduced motion, and a non-colour stat mode. Keep all effects readable in copy, not only through bars or portraits.
- Localize through data files and message keys. Paris should remain the setting, while names, dialogue and location labels should not require French fluency.

## Longer horizon (technical sustainability)

- Consider a lightweight Vite build only if minification, asset hashing or localization makes the no-build workflow insufficient. Preserve the pure core modules and deterministic seeded simulation.
- Add property-based and mutation tests around turn order, save migration, weather gates and economy invariants. These are the highest-risk systems as content grows.
- Establish an art direction sheet (portrait lighting, crop, palette and representation checklist) and commission/produce portraits in batches so side characters do not feel visually secondary.
- Keep content data schema-versioned and authoring-friendly; a small validation script should catch duplicate ids, missing hosts, unreachable events and orphaned rewards before review.

## Long-term asset goal (characters & locations)

The long-term goal for the project's cast and locations is to bring every
entry to a fully custom, human-authored state. Progress is tracked in
[CHARACTER_AND_LOCATION_TEMPLATES.md](CHARACTER_AND_LOCATION_TEMPLATES.md),
which lists every character and location with their current asset provenance.

The target state for each character is:

- **Sex** — known (Male / Female / Other), not "unknown"
- **Image** — custom (hand-painted or commissioned), not AI-generated
- **Profile** — custom (written by a human author), not AI-generated
- **Events** — custom (authored dialogue and scenarios), not AI-generated

The target state for each location is:

- **Image** — custom, not AI-generated
- **Description** — custom, not AI-generated
- **Location reference** — verified against the real setting

Currently 1 of 78 characters has a custom image (Brian). All other fields
across the entire cast and location catalogue remain in the AI-generated or
unknown state. Moving entries to custom is a deliberate, ongoing effort —
the template file should be updated whenever an asset is replaced.

- **Portrait generation:** the standard prompt template for regenerating
  portraits lives at [notes/ART_STANDARD.md](notes/ART_STANDARD.md).
  Edit it freely — it is the single source of truth for the house style and
  should be used for all bulk regenerations.
- **Sex/portrait mismatches:** a live list of characters whose current portrait
  does not match their recorded sex is tracked in
  [CHARACTER_AND_LOCATION_TEMPLATES.md](CHARACTER_AND_LOCATION_TEMPLATES.md)
  under "Sex/portrait mismatches". Regenerate these using the reference above.
