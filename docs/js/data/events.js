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
  NEMESIS: 'nemesis',
  WEATHER: 'weather',
  MARKET: 'market',
  TRAVEL: 'travel',
  DISCOVERY: 'discovery',
  RIVAL: 'rival',
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

function ev(id, title, description, category, rarity, sanityDelta, moneyDelta, weight, requiredLocation = '', extra = {}) {
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
    // --- extensions ---
    /** Gate on a location tag instead of a single id. */
    requiredTag: '',
    /** Gate on the day's weather id. */
    requiredWeather: '',
    energyDelta: 0,
    reputationDelta: 0,
    insightDelta: 0,
    /** Item id granted when the event fires. */
    grantsItem: '',
    ...extra,
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

    // ================= Tag-gated: the wider city =================
    // These use requiredTag rather than requiredLocation, so one definition
    // covers every place that shares the tag.

    // ---- Quiet places ----
    ev('found_the_thread', 'You Found the Thread',
      'Somewhere in the second hour the noise dropped away and the thing you had been circling for weeks simply stated itself.',
      Category.SPIRITUAL, Rarity.STANDARD, 6, 0, WEIGHT_STANDARD, '',
      { requiredTag: 'quiet', insightDelta: 2 }),
    ev('the_stone', 'A Flat River Stone',
      'You picked it up without deciding to. It fits the thumb exactly, and you find you have kept it.',
      Category.DISCOVERY, Rarity.STANDARD, 3, 0, WEIGHT_STANDARD, '',
      { requiredTag: 'quiet', grantsItem: 'river_stone' }),
    ev('unwelcome_quiet', 'Too Much Quiet',
      'With nothing to do, everything you have been outrunning caught up and sat down opposite you.',
      Category.SPIRITUAL, Rarity.STANDARD, -7, 0, WEIGHT_STANDARD, '',
      { requiredTag: 'quiet' }),

    // ---- Outdoor ----
    ev('heron', 'The Heron',
      'It stood in the shallows for the whole time you watched it and then left without appearing to move.',
      Category.SPIRITUAL, Rarity.STANDARD, 6, 0, WEIGHT_STANDARD, '',
      { requiredTag: 'outdoor', insightDelta: 1 }),
    ev('turned_ankle', 'Turned Ankle',
      'A kerb you have stepped off a thousand times decided otherwise. Nothing broken; everything slower.',
      Category.TRAVEL, Rarity.STANDARD, -3, 0, WEIGHT_STANDARD, '',
      { requiredTag: 'outdoor', energyDelta: -12 }),
    ev('found_boots', 'Left Out for Anyone',
      'A pair of resoled boots on a wall with a note: TAKE THESE, THEY ARE GOOD. They are your size.',
      Category.DISCOVERY, Rarity.RARE_HELPFUL, 4, 0, WEIGHT_RARE_HELPFUL, '',
      { requiredTag: 'outdoor', grantsItem: 'good_boots' }),

    // ---- Markets ----
    ev('good_pitch', 'A Good Pitch',
      'You got the corner spot, the weather held, and by two in the afternoon there was nothing left to sell.',
      Category.MARKET, Rarity.STANDARD, 2, 9, WEIGHT_STANDARD, '',
      { requiredTag: 'market' }),
    ev('short_changed', 'Short-Changed',
      'You worked out on the bus home that the float was wrong, and by then it was nobody\u2019s fault.',
      Category.MARKET, Rarity.STANDARD, -4, -7, WEIGHT_STANDARD, '',
      { requiredTag: 'market' }),
    ev('trader_tipoff', 'A Trader\u2019s Tip-off',
      'The woman with the honey stall told you which wholesaler is about to fold and what to buy from them first.',
      Category.MARKET, Rarity.RARE_HELPFUL, 3, 14, WEIGHT_RARE_HELPFUL, '',
      { requiredTag: 'market', reputationDelta: 3 }),

    // ---- Volunteering & community ----
    ev('someone_came_back', 'Someone Came Back',
      'A woman you helped months ago returned to say so, at length, in front of everybody.',
      Category.COMMUNITY, Rarity.STANDARD, 7, 0, WEIGHT_STANDARD, '',
      { requiredTag: 'volunteer', reputationDelta: 6 }),
    ev('compassion_fatigue', 'Compassion Fatigue',
      'You said the right words to the fourth person in a row and felt absolutely nothing while saying them.',
      Category.BURNOUT, Rarity.STANDARD, -9, 0, WEIGHT_STANDARD, '',
      { requiredTag: 'volunteer', energyDelta: -8 }),
    ev('local_paper', 'The Local Paper',
      'A reporter came for a filler piece and stayed four hours. The photograph they ran is genuinely good.',
      Category.COMMUNITY, Rarity.RARE_HELPFUL, 5, 6, WEIGHT_RARE_HELPFUL, '',
      { requiredTag: 'community', reputationDelta: 14 }),

    // ---- Rest ----
    ev('real_sleep', 'Actual Sleep',
      'Nine hours, no dreams you remember, and you woke up before the alarm without hating anything.',
      Category.SPIRITUAL, Rarity.STANDARD, 5, 0, WEIGHT_STANDARD, '',
      { requiredTag: 'rest', energyDelta: 12 }),
    ev('cannot_switch_off', 'Cannot Switch Off',
      'You lay there running the week\u2019s numbers until it got light. Technically, this counted as a rest day.',
      Category.BURNOUT, Rarity.STANDARD, -5, 0, WEIGHT_STANDARD, '',
      { requiredTag: 'rest', energyDelta: -6 }),

    // ---- Study ----
    ev('marginalia', 'Somebody Else\u2019s Marginalia',
      'The previous borrower argued with the author in pencil for two hundred pages. They were right.',
      Category.DISCOVERY, Rarity.STANDARD, 4, 0, WEIGHT_STANDARD, '',
      { requiredTag: 'study', insightDelta: 3 }),
    ev('the_notebook', 'A Notebook, Abandoned',
      'Half sermon notes, half stock orders, left on the reference desk. You recognise the problem immediately.',
      Category.DISCOVERY, Rarity.RARE_HELPFUL, 3, 0, WEIGHT_RARE_HELPFUL, '',
      { requiredTag: 'study', grantsItem: 'notebook', insightDelta: 2 }),

    // ---- Night ----
    ev('four_am', 'Four in the Morning',
      'The hour when the city belongs to bakers and taxi drivers, and it was briefly, entirely yours.',
      Category.BAR, Rarity.STANDARD, 5, 3, WEIGHT_STANDARD, '',
      { requiredTag: 'night' }),
    ev('last_bus', 'Missed the Last Bus',
      'Ninety minutes on foot in the cold, with time to think about every decision that put you there.',
      Category.TRAVEL, Rarity.STANDARD, -4, -3, WEIGHT_STANDARD, '',
      { requiredTag: 'night', energyDelta: -10 }),

    // ---- Pilgrimage ----
    ev('view_from_the_top', 'The View From the Top',
      'The whole valley under weather, the city a smudge at the edge of it, and your problems visible at their real size.',
      Category.SPIRITUAL, Rarity.RARE_HELPFUL, 18, 0, WEIGHT_RARE_HELPFUL, '',
      { requiredTag: 'pilgrimage', insightDelta: 4 }),
    ev('the_bell', 'The Bell in the Ruins',
      'Wedged behind a fallen stone, small and brass and still perfectly in tune. Nobody was coming back for it.',
      Category.DISCOVERY, Rarity.RARE_HELPFUL, 6, 0, WEIGHT_RARE_HELPFUL, '',
      { requiredTag: 'pilgrimage', grantsItem: 'brass_bell', insightDelta: 2 }),

    // ---- Rivals ----
    ev('sato_offer', 'Sato Makes an Offer',
      'A salary, a title, and the studio\u2019s branding on everything you have built. She is not gloating. That is the worst of it.',
      Category.RIVAL, Rarity.STANDARD, -8, 10, WEIGHT_STANDARD, '',
      { requiredTag: 'rival', reputationDelta: -4 }),
    ev('alex_respect', 'Alex, Grudgingly',
      'Alex watched you work a rush without a word, then said "you\u2019re quick" and walked off. It should not have mattered.',
      Category.RIVAL, Rarity.STANDARD, 6, 4, WEIGHT_STANDARD, '',
      { requiredTag: 'rival' }),

    // ---- Weather-gated ----
    ev('storm_damage', 'Storm Damage',
      'A slate came off the hall roof and took the guttering with it. The quote arrived within the hour.',
      Category.WEATHER, Rarity.RARE_HURTFUL, -6, -14, WEIGHT_RARE_HURTFUL, '',
      { requiredWeather: 'storm' }),
    ev('fog_stranger', 'A Voice in the Fog',
      'Someone you could not see wished you a good evening from three feet away. You have thought about it since.',
      Category.WEATHER, Rarity.STANDARD, 4, 0, WEIGHT_STANDARD, '',
      { requiredWeather: 'fog', insightDelta: 2 }),
    ev('perfect_day', 'A Perfect Day',
      'Nothing in particular happened. The light was good the whole way through and you noticed it at the time.',
      Category.WEATHER, Rarity.RARE_HELPFUL, 12, 4, WEIGHT_RARE_HELPFUL, '',
      { requiredWeather: 'clear' }),

    // ---- Kaden, the arch nemesis ----
    ev('kaden_paperwork', 'A Refiled Application',
      'Kaden has resubmitted the redevelopment plan with two words changed. The clock starts again. He waved from the car.',
      Category.NEMESIS, Rarity.STANDARD, -7, 0, WEIGHT_STANDARD, '',
      { minimumDay: 9 }),
    ev('kaden_survey', 'Men With a Theodolite',
      'Three of them, on the community\u2019s verge, measuring something and declining to say what.',
      Category.NEMESIS, Rarity.STANDARD, -5, -4, WEIGHT_STANDARD, '',
      { minimumDay: 12 }),
    ev('kaden_buyout', 'The Offer in Writing',
      'A number large enough to be insulting and small enough to be tempting, on very good paper.',
      Category.NEMESIS, Rarity.RARE_HURTFUL, -14, 16, WEIGHT_RARE_HURTFUL, '',
      { minimumDay: 18, reputationDelta: -6 }),
    ev('kaden_setback', 'The Committee Says No',
      'The planning committee sent it back on a technicality. Somebody on the inside is stalling for you.',
      Category.NEMESIS, Rarity.RARE_HELPFUL, 14, 0, WEIGHT_RARE_HELPFUL, '',
      { minimumDay: 15, reputationDelta: 5 }),
  ];
}
