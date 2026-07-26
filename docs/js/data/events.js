/**
 * Event pool — ported 1:1 from scripts/event_manager.gd (_build_event_pool).
 *
 * Every event keeps its original id, copy, deltas, weight and location gate so
 * that game balance is unchanged from the Godot version.
 */

export const Category = Object.freeze({
  SPIRITUAL: 'spiritual',
  FINANCIAL: 'financial',
  BAR: 'bar',
  COMMUNITY: 'community',
  BURNOUT: 'burnout',
  FRIEND: 'friend',
  RENT: 'rent',
});

export const Rarity = Object.freeze({
  STANDARD: 'standard',
  RARE_HELPFUL: 'rare_helpful',
  RARE_HURTFUL: 'rare_hurtful',
});

export const WEIGHT_STANDARD = 10.0;
export const WEIGHT_RARE_HELPFUL = 2.0;
export const WEIGHT_RARE_HURTFUL = 2.0;

/** Human-readable rarity label (EventDefinition.rarity_name). */
export function rarityName(rarity) {
  switch (rarity) {
    case Rarity.STANDARD: return 'Common';
    case Rarity.RARE_HELPFUL: return 'Rare (Helpful)';
    case Rarity.RARE_HURTFUL: return 'Rare (Hurtful)';
    default: return '';
  }
}

function ev(id, title, description, category, rarity, sanityDelta, moneyDelta, weight, requiredLocation = '') {
  return {
    id,
    title,
    description,
    category,
    rarity,
    sanityDelta,
    moneyDelta,
    weight,
    requiredLocation,
    minimumDay: 1,
    allowedWeekdays: [],
  };
}

