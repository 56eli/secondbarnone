/**
 * Late-game community projects for renovating House of Middleway.
 * Unlocks after reaching Day 60 OR purchasing all 10 perks.
 */
export const RENOVATIONS = Object.freeze([
  {
    id: 'roof_repair',
    name: 'Repair the Chapel Roof',
    desc: 'Fix the leaky skylights and seal the slate rafters against winter rains.',
    cost: { insight: 15, money: 20 },
    reward: { reputation: 5, sanity: 10 },
  },
  {
    id: 'community_kitchen',
    name: 'Upgrade the Community Kitchen',
    desc: 'Install industrial burners and communal seating for neighborhood potlucks.',
    cost: { insight: 25, money: 30 },
    reward: { reputation: 10, sanity: 15 },
  },
  {
    id: 'meditation_garden',
    name: 'Restore the Meditation Garden',
    desc: 'Plant hardy perennials and build wooden benches around the stone courtyard.',
    cost: { insight: 35, money: 40 },
    reward: { reputation: 15, sanity: 20 },
  },
  {
    id: 'sanctuary_library',
    name: 'Build the Sanctuary Library',
    desc: 'Construct floor-to-ceiling shelving for texts on contemplation and spiritual practice.',
    cost: { insight: 50, money: 50 },
    reward: { reputation: 20, sanity: 25 },
  },
]);

export function getRenovation(id) {
  return RENOVATIONS.find((r) => r.id === id) || null;
}
