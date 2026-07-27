# Long-term development considerations

> **Status note (July 2026):** several items below were completed in the
> v3.0.0 balance-and-cleanup pass — the asset/payload check, the balance
> simulator and the accessibility fixes on the day-result modal. CI is
> written but still needs a one-line manual activation
> (`notes/ci-workflow.yml`). See [HANDOFF.md](HANDOFF.md) for what changed
> and what is still open.

## Next release (quality and safety)

- **[still open]** Do a real-browser pass at 320px, 768px and desktop widths; especially verify map focus order, image loading, modal focus return and touch targets.
- Add a small asset manifest/build check so portrait formats and payload budgets are generated rather than duplicated between code and tests.
- **[still open]** Add save-schema fixtures for every supported version and a visible recovery/export path. Local storage is convenient, but players should not lose a 100-day run when browser storage is cleared.
- **[done, offline]** Balance telemetry now exists as a seeded simulator rather than production instrumentation: `npm run simulate` reports location pick rates, average run length and death cause without shipping any tracking. `tests/balance.test.js` gates it in CI.

## Medium term (depth without clutter)

- Give side-character arcs explicit state beats and a compact “what changed” marker in People. This makes the 51 character-led events easier to follow without adding a journal.
- Add a second ending layer after day 100 based on reputation, relationships and financial stability. Keep the current soft win intact so completion never requires grinding.
- Introduce an accessibility settings panel: text size, high contrast, reduced motion, and a non-colour stat mode. Keep all effects readable in copy, not only through bars or portraits.
- Localize through data files and message keys. Paris should remain the setting, while names, dialogue and location labels should not require French fluency.

## Longer horizon (technical sustainability)

- Consider a lightweight Vite build only if minification, asset hashing or localization makes the no-build workflow insufficient. Preserve the pure core modules and deterministic seeded simulation.
- **[partly done]** Economy invariants, turn-order guards and the weather-stacking contract are now pinned by `tests/balance.test.js`. Property-based and mutation testing around save migration is still open.
- Establish an art direction sheet (portrait lighting, crop, palette and representation checklist) and commission/produce portraits in batches so side characters do not feel visually secondary.
- Keep content data schema-versioned and authoring-friendly; a small validation script should catch duplicate ids, missing hosts, unreachable events and orphaned rewards before review.