export function buildEventPool() {
  return [
    // ================= Spiritual Community =================
    // ---- Standard ----
    ev('inspiring_meditation', 'Inspiring Meditation',
      'The meditation session was profound. Your spirit feels renewed and your mind is clear as mountain water.',
      Category.SPIRITUAL, Rarity.STANDARD, 8, 0, WEIGHT_STANDARD, 'spiritual_community'),
    ev('moment_of_clarity', 'Moment of Clarity',
      'A sudden insight brings peace to your mind. The path forward seems obvious now, as if it was always there.',
      Category.SPIRITUAL, Rarity.STANDARD, 10, 0, WEIGHT_STANDARD, 'spiritual_community'),
    ev('community_support', 'Community Support',
      'Community members offer their support and encouragement. You are reminded why you started this journey.',
      Category.COMMUNITY, Rarity.STANDARD, 8, 0, WEIGHT_STANDARD, 'spiritual_community'),
    ev('community_potluck', 'Community Potluck',
      'A potluck dinner brings everyone together. Full bellies, full hearts, and generous donations appear in the bowl.',
      Category.COMMUNITY, Rarity.STANDARD, 8, 8, WEIGHT_STANDARD, 'spiritual_community'),
    ev('healing_circle', 'Group Healing Circle',
      'The community gathers for a spontaneous healing circle. Their shared warmth restores your faith in humanity.',
      Category.SPIRITUAL, Rarity.STANDARD, 12, 0, WEIGHT_STANDARD, 'spiritual_community'),
    ev('wise_elder', 'Wise Elder Visit',
      'An elder from a nearby community visits and shares ancient wisdom. You feel renewed purpose and direction.',
      Category.SPIRITUAL, Rarity.STANDARD, 10, 0, WEIGHT_STANDARD, 'spiritual_community'),
    ev('small_fundraiser', 'Small Fundraiser',
      'A small fundraiser lifts spirits and brings in modest funds. Every little bit helps keep the lights on.',
      Category.COMMUNITY, Rarity.STANDARD, 5, 5, WEIGHT_STANDARD, 'spiritual_community'),
    ev('spiritual_doubt', 'Spiritual Doubt',
      'Doubts creep into your meditation. The silence feels empty rather than full, and questions gnaw at your faith.',
      Category.SPIRITUAL, Rarity.STANDARD, -8, 0, WEIGHT_STANDARD, 'spiritual_community'),
    ev('community_disagreement', 'Community Disagreement',
      'A disagreement arises in the community about the path forward. Voices are raised and old tensions surface.',
      Category.COMMUNITY, Rarity.STANDARD, -6, 0, WEIGHT_STANDARD, 'spiritual_community'),
    ev('rainy_day', 'Rainy Day Reflection',
      'Rain taps gently on the roof as the community sits in quiet reflection. There is beauty in the stillness.',
      Category.SPIRITUAL, Rarity.STANDARD, 6, 0, WEIGHT_STANDARD, 'spiritual_community'),
    ev('new_member', 'A New Face',
      'A curious newcomer visits the community for the first time. Their fresh energy and questions remind everyone why this place matters.',
      Category.COMMUNITY, Rarity.STANDARD, 7, 3, WEIGHT_STANDARD, 'spiritual_community'),

    // ---- Rare Helpful ----
    ev('sc_deep_meditation', 'Deep Meditation Breakthrough',
      'A profound breakthrough during meditation leaves your spirit soaring. You feel truly connected to everything around you, as if the universe itself is breathing with you.',
      Category.SPIRITUAL, Rarity.RARE_HELPFUL, 25, 0, WEIGHT_RARE_HELPFUL, 'spiritual_community'),
    ev('sc_generous_donor', 'Anonymous Benefactor',
      'An anonymous donor leaves a substantial gift for the community. A note says simply: Keep the light burning.',
      Category.COMMUNITY, Rarity.RARE_HELPFUL, 5, 20, WEIGHT_RARE_HELPFUL, 'spiritual_community'),

    // ---- Rare Hurtful ----
    ev('sc_spiritual_crisis', 'Spiritual Crisis',
      'A wave of existential doubt washes over you. Nothing feels meaningful anymore. The silence that once comforted you now feels like an abyss.',
      Category.SPIRITUAL, Rarity.RARE_HURTFUL, -20, 0, WEIGHT_RARE_HURTFUL, 'spiritual_community'),
    ev('sc_inner_schism', 'Schism in the Community',
      'A disagreement erupts into a full-blown schism. Members take sides and the tension threatens to tear everything apart.',
      Category.COMMUNITY, Rarity.RARE_HURTFUL, -10, 0, WEIGHT_RARE_HURTFUL, 'spiritual_community'),

    // ===================== The Bar =====================
    // ---- Standard ----
    ev('unexpected_tips', 'Unexpected Tips',
      'The bar was busy tonight. A group celebrating a birthday left generous tips, and your jar is pleasantly full.',
      Category.BAR, Rarity.STANDARD, 0, 8, WEIGHT_STANDARD, 'bar'),
    ev('slow_night', 'Slow Night',
      'A quiet night at the bar. Only a handful of regulars nursing their drinks. Earnings are lower than expected.',
      Category.BAR, Rarity.STANDARD, 0, -5, WEIGHT_STANDARD, 'bar'),
    ev('difficult_customer', 'Difficult Customer',
      'A difficult customer causes a scene over their drink. The confrontation takes a toll on your patience and spirit.',
      Category.BAR, Rarity.STANDARD, -6, 0, WEIGHT_STANDARD, 'bar'),
    ev('regular_story', 'Regular Tells a Story',
      'An old regular shares a hilarious tale from decades past. The whole bar leans in to listen, and laughter fills the room.',
      Category.BAR, Rarity.STANDARD, 6, 0, WEIGHT_STANDARD, 'bar'),
    ev('philosophical_drunk', 'Philosophical Drunk',
      'A tipsy philosopher shares surprisingly profound insights between drinks. You are oddly moved by their rambling wisdom.',
      Category.BAR, Rarity.STANDARD, 4, 0, WEIGHT_STANDARD, 'bar'),
    ev('karaoke_night', 'Karaoke Night Success',
      'Karaoke night is a hit! The crowd is energized and tips flow freely. Even the shy regulars get up to sing.',
      Category.BAR, Rarity.STANDARD, 8, 8, WEIGHT_STANDARD, 'bar'),
    ev('broken_equipment', 'Broken Equipment',
      'The espresso machine breaks mid-shift. The repair eats into tonight\u2019s profits, and the backup instant coffee draws complaints.',
      Category.BAR, Rarity.STANDARD, 0, -12, WEIGHT_STANDARD, 'bar'),
    ev('trivia_night', 'Trivia Night Triumph',
      'The bar hosts an impromptu trivia night. Your team wins, and the celebratory drinks boost morale and tips alike.',
      Category.BAR, Rarity.STANDARD, 5, 5, WEIGHT_STANDARD, 'bar'),
    ev('neighborhood_drama', 'Neighborhood Drama',
      'A minor neighborhood dispute spills into the bar. You help mediate, but the emotional labor drains you.',
      Category.BAR, Rarity.STANDARD, -4, 0, WEIGHT_STANDARD, 'bar'),

    // ---- Rare Helpful ----
    ev('bar_big_tip_night', 'Big Tip Night',
      'A wealthy patron in a generous mood leaves tips that can only be described as absurd. Your money worries ease for a moment.',
      Category.FINANCIAL, Rarity.RARE_HELPFUL, 0, 25, WEIGHT_RARE_HELPFUL, 'bar'),
    ev('bar_old_friend', 'Unexpected Reunion',
      '{friend} walks through the door — someone you haven\u2019t seen in far too long. Hours of catching up leave your heart full and your spirit lifted.',
      Category.FRIEND, Rarity.RARE_HELPFUL, 15, 5, WEIGHT_RARE_HELPFUL, 'bar'),

    // ---- Rare Hurtful ----
    ev('bar_fight_night', 'Bar Fight',
      'A brawl breaks out between two groups. Broken glass, shouting, and police sirens. The cleanup alone costs you hours and money.',
      Category.BAR, Rarity.RARE_HURTFUL, -18, -8, WEIGHT_RARE_HURTFUL, 'bar'),
    ev('burnout', 'Burnout',
      'The late nights have caught up with you. Every shift blurs into the last, and exhaustion settles deep in your bones. You need to rest.',
      Category.BURNOUT, Rarity.RARE_HURTFUL, -15, 0, WEIGHT_RARE_HURTFUL, 'bar'),
    ev('bar_health_inspector', 'Surprise Inspection',
      'A surprise health inspection finds minor violations. The fine stings, and the stress of the encounter leaves you shaken.',
      Category.BAR, Rarity.RARE_HURTFUL, -8, -12, WEIGHT_RARE_HURTFUL, 'bar'),
  ];
}
