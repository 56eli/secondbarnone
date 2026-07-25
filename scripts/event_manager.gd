class_name EventManager
extends Node

## Data-driven event system. Fires location-specific events on a scheduled
## interval (every 2-5 completed journey-days). All events are explicitly
## categorised as Standard (weight 10), Rare Helpful (weight 2), or
## Rare Hurtful (weight 2). Call select_event() after a location action.
##
## Scheduling:
##   After a restart, the first event is scheduled 2-5 journey-days ahead.
##   After each event, the next is scheduled another 2-5 days ahead.
##   No probability rolls are used once the scheduled day is reached.

signal event_resolved(event: EventDefinition, description: String)

## Minimum gap between random location events (in journey-days).
const MIN_EVENT_GAP_DAYS: int = 2
## Maximum gap between random location events (in journey-days).
const MAX_EVENT_GAP_DAYS: int = 5

## Weight for Standard events.
const WEIGHT_STANDARD: float = 10.0
## Weight for Rare Helpful events.
const WEIGHT_RARE_HELPFUL: float = 2.0
## Weight for Rare Hurtful events.
const WEIGHT_RARE_HURTFUL: float = 2.0
## Weight for Seasonal events.
const WEIGHT_SEASONAL: float = 4.0

var _all_events: Array[EventDefinition] = []
var _previous_event_id: StringName = StringName()
var _consecutive_bar_days: int = 0

## The journey_day on which the next random event will fire.
var _next_event_day: int = 1

# Character data needed for friend events
var _character_names: Array[String] = []


func initialize(characters: Array[String]) -> void:
	_character_names = characters.duplicate()
	_build_event_pool()
	_schedule_next_event(1)  # first event 2-5 days from day 1


## Select and return a random event if the scheduled day has been reached.
## Returns null if the schedule has not yet reached the trigger day.
func select_event(
	journey_day: int,
	weekday: int,
	current_location: String,
	consecutive_bar: int
) -> EventDefinition:
	_consecutive_bar_days = consecutive_bar

	# Scheduled check: only fire if we have reached the scheduled day
	if journey_day < _next_event_day:
		return null

	var pool := _build_pool(journey_day, weekday, current_location)
	if pool.is_empty():
		_schedule_next_event(journey_day)
		return null

	# Avoid repeating the exact same event
	if pool.size() > 1:
		var filtered := pool.filter(func(e: EventDefinition) -> bool:
			return e.id != _previous_event_id
		)
		if not filtered.is_empty():
			pool = filtered

	var selected := _weighted_select(pool)
	_previous_event_id = selected.id

	# Schedule next event 2-5 days in the future
	_schedule_next_event(journey_day)

	# If friend event, pick a random character name
	if selected.category == EventDefinition.Category.FRIEND and not _character_names.is_empty():
		var friend_name: String = _character_names.pick_random()
		var desc: String = selected.description
		desc = desc.replace("{friend}", friend_name)
		selected.description = desc

	return selected


## Schedule the next event 2-5 journey-days after the given day.
func _schedule_next_event(from_day: int) -> void:
	_next_event_day = from_day + randi_range(MIN_EVENT_GAP_DAYS, MAX_EVENT_GAP_DAYS)


## Build the pool of eligible events for the current game state.
func _build_pool(journey_day: int, weekday: int, location: String) -> Array[EventDefinition]:
	var pool: Array[EventDefinition] = []
	for e in _all_events:
		if e.minimum_day > journey_day:
			continue
		if not e.allowed_weekdays.is_empty() and weekday not in e.allowed_weekdays:
			continue
		if e.required_location != "" and e.required_location != location:
			continue
		# Burnout: only eligible if high consecutive bar days
		if e.id == StringName("burnout") and _consecutive_bar_days < 3:
			continue
		# Friend events: skip if no characters
		if e.category == EventDefinition.Category.FRIEND and _character_names.is_empty():
			continue
		pool.append(e)
	return pool


