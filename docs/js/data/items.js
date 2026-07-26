/**
 * Items and the satchel.
 *
 * Items are small, mostly-passive objects Léon accumulates. Three kinds:
 *
 *  - `passive` — a permanent modifier while carried
 *  - `consumable` — used once from the satchel for an immediate effect
 *  - `keepsake` — no mechanical effect, pure story, but pawnable
 *
 * Every item has a `value` so the pawnbroker has something to offer.
 */

export const ItemKind = Object.freeze({
  PASSIVE: 'passive',
  CONSUMABLE: 'consumable',
  KEEPSAKE: 'keepsake',
});

const it = (cfg) => Object.freeze({
  kind: ItemKind.PASSIVE,
  value: 6,
  modifiers: {},
  use: null,
  ...cfg,
});

export const ITEMS = [
  it({
    id: 'prayer_beads',
    name: 'Sandalwood Beads',
    emoji: '📿',
    desc: 'Geo\u2019s spare set, worn smooth at the guru bead. They smell faintly of the hall.',
    kind: ItemKind.PASSIVE,
    value: 9,
    modifiers: { sanityPerTurn: 1 },
  }),
  it({
    id: 'thermos',
    name: 'Dented Thermos',
    emoji: '🥤',
    desc: 'Keeps tea hot for nine hours and has survived two falls off a roof.',
    kind: ItemKind.PASSIVE,
    value: 7,
    modifiers: { energyPerTurn: 3 },
  }),
  it({
    id: 'tip_jar',
    name: 'Handwritten Tip Sign',
    emoji: '🫙',
    desc: 'Kaj lettered it. People tip about a fifth better and nobody knows why.',
    kind: ItemKind.PASSIVE,
    value: 8,
    modifiers: { moneyPerWorkTurn: 2 },
  }),
  it({
    id: 'rain_shell',
    name: 'Second-hand Rain Shell',
    emoji: '🧥',
    desc: 'Ugly, orange, and completely waterproof. Weather stops being an argument.',
    kind: ItemKind.PASSIVE,
    value: 10,
    modifiers: { weatherShield: 1 },
  }),
  it({
    id: 'notebook',
    name: 'Water-stained Notebook',
    emoji: '📓',
    desc: 'Half sermon notes, half stock orders. The two halves are converging.',
    kind: ItemKind.PASSIVE,
    value: 5,
    modifiers: { insightPerTurn: 1 },
  }),
  it({
    id: 'strong_coffee',
    name: 'Flask of Strong Coffee',
    emoji: '☕',
    desc: 'From the place on the corner that opens at four for the market crews.',
    kind: ItemKind.CONSUMABLE,
    value: 4,
    use: { energy: 30, sanity: -2 },
  }),
  it({
    id: 'herbal_tonic',
    name: 'Herbal Tonic',
    emoji: '🧪',
    desc: 'Marlies makes it in the garden shed. Tastes appalling. Works anyway.',
    kind: ItemKind.CONSUMABLE,
    value: 6,
    use: { sanity: 14 },
  }),
  it({
    id: 'emergency_envelope',
    name: 'Emergency Envelope',
    emoji: '✉️',
    desc: 'Cash, taped shut, with DON\u2019T written on it in Barret\u2019s handwriting.',
    kind: ItemKind.CONSUMABLE,
    value: 14,
    use: { money: 20 },
  }),
  it({
    id: 'good_boots',
    name: 'Good Boots',
    emoji: '🥾',
    desc: 'Resoled twice. The hill out to the ruins stops being a negotiation.',
    kind: ItemKind.PASSIVE,
    value: 12,
    modifiers: { travelEnergyDiscount: 8 },
  }),
  it({
    id: 'letter_from_geo',
    name: 'Letter from Geo',
    emoji: '💌',
    desc: 'Four lines, no advice in them. You have read it more times than you would admit.',
    kind: ItemKind.KEEPSAKE,
    value: 3,
  }),
  it({
    id: 'brass_bell',
    name: 'Small Brass Bell',
    emoji: '🔔',
    desc: 'Rung at the end of every sit since the community had a roof.',
    kind: ItemKind.KEEPSAKE,
    value: 11,
  }),
  it({
    id: 'river_stone',
    name: 'Flat River Stone',
    emoji: '🪨',
    desc: 'Picked up on a bad afternoon on the towpath. It fits the thumb exactly.',
    kind: ItemKind.KEEPSAKE,
    value: 2,
  }),
];

const BY_ID = new Map(ITEMS.map((i) => [i.id, i]));

export function getItem(id) {
  return BY_ID.get(id) ?? null;
}

export function itemIds() {
  return ITEMS.map((i) => i.id);
}

/**
 * Sum the passive modifiers of everything carried.
 * @param {Iterable<string>} ids
 */
export function aggregateModifiers(ids) {
  const total = {
    sanityPerTurn: 0,
    energyPerTurn: 0,
    insightPerTurn: 0,
    moneyPerWorkTurn: 0,
    weatherShield: 0,
    travelEnergyDiscount: 0,
  };
  for (const id of ids ?? []) {
    const item = BY_ID.get(id);
    if (!item) continue;
    for (const [k, v] of Object.entries(item.modifiers)) {
      if (k in total) total[k] += v;
    }
  }
  return total;
}
