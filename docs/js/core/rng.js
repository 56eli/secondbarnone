/**
 * Seedable random number generator.
 *
 * The game uses this everywhere instead of Math.random() so that tests can
 * run deterministically. Pass a seed for reproducible sequences; omit it for
 * normal play.
 */

/** mulberry32 — small, fast, good enough distribution for a game like this. */
export function createRng(seed) {
  if (seed === undefined || seed === null) {
    // Unseeded path — uses Math.random. Cannot be serialised meaningfully;
    // getState() returns null so callers can detect that.
    const rng = {
      random: () => Math.random(),
      randInt: (min, max) => min + Math.floor(Math.random() * (max - min + 1)),
      randFloat: (min, max) => min + Math.random() * (max - min),
      pick: (arr) => arr[Math.floor(Math.random() * arr.length)],
      getState: () => null,
      setState: () => {},
      isSeeded: false,
    };
    return rng;
  }

  let state = seed >>> 0;
  const initialSeed = state;
  const random = () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    random,
    randInt: (min, max) => min + Math.floor(random() * (max - min + 1)),
    randFloat: (min, max) => min + random() * (max - min),
    pick: (arr) => arr[Math.floor(random() * arr.length)],
    /** Serialise state so saves can restore the exact RNG sequence. */
    getState: () => ({ seed: initialSeed, state }),
    setState: (s) => {
      if (s && Number.isFinite(s.state)) state = s.state >>> 0;
    },
    isSeeded: true,
  };
}

/** Shared default instance used by the running game. */
export const defaultRng = createRng();
