# Simulator fidelity

**Status:** the mechanical browser/simulator gaps identified in the v2.6 audit
were resolved on 31 July 2026. Percentages remain regression instruments, not
claims about human behavior.

## Shared contracts now implemented

1. **Observable previews.** `docs/js/core/preview.js` is DOM-free and shared by
   UI and simulator. Models receive exact adjusted averages in ordinary
   weather, signed weak/strong bands in rain/snow, and positive location-focus
   icons in fog. Hidden arithmetic is not available to strategy scoring.
2. **Independent randomness.** Event scheduling/selection uses the production
   city-seed stream. Strategy decisions use a separate deterministic stream, so
   an impulsive model choice cannot shift future event timing.
3. **Production seed convention.** Simulator events now start from the city
   seed, matching `app.js`; the former `seed + 7` event offset is gone.
4. **Long-run projects.** Models buy affordable renovations only when House of
   Middleway is present on the actual hub. Reports include mastery rate and
   mean renovations.
5. **Correct death diagnosis.** Energy, sanity and money deaths are reported
   separately. Before this correction every energy death was mislabeled money.
6. **Named behavior matches implementation.** `doesnt_pay_attention` now
   strictly alternates the founding pair instead of randomly choosing between
   them.

## Deliberate limitations

- Utility functions are authored proxies, not observed people.
- Models buy every affordable perk in catalogue order and every affordable
  renovation when available; humans may prioritize differently.
- Models remember visible bands/icons perfectly and calculate a consistent
  utility from them. Human interpretation is noisier.
- Models do not account for portrait/story preference, novelty, role-play, or
  deliberate risk-taking.
- The simulator does not replace browser, mobile, accessibility, or human
  playtesting.

Release notes and CI must label output accordingly. Human playtests remain the
authority on whether the approved difficulty bands feel fair.
