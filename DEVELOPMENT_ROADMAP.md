# Long-term development considerations

## Next release (quality and safety)

- Do a real-browser pass at 320px, 768px and desktop widths; especially verify six-card hub focus order, settings/audio controls, image loading, modal focus return and touch targets.
- Add a small asset manifest/build check so portrait formats and payload budgets are generated rather than duplicated between code and tests.
- Add save-schema fixtures for every supported version and a visible recovery/export path. Local storage is convenient, but players should not lose a 100-day run when browser storage is cleared.
- Track balance telemetry in development builds only: location pick rates, average run length, stat death cause and event exposure. Use it to tune, not to add pressure or tracking to production.

## Medium term (depth without clutter)

- Give side-character arcs explicit state beats and a compact “what changed” marker in People. This makes the 222 side-character events easier to follow without adding a journal.
- Expand the existing day-100 mastery layer with relationship state once character arcs track state explicitly. Keep the current soft win intact so completion never requires grinding.
- Expand the existing settings panel with accessibility options: text size, high contrast, reduced motion, and a non-colour stat mode. Keep all effects readable in copy, not only through bars or portraits.
- Localize through data files and message keys. Paris should remain the setting, while names, dialogue and location labels should not require French fluency.

## Longer horizon (technical sustainability)

- Consider a lightweight Vite build only if minification, asset hashing or localization makes the no-build workflow insufficient. Preserve the pure core modules and deterministic seeded simulation.
- Add property-based and mutation tests around turn order, save migration, weather gates and economy invariants. These are the highest-risk systems as content grows.
- Establish an art direction sheet (portrait lighting, crop, palette and representation checklist) and commission/produce portraits in batches so side characters do not feel visually secondary.
- Keep content data schema-versioned and authoring-friendly; a small validation script should catch duplicate ids, missing hosts, unreachable events and orphaned rewards before review.
