/**
 * Perks — the insight spend.
 *
 * Quiet days generate `insight`. Insight buys perks, and perks bend the rules
 * a little: cheaper rent, gentler burnout, better tips. Each perk has a
 * prerequisite chain so the tree has some shape to it.
 */

const perk = (cfg) => Object.freeze({
  cost: 5,
  requires: [],
  effects: {},
  ...cfg,
});

export const PERKS = [
  perk({
    id: 'steady_breath',
    name: 'Steady Breath',
    emoji: '🌬️',
    desc: 'Four counts in, six out, in the walk-in fridge if that is what it takes. Bar shifts cost less spirit.',
    cost: 4,
    effects: { barSanityRelief: 3 },
  }),
  perk({
    id: 'thick_skin',
    name: 'Thick Skin',
    emoji: '🛡️',
    desc: 'Hurtful events land softer. You have been shouted at by better.',
    cost: 6,
    requires: ['steady_breath'],
    effects: { hurtfulDampening: 0.35 },
  }),
  perk({
    id: 'open_hand',
    name: 'Open Hand',
    emoji: '🤲',
    desc: 'You stopped apologising for the donation bowl. Community days cost less money.',
    cost: 5,
    effects: { communityCostRelief: 4 },
  }),
  perk({
    id: 'good_name',
    name: 'A Good Name',
    emoji: '🏅',
    desc: 'Word travels. Everything you do earns a little more reputation.',
    cost: 7,
    requires: ['open_hand'],
    effects: { reputationBonus: 2 },
  }),
  perk({
    id: 'night_owl',
    name: 'Night Owl',
    emoji: '🦉',
    desc: 'You have made peace with 3am. Night work pays better and drains less.',
    cost: 6,
    effects: { nightMoneyBonus: 3, nightEnergyRelief: 5 },
  }),
  perk({
    id: 'hard_bargain',
    name: 'Hard Bargain',
    emoji: '🤝',
    desc: 'You learned to let the silence sit after naming a price. Markets pay out more.',
    cost: 6,
    requires: ['night_owl'],
    effects: { marketMoneyBonus: 4 },
  }),
  perk({
    id: 'tenants_union',
    name: 'Tenants\u2019 Union Card',
    emoji: '🪪',
    desc: 'Kaden has to go through a committee now. Rent is permanently cheaper.',
    cost: 9,
    requires: ['good_name'],
    effects: { rentRelief: 5 },
  }),
  perk({
    id: 'deep_practice',
    name: 'Deep Practice',
    emoji: '🧘',
    desc: 'The sit goes somewhere now. Quiet places give more back.',
    cost: 7,
    effects: { quietSanityBonus: 4, insightBonus: 1 },
  }),
  perk({
    id: 'second_wind',
    name: 'Second Wind',
    emoji: '💨',
    desc: 'Resting recovers noticeably more, and exhaustion arrives later.',
    cost: 6,
    requires: ['deep_practice'],
    effects: { restBonus: 10, exhaustionResist: 8 },
  }),
  perk({
    id: 'the_long_view',
    name: 'The Long View',
    emoji: '🔭',
    desc: 'You can see the shape of a week now. Helpful events land harder.',
    cost: 10,
    requires: ['thick_skin', 'second_wind'],
    effects: { helpfulAmplify: 0.4 },
  }),
];

const BY_ID = new Map(PERKS.map((p) => [p.id, p]));

export function getPerk(id) {
  return BY_ID.get(id) ?? null;
}

export function perkIds() {
  return PERKS.map((p) => p.id);
}

/**
 * Can this perk be bought right now?
 * @param {string} id
 * @param {{insight:number, perks:Iterable<string>}} snap
 */
export function canBuyPerk(id, snap) {
  const p = BY_ID.get(id);
  if (!p) return { ok: false, reason: 'No such perk' };
  const owned = snap.perks instanceof Set ? snap.perks : new Set(snap.perks ?? []);
  if (owned.has(id)) return { ok: false, reason: 'Already learned' };
  const missing = p.requires.filter((r) => !owned.has(r));
  if (missing.length > 0) {
    const names = missing.map((m) => BY_ID.get(m)?.name ?? m).join(', ');
    return { ok: false, reason: `Requires ${names}` };
  }
  if ((snap.insight ?? 0) < p.cost) {
    return { ok: false, reason: `Needs ${p.cost} insight` };
  }
  return { ok: true, reason: '' };
}

/** Sum the effects of every owned perk. */
export function aggregatePerks(ids) {
  const total = {
    barSanityRelief: 0,
    hurtfulDampening: 0,
    helpfulAmplify: 0,
    communityCostRelief: 0,
    reputationBonus: 0,
    nightMoneyBonus: 0,
    nightEnergyRelief: 0,
    marketMoneyBonus: 0,
    rentRelief: 0,
    quietSanityBonus: 0,
    insightBonus: 0,
    restBonus: 0,
    exhaustionResist: 0,
  };
  for (const id of ids ?? []) {
    const p = BY_ID.get(id);
    if (!p) continue;
    for (const [k, v] of Object.entries(p.effects)) {
      if (k in total) total[k] += v;
    }
  }
  return total;
}