func _weighted_select(pool: Array[EventDefinition]) -> EventDefinition:
	var total_weight: float = 0.0
	for e in pool:
		total_weight += e.weight

	var roll := randf() * total_weight
	var cumulative: float = 0.0
	for e in pool:
		cumulative += e.weight
		if roll <= cumulative:
			return e

	return pool.back()


func reset() -> void:
	_previous_event_id = StringName()
	_consecutive_bar_days = 0
	_next_event_day = 1
	_schedule_next_event(0)  # schedule first event 2-5 days from day 1


## Populate the full event pool. Every event has a required_location and
## explicit rarity (Standard weight 10, Rare Helpful/Hurtful weight 2).
func _build_event_pool() -> void:
	_all_events = []

	# ---- Spiritual Community events ----

	# Standard (weight 10)
	_all_events.append(_make_event("inspiring_meditation", "Inspiring Meditation",
		"The meditation session was profound. Your spirit feels renewed and your mind is clear as mountain water.",
		EventDefinition.Category.SPIRITUAL, EventDefinition.Rarity.STANDARD,
		8.0, 0.0, WEIGHT_STANDARD, "spiritual_community"))
	_all_events.append(_make_event("moment_of_clarity", "Moment of Clarity",
		"A sudden insight brings peace to your mind. The path forward seems obvious now, as if it was always there.",
		EventDefinition.Category.SPIRITUAL, EventDefinition.Rarity.STANDARD,
		10.0, 0.0, WEIGHT_STANDARD, "spiritual_community"))
	_all_events.append(_make_event("community_support", "Community Support",
		"Community members offer their support and encouragement. You are reminded why you started this journey.",
		EventDefinition.Category.COMMUNITY, EventDefinition.Rarity.STANDARD,
		8.0, 0.0, WEIGHT_STANDARD, "spiritual_community"))
	_all_events.append(_make_event("community_potluck", "Community Potluck",
		"A potluck dinner brings everyone together. Full bellies, full hearts, and generous donations appear in the bowl.",
		EventDefinition.Category.COMMUNITY, EventDefinition.Rarity.STANDARD,
		8.0, 8.0, WEIGHT_STANDARD, "spiritual_community"))
	_all_events.append(_make_event("healing_circle", "Group Healing Circle",
		"The community gathers for a spontaneous healing circle. Their shared warmth restores your faith in humanity.",
		EventDefinition.Category.SPIRITUAL, EventDefinition.Rarity.STANDARD,
		12.0, 0.0, WEIGHT_STANDARD, "spiritual_community"))
	_all_events.append(_make_event("wise_elder", "Wise Elder Visit",
		"An elder from a nearby community visits and shares ancient wisdom. You feel renewed purpose and direction.",
		EventDefinition.Category.SPIRITUAL, EventDefinition.Rarity.STANDARD,
		10.0, 0.0, WEIGHT_STANDARD, "spiritual_community"))
	_all_events.append(_make_event("small_fundraiser", "Small Fundraiser",
		"A small fundraiser lifts spirits and brings in modest funds. Every little bit helps keep the lights on.",
		EventDefinition.Category.COMMUNITY, EventDefinition.Rarity.STANDARD,
		5.0, 5.0, WEIGHT_STANDARD, "spiritual_community"))
	_all_events.append(_make_event("spiritual_doubt", "Spiritual Doubt",
		"Doubts creep into your meditation. The silence feels empty rather than full, and questions gnaw at your faith.",
		EventDefinition.Category.SPIRITUAL, EventDefinition.Rarity.STANDARD,
		-8.0, 0.0, WEIGHT_STANDARD, "spiritual_community"))
	_all_events.append(_make_event("community_disagreement", "Community Disagreement",
		"A disagreement arises in the community about the path forward. Voices are raised and old tensions surface.",
		EventDefinition.Category.COMMUNITY, EventDefinition.Rarity.STANDARD,
		-6.0, 0.0, WEIGHT_STANDARD, "spiritual_community"))
	_all_events.append(_make_event("rainy_day", "Rainy Day Reflection",
		"Rain taps gently on the roof as the community sits in quiet reflection. There is beauty in the stillness.",
		EventDefinition.Category.SPIRITUAL, EventDefinition.Rarity.STANDARD,
		6.0, 0.0, WEIGHT_STANDARD, "spiritual_community"))
	_all_events.append(_make_event("new_member", "A New Face",
		"A curious newcomer visits the community for the first time. Their fresh energy and questions remind everyone why this place matters.",
		EventDefinition.Category.COMMUNITY, EventDefinition.Rarity.STANDARD,
		7.0, 3.0, WEIGHT_STANDARD, "spiritual_community"))

	# Rare Helpful (weight 2)
	_all_events.append(_make_event("sc_deep_meditation", "Deep Meditation Breakthrough",
		"A profound breakthrough during meditation leaves your spirit soaring. You feel truly connected to everything around you, as if the universe itself is breathing with you.",
		EventDefinition.Category.SPIRITUAL, EventDefinition.Rarity.RARE_HELPFUL,
		25.0, 0.0, WEIGHT_RARE_HELPFUL, "spiritual_community"))
	_all_events.append(_make_event("sc_generous_donor", "Anonymous Benefactor",
		"An anonymous donor leaves a substantial gift for the community. A note says simply: Keep the light burning.",
		EventDefinition.Category.COMMUNITY, EventDefinition.Rarity.RARE_HELPFUL,
		5.0, 20.0, WEIGHT_RARE_HELPFUL, "spiritual_community"))

	# Rare Hurtful (weight 2)
	_all_events.append(_make_event("sc_spiritual_crisis", "Spiritual Crisis",
		"A wave of existential doubt washes over you. Nothing feels meaningful anymore. The silence that once comforted you now feels like an abyss.",
		EventDefinition.Category.SPIRITUAL, EventDefinition.Rarity.RARE_HURTFUL,
		-20.0, 0.0, WEIGHT_RARE_HURTFUL, "spiritual_community"))
	_all_events.append(_make_event("sc_inner_schism", "Schism in the Community",
		"A disagreement erupts into a full-blown schism. Members take sides and the tension threatens to tear everything apart.",
		EventDefinition.Category.COMMUNITY, EventDefinition.Rarity.RARE_HURTFUL,
		-10.0, 0.0, WEIGHT_RARE_HURTFUL, "spiritual_community"))

	# ---- Bar events ----

	# Standard (weight 10)
	_all_events.append(_make_event("unexpected_tips", "Unexpected Tips",
		"The bar was busy tonight. A group celebrating a birthday left generous tips, and your jar is pleasantly full.",
		EventDefinition.Category.BAR, EventDefinition.Rarity.STANDARD,
		0.0, 8.0, WEIGHT_STANDARD, "bar"))
	_all_events.append(_make_event("slow_night", "Slow Night",
		"A quiet night at the bar. Only a handful of regulars nursing their drinks. Earnings are lower than expected.",
		EventDefinition.Category.BAR, EventDefinition.Rarity.STANDARD,
		0.0, -5.0, WEIGHT_STANDARD, "bar"))
	_all_events.append(_make_event("difficult_customer", "Difficult Customer",
		"A difficult customer causes a scene over their drink. The confrontation takes a toll on your patience and spirit.",
		EventDefinition.Category.BAR, EventDefinition.Rarity.STANDARD,
		-6.0, 0.0, WEIGHT_STANDARD, "bar"))
	_all_events.append(_make_event("regular_story", "Regular Tells a Story",
		"An old regular shares a hilarious tale from decades past. The whole bar leans in to listen, and laughter fills the room.",
		EventDefinition.Category.BAR, EventDefinition.Rarity.STANDARD,
		6.0, 0.0, WEIGHT_STANDARD, "bar"))
	_all_events.append(_make_event("philosophical_drunk", "Philosophical Drunk",
		"A tipsy philosopher shares surprisingly profound insights between drinks. You are oddly moved by their rambling wisdom.",
		EventDefinition.Category.BAR, EventDefinition.Rarity.STANDARD,
		4.0, 0.0, WEIGHT_STANDARD, "bar"))
	_all_events.append(_make_event("karaoke_night", "Karaoke Night Success",
		"Karaoke night is a hit! The crowd is energized and tips flow freely. Even the shy regulars get up to sing.",
		EventDefinition.Category.BAR, EventDefinition.Rarity.STANDARD,
		8.0, 8.0, WEIGHT_STANDARD, "bar"))
	_all_events.append(_make_event("broken_equipment", "Broken Equipment",
		"The espresso machine breaks mid-shift. The repair eats into tonight's profits, and the backup instant coffee draws complaints.",
		EventDefinition.Category.BAR, EventDefinition.Rarity.STANDARD,
		0.0, -12.0, WEIGHT_STANDARD, "bar"))
	_all_events.append(_make_event("trivia_night", "Trivia Night Triumph",
		"The bar hosts an impromptu trivia night. Your team wins, and the celebratory drinks boost morale and tips alike.",
		EventDefinition.Category.BAR, EventDefinition.Rarity.STANDARD,
		5.0, 5.0, WEIGHT_STANDARD, "bar"))
	_all_events.append(_make_event("neighborhood_drama", "Neighborhood Drama",
		"A minor neighborhood dispute spills into the bar. You help mediate, but the emotional labor drains you.",
		EventDefinition.Category.BAR, EventDefinition.Rarity.STANDARD,
		-4.0, 0.0, WEIGHT_STANDARD, "bar"))

	# Rare Helpful (weight 2)
	_all_events.append(_make_event("bar_big_tip_night", "Big Tip Night",
		"A wealthy patron in a generous mood leaves tips that can only be described as absurd. Your money worries ease for a moment.",
		EventDefinition.Category.FINANCIAL, EventDefinition.Rarity.RARE_HELPFUL,
		0.0, 25.0, WEIGHT_RARE_HELPFUL, "bar"))
	_all_events.append(_make_event("bar_old_friend", "Unexpected Reunion",
		"An old friend you haven't seen in years walks through the door. Hours of catching up leave your heart full and your spirit lifted.",
		EventDefinition.Category.FRIEND, EventDefinition.Rarity.RARE_HELPFUL,
		15.0, 5.0, WEIGHT_RARE_HELPFUL, "bar"))

	# Rare Hurtful (weight 2)
	_all_events.append(_make_event("bar_fight_night", "Bar Fight",
		"A brawl breaks out between two groups. Broken glass, shouting, and police sirens. The cleanup alone costs you hours and money.",
		EventDefinition.Category.BAR, EventDefinition.Rarity.RARE_HURTFUL,
		-18.0, -8.0, WEIGHT_RARE_HURTFUL, "bar"))
	var burnout := _make_event("burnout", "Burnout",
		"The late nights have caught up with you. Every shift blurs into the last, and exhaustion settles deep in your bones. You need to rest.",
		EventDefinition.Category.BURNOUT, EventDefinition.Rarity.RARE_HURTFUL,
		-15.0, 0.0, WEIGHT_RARE_HURTFUL, "bar")
	_all_events.append(burnout)
	_all_events.append(_make_event("bar_health_inspector", "Surprise Inspection",
		"A surprise health inspection finds minor violations. The fine stings, and the stress of the encounter leaves you shaken.",
		EventDefinition.Category.BAR, EventDefinition.Rarity.RARE_HURTFUL,
		-8.0, -12.0, WEIGHT_RARE_HURTFUL, "bar"))


static func _make_event(
	id: String,
	title: String,
	description: String,
	category: EventDefinition.Category,
	rarity: EventDefinition.Rarity,
	sanity_delta: float,
	money_delta: float,
	weight: float,
	required_location: String = ""
) -> EventDefinition:
	var e := EventDefinition.new()
	e.id = StringName(id)
	e.title = title
	e.description = description
	e.category = category
	e.rarity = rarity
	e.sanity_delta = sanity_delta
	e.money_delta = money_delta
	e.weight = weight
	e.required_location = required_location
	return e
