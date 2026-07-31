# Balance regression postmortem

## First regression: pressure disappeared

A shipped variant combined several changes that all removed pressure in the
same direction:

1. rent became a flat 18-money weekly bill while rewards kept scaling;
2. Home Loft and Bathhouse became cheap, over-efficient recovery days;
3. income perks grew at the same time;
4. energy numbers changed without retuning the full loop;
5. no survival-band test asked whether a preview-reading strategy could die.

The process cause was branch/content work reapplying location and perk values
without carrying the earlier economy patch as one unit. Balance constants,
location effects, rent policy and simulation tests did not share release
ownership.

## Second regression: hard collapse compressed the skill gradient

The v2.6 pass established a 300-seed 60-day hub gradient with an average proxy
near a coin flip and engaged models around three wins in five. A later change
made touching zero energy immediately lethal. The ending was desirable, but the
same PR lowered test thresholds instead of retuning the economy and left the old
measured table in canonical docs. Current audit work found engaged success had
fallen to roughly 29-33% and that the simulator mislabeled every energy death as
money.

The correction kept hard energy death, fixed simulator observability/RNG/death
diagnostics, and raised ordinary overnight recovery from 12 to **13**. That
single point restores decision margin without making the founding loop safe.
The average model's attention cadence was recalibrated transparently from 30%
to 20% after decision/event RNG were separated.

## Current locked contract (31 July 2026)

- 13 energy returns per ordinary night: seven nights restore 91 and the eighth
  tops off.
- Zero energy remains an immediate exhaustion ending.
- Rent starts at 18, escalates by 3 every 14 journey days, and caps at 48 before
  modest perk/reputation relief.
- Rest, city and founding effects remain priced against the same constants.
- Sunday prepayment and duplicate-turn exploits are covered.
- UI and simulator share exact/banded/veiled observable previews.
- Event and decision randomness use independent seeded streams; event seeding
  matches production.
- Simulator deaths distinguish sanity, energy and money.
- 300-seed/61-day hub goals: inattentive 0%, random 29%, greedy 26%, average
  48%, sometimes attentive 55%, concentrates 59%, min-maxing 64%.
- Informed rotating-card share is 42-53% (test floor 25%).
- A separate 40-seed/200-day unlocked-map stress contract keeps random and
  founding-pair-only horizon survival at 0%, greedy at 7.5%, concentrates at
  57.5% and min-maxing at 62.5%.

Run both horizons whenever economy data, perks, events, previews or location
effects change:

```bash
node scripts/simulate.js --runs=300 --days=61
node scripts/simulate.js --runs=40 --days=200
```

Do not weaken assertions merely to ship content. If a product rule changes,
state the new target first, measure before/after, retune deliberately, and keep
human playtests as the authority on felt fairness.
