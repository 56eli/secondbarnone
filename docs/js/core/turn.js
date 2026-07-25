/**
 * Turn resolution — the exact sequence from main.gd::_on_location_action.
 *
 * Extracted into a pure-ish function so it can be unit-tested without any DOM.
 * Order matters and is preserved:
 *   1. apply the location action
 *   2. charge Sunday rent
 *   3. roll the scheduled random event
 *   4. check game over
 *   5. write the history line
 */

import { RENT_AMOUNT } from './game-state.js';

export const LOCATION_COPY = {
  spiritual_community: {
    name: 'Spiritual Community',
    actionDesc: 'You spent the day meditating and connecting with your spiritual community. Sanity restored, but donations cost you.',
    historyLabel: 'Visited the Spiritual Community',
  },
  bar: {
    name: 'The Bar',
    actionDesc: 'You worked a shift at the bar. The tips are good, but the late nights are wearing on your spirit.',
    historyLabel: 'Worked at the Bar',
  },
};

/**
 * Resolve one location action.
 * @returns {{actionDesc:string, event:object|null, rentCharged:boolean,
 *            gameOver:boolean, sanityDelta:number, moneyDelta:number,
 *            prevSanity:number, prevMoney:number}}
 */
export function resolveTurn(gs, eventManager, location) {
  const prevSanity = gs.sanity;
  const prevMoney = gs.money;

  // 1 — location action
  gs.applyLocationAction(location);
  const actionDesc = LOCATION_COPY[location]?.actionDesc ?? '';

  // 2 — Sunday rent, before the random event
  const rentCharged = gs.applyRentIfSunday();

  // 3 — scheduled random event
  let event = null;
  if (!gs.gameOver) {
    event = eventManager.selectEvent(
      gs.journeyDay,
      gs.getWeekdayIndex(),
      location,
      gs.consecutiveBarDays,
    );
    if (event) gs.applyEventDeltas(event.sanityDelta, event.moneyDelta);
  }

  // 4 — game over check
  const gameOver = gs.checkGameOver();

  // 5 — history line
  const parts = [];
  if (LOCATION_COPY[location]) parts.push(LOCATION_COPY[location].historyLabel);
  if (rentCharged) parts.push(`Paid rent (-${RENT_AMOUNT} money)`);
  if (event) parts.push(`Event: ${event.title}`);
  gs.addHistory(parts.join(' / '));

  return {
    actionDesc,
    event,
    rentCharged,
    gameOver,
    prevSanity,
    prevMoney,
    sanityDelta: gs.sanity - prevSanity,
    moneyDelta: gs.money - prevMoney,
  };
}
