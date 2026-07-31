/**
 * Balance constants.
 *
 * The numbers that decide how the game *feels* live here, on their own, with
 * the reasoning attached. Three things follow from that:
 *
 *   - retuning the game is one small file, not a hunt through five;
 *   - the balance test suite has a single source of truth to assert against;
 *   - `data/` modules can read a tuning number without importing `game-state`,
 *     which would otherwise form an import cycle (game-state already imports
 *     the whole of `data/`).
 *
 * `core/game-state.js` re-exports every one of these, so existing importers
 * keep working and there is exactly one definition of each value.
 *
 * Nothing here is derived from the DOM and nothing here holds state.
 */

// ------------------------------------------------------------- resources

/** Cap for gauge stats (sanity / energy / reputation). Money is uncapped. */
export const MAX_STAT = 100.0;
export const START_SANITY = 50.0;
export const START_MONEY = 50.0;

/**
 * Money is a wallet, not a gauge. It has no ceiling — you can earn past 100 —
 * but still bottoms out at 0 and ends the run. `MONEY_SOFT_CAP` is only used
 * by the HUD bar so a full track still means "comfortable", not "maxed".
 */
export const MONEY_SOFT_CAP = 100.0;
/** Practical upper bound so a corrupted save cannot overflow display maths. */
export const MONEY_HARD_CEILING = 99999.0;

// ---------------------------------------------------------------- energy

export const MAX_ENERGY = 100.0;
export const START_ENERGY = 100.0;

/**
 * How many nights of ordinary sleep take you from empty back to full.
 *
 * This is the anchor of the energy economy, and it is stated as a *duration*
 * rather than a rate on purpose: "a full week of rest still leaves a little
 * room, and the eighth night tops you off" is a rule a player can hold in
 * their head. (Hard-collapse tuning, July 2026: 13 a night — enough to preserve
 * the approved skill gradient now that touching zero ends the run immediately.)
 */
export const ENERGY_FULL_RECOVERY_DAYS = 8;

/**
 * Energy recovered automatically at the start of each new day.
 *
 * Every location's energy cost is priced against this: most working days
 * cost more than one night returns, which is precisely what makes topping up
 * a decision rather than a formality.
 */
export const ENERGY_RECOVERY = 13.0;

/** Below this, actions bite harder (see `GameState.exhaustionPenalty`). */
export const EXHAUSTION_THRESHOLD = 25.0;

/**
 * Sanity lost per day at zero energy.
 *
 * At this rate an ignored energy bar drains a full sanity bar in about eight
 * days: long enough to notice and recover from, short enough to respect. The
 * old value of 6 made exhaustion an inconvenience you could simply pay for,
 * and 10 still let a preview-reading zombie alternate its way out.
 */
export const EXHAUSTION_MAX_PENALTY = 12;

/**
 * Money lost per day at zero energy, on a quadratic curve like the sanity
 * cost: below the effective threshold, being broke follows being drained.
 * Running on empty is expensive — takeaway instead of cooking, cabs instead
 * of walking, tips you were too tired to earn. This is what prices total
 * energy neglect into the wallet economy; players who rest proactively never
 * feel it.
 */
export const EXHAUSTION_MONEY_BURN_MAX = 9;

// ----------------------------------------------------------- reputation

export const MAX_REPUTATION = 100.0;
/** Léon begins with public goodwill; Kaden's day-two smear resets it to 15. */
export const START_REPUTATION = 80.0;
/** Reputation after Kaden's opening smear campaign. */
export const KADEN_SMEAR_REPUTATION = 15.0;
/** The community's full restoration unlocks the enlightenment ending on this day. */
export const ENLIGHTENMENT_GOAL_DAYS = 150;

/** Currency of the perk tree. Uncapped, spent not lost. */
export const START_INSIGHT = 0;

// -------------------------------------------------------------- calendar

/**
 * Soft win: hold the community this many journey days without breaking.
 *
 * Sixty days is a little over two months of in-game calendar. It is long
 * enough for the whole arc to land — rent pressure, Kaden's paperwork, the
 * perk tree, the far locations opening — and short enough that a run has an
 * ending a player will actually reach. It does not stop the run; it
 * acknowledges it, and play continues for anyone who wants to keep going.
 */
export const ENDURANCE_GOAL_DAYS = 60;

/** Base rent deducted every Sunday at the start of a run. */
export const RENT_AMOUNT = 18.0;
/** A long-run sink that stops the early economy becoming permanently safe. */
export const RENT_ESCALATION = 3.0;
export const RENT_ESCALATION_PERIOD_DAYS = 14;
export const RENT_MAX = 48.0;

/** Reputation-based rent discount thresholds. */
export const RENT_DISCOUNT_REP_THRESHOLD = 50;
export const RENT_DISCOUNT_REP_BONUS = 1;
export const RENT_DISCOUNT_REP_HIGH = 80;
export const RENT_DISCOUNT_REP_HIGH_BONUS = 2;

/** Offset so journey day 1 maps to Thursday (Jan 1, 2026). Mon=0 … Sun=6. */
export const START_WEEKDAY_OFFSET = 3;

/**
 * Weekday display names, Monday-first. Lives here (not in game-state.js) so
 * `data/locations.js` can word its weekday-gated unlock reasons without
 * importing game-state and forming a cycle.
 */
export const WEEKDAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];
