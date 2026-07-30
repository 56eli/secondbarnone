# Simulator fidelity — pending

**Status:** explicitly pending after the v2.6 release pass. The simulator is a
valuable deterministic regression instrument, but its percentages are not
claims about human players.

The browser/simulator turn lifecycle now agrees for ordinary and three-day
locations. These remaining fidelity gaps are intentionally **not** presented as
fixed:

1. Player models score exact average deltas during fog, rain and snow. The UI
   shows only focus icons in fog and +/- bands in rain/snow.
2. Strategy-choice randomness and event selection currently consume the same
   simulator RNG stream; production player decisions consume no RNG.
3. Production seeds event RNG directly from the city seed, while the simulator
   uses an offset stream (`seed + 7`).
4. Long-horizon models auto-buy perks but do not fund the four renovations.
5. Utility functions are authored proxies, not observed human behavior.

Until a DOM-free observable-preview model and independent decision RNG exist,
release notes must label balance output as a regression contract. Human
playtests remain the authority on felt difficulty.
