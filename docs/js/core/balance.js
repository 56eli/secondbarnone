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

/** Legacy two-stat constants, kept because the parity tests read them. */
export const SANITY_GAIN = 15.0;
export const SANITY_LOSS = 12.0;
export const MONEY_GAIN = 12.0;
export const MONEY_LOSS = 10.0;

// ---------------------------------------------------------------- energy

export const MAX_ENERGY = 100.0;
export const START_ENERGY = 100.0;

/**
 * How many nights of ordinary sleep take you from empty back to full.
 *
 * This is the anchor of the energy economy, and it is stated as a *duration*
 * rather than a rate on purpose: "a week of rest puts you right" is a rule a
 * player can hold in their head, and every other energy number is derived
 * from it.
 */
export const ENERGY_FULL_RECOVERY_DAYS = 7;

/**
 * Energy recovered automatically at the start of each new day.
 *
 * Derived so that `ENERGY_FULL_RECOVERY_DAYS` nights carry you from 0 to
 * `MAX_ENERGY` exactly. Every location's energy cost is priced against this:
 * most working days cost more than one night returns, which is precisely what
 * makes topping up a decision rather than a formality.
 */
export const ENERGY_RECOVERY = MAX_ENERGY / ENERGY_FULL_RECOVERY_DAYS;

/** Below this, actions bite harder (see `GameState.exhaustionPenalty`). */
export const EXHAUSTION_THRESHOLD = 25.0;

/**
 * Sanity lost per day at zero energy.
 *
 * At this rate an ignored energy bar drains a full sanity bar in ten days:
 * long enough to notice and recover from, short enough to respect. The old
 * value of 6 made exhaustion an inconvenience you could simply pay for.
 */
export const EXHAUSTION_MAX_PENALTY = 10;

// ----------------------------------------------------------- reputation

export const MAX_REPUTATION = 100.0;
export const START_REPUTATION = 10.0;

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

/**
 * Visiting the founding community earns a small buffer against future event
 * losses. It protects only against random-event damage, not rent or bad daily
 * choices, so it makes the community feel like a support network without
 * turning it into a heal-all.
 */
export const COMMUNITY_RESILIENCE_GAIN = 4;
export const COMMUNITY_RESILIENCE_MAX = 12;

/**
 * ## The mastery layer
 *
 * A second, optional acknowledgement for a player who keeps going past the
 * endurance goal — a hundred days, well-known, well-travelled, and held
 * without leaning on the bar.
 *
 * `MASTERY_MONEY` is the number that was wrong. At 200 the layer was
 * unreachable: a run broad enough to see eighteen locations and disciplined
 * enough to keep bar streaks under six banks roughly 90-110 by day 100, and
 * a simulation over 25 seeds of a competent explorer cleared every other
 * condition and failed on money every single time. 140 sits above what a
 * careless run holds and below what the rest of the condition forbids you
 * from earning.
 *
 * The bar-streak ceiling is the interesting constraint and is unchanged:
 * mastery means holding the city *without* grinding the thing that pays.
 */
export const MASTERY_GOAL_DAYS = 100;
export const MASTERY_REPUTATION = 80;
export const MASTERY_MONEY = 140;
export const MASTERY_LOCATIONS = 18;
export const MASTERY_MAX_BAR_STREAK = 5;

/** Rent deducted every Sunday, at the start of a run. */
export const RENT_AMOUNT = 18.0;

/**
 * ## Rent escalation — the run's pressure curve
 *
 * Rent used to be a flat 18 from day 1 to day 300, and *fell* as the run went
 * on: reputation discounts and the Tenants' Union card together take 9 off it.
 * The only economic pressure in the game therefore got cheaper the longer you
 * survived, which is why a four-branch strategy could hold the city
 * indefinitely — nothing the game did after the last unlock (day 20) could
 * threaten a competent player.
 *
 * Rent now steps up every `RENT_ESCALATION_PERIOD_DAYS`, by
 * `RENT_ESCALATION_STEP` each time, to a ceiling of `RENT_MAX_AMOUNT`.
 *
 * The shape is deliberate:
 *
 *   - it is a *step*, not a curve, so the player can see it coming and name
 *     it ("the rent went up again") rather than feeling a slow squeeze;
 *   - the first step lands on day 15, after the early unlocks have opened the
 *     city, so the opening of a run is untouched;
 *   - by the day-60 endurance goal rent is 34 — noticeably heavier than the
 *     opening 18, still payable by one good market day;
 *   - the ceiling exists so a 300-day run does not become arithmetic. Past
 *     the cap the game is asking you to sustain a hard equilibrium, not to
 *     lose to a number that grows forever.
 *
 * Perk and reputation relief still apply *on top*, so the counterplay the
 * player has invested in keeps working — it now buys back a rising cost
 * instead of discounting a static one.
 */
export const RENT_ESCALATION_PERIOD_DAYS = 14;
export const RENT_ESCALATION_STEP = 4.0;
export const RENT_ESCALATION_FIRST_DAY = 15;
export const RENT_MAX_AMOUNT = 42.0;

/** Reputation-based rent discount thresholds. */
export const RENT_DISCOUNT_REP_THRESHOLD = 50;
export const RENT_DISCOUNT_REP_BONUS = 2;
export const RENT_DISCOUNT_REP_HIGH = 80;
export const RENT_DISCOUNT_REP_HIGH_BONUS = 4;

/** Offset so journey day 1 maps to Thursday (Jan 1, 2026). Mon=0 … Sun=6. */
export const START_WEEKDAY_OFFSET = 3;
