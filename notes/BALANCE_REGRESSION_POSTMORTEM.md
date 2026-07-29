# Balance regression postmortem

## What regressed

The shipped variant combined several changes that all pulled pressure out of the
same direction:

1. **Rent escalation disappeared.** Rent became a flat 18-money weekly bill,
   while location and event rewards continued to add positive long-run value.
2. **Rest became too efficient.** Home Loft changed from a costly recovery day
   (+30 energy, -6 money, +2 sanity) into a much cheaper and more rewarding
   one (+32 energy, -3 money, +4 sanity). Bathhouse and several city options
   received similar upside.
3. **Income perks grew at the same time.** Community, night and market bonuses
   returned to 4/3/4 instead of their restrained 3/2/3 values.
4. **Energy numbers changed without retuning the whole loop.** The founding
   bar/community choices became much harsher while rest became stronger,
   making the advertised loop unreliable and rewarding a rest-heavy strategy.
5. **There was no survival-band test.** Rule and catalogue tests passed even
   when a preview-reading strategy was effectively immortal.

The likely process cause was branch/content work reapplying newer location and
perk values without carrying forward the earlier balancing patch as a unit.
Balance constants, location effects, rent policy and simulation tests were not
owned as one release contract.

## Fixes now locked in

- 14 energy returns per night; the bar/community pair consumes energy over
  time instead of cancelling overnight recovery.
- Rest, city and founding-location base effects were restored to the balanced
  values; income perk bonuses were reduced.
- Rent escalates by 3 every 24 days and caps at 42. Reputation discounts remain
  modest rather than erasing the long-run sink.
- The Sunday prepayment exploit and duplicate-turn model exploit are covered.
- `tests/balance.test.js` asserts simulation bands: careless play fares worse,
  a preview reader has real long-run risk, and the founding loop is viable but
  not immortal.

Run `node scripts/simulate.js --runs=100 --days=200` whenever economy data,
perks, events or location effects change. Do not weaken those tests merely to
ship a content change; retune the content deliberately.
