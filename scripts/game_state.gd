extends Node

## Persistent game-state. Holds all stats, in-game Gregorian calendar,
## history, and the character database.
##
## Calendar starts on Thursday, January 1, 2026 and advances one day per
## completed location action. There is no day-limit victory — the game only
## ends when sanity or money reaches zero.

const MAX_STAT: float = 100.0
const START_SANITY: float = 50.0
const START_MONEY: float = 50.0

const SANITY_GAIN: float = 15.0
const SANITY_LOSS: float = 12.0
const MONEY_GAIN: float = 12.0
const MONEY_LOSS: float = 10.0

## Offset so journey_day 1 maps to Thursday (Jan 1, 2026).
## In 0=Monday…6=Sunday indexing: Thursday = 3.
const START_WEEKDAY_OFFSET: int = 3

## Rent amount deducted every Sunday.
const RENT_AMOUNT: float = 18.0

const WEEKDAY_NAMES: Array[String] = [
	"Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"
]

const MONTH_NAMES: Array[String] = [
	"January", "February", "March", "April", "May", "June",
	"July", "August", "September", "October", "November", "December"
]

const DAYS_IN_MONTH: Array[int] = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

signal stats_changed(sanity: float, money: float)
signal day_changed(journey_day: int, weekday_name: String, month_name: String, year: int, day_of_month: int)
signal game_over_triggered(message: String)
signal history_updated(log_entry: String)

var sanity: float = START_SANITY
var money: float = START_MONEY

## Elapsed days counter (starts at 1, used for event scheduling, history).
var journey_day: int = 1
var game_over: bool = false

# Real calendar date
var day_of_month: int = 1
var month_index: int = 0   # 0 = January
var year: int = 2026

var character_profiles: Array[CharacterProfile] = []
var recent_history: Array[String] = []  # last 5 entries

# Tracking for event system
var consecutive_bar_days: int = 0
var last_location_visited: String = ""

## Tracks which calendar day-of-month rent was last charged on,
## so rent is only charged once per Sunday.
var _last_rent_day_of_month: int = -1


func _ready() -> void:
	character_profiles = CharacterData.create_all_profiles()


func reset_game() -> void:
	sanity = START_SANITY
	money = START_MONEY
	journey_day = 1
	day_of_month = 1
	month_index = 0
	year = 2026
	game_over = false
	consecutive_bar_days = 0
	last_location_visited = ""
	_last_rent_day_of_month = -1
	recent_history.clear()
	stats_changed.emit(sanity, money)
	day_changed.emit(journey_day, get_weekday_name(), get_month_name(), year, day_of_month)


func get_weekday_index() -> int:
	return (journey_day - 1 + START_WEEKDAY_OFFSET) % 7


func get_weekday_name() -> String:
	return WEEKDAY_NAMES[get_weekday_index()]


func get_month_name() -> String:
	return MONTH_NAMES[month_index]


## Return the full date string, e.g. "Thursday, January 1, 2026".
func get_date_display() -> String:
	return "%s, %s %d, %d" % [get_weekday_name(), get_month_name(), day_of_month, year]


func advance_day() -> void:
	journey_day += 1
	_advance_calendar_day()
	day_changed.emit(journey_day, get_weekday_name(), get_month_name(), year, day_of_month)
	stats_changed.emit(sanity, money)


## Advance the real calendar by one day (handles month/year rollover).
func _advance_calendar_day() -> void:
	day_of_month += 1
	var max_day: int = DAYS_IN_MONTH[month_index]
	if month_index == 1 and _is_leap_year(year):
		max_day = 29
	if day_of_month > max_day:
		day_of_month = 1
		month_index += 1
		if month_index >= 12:
			month_index = 0
			year += 1


func _is_leap_year(y: int) -> bool:
	return (y % 4 == 0 and y % 100 != 0) or (y % 400 == 0)


## Returns true if rent was charged this action (Sunday).
func apply_rent_if_sunday() -> bool:
	if get_weekday_index() != 6:
		return false  # Not Sunday
	# Only charge once per Sunday — use day_of_month to track
	if _last_rent_day_of_month == day_of_month:
		return false
	_last_rent_day_of_month = day_of_month
	money = maxf(money - RENT_AMOUNT, 0.0)
	stats_changed.emit(sanity, money)
	return true


func apply_location_action(location: String) -> void:
	match location:
		"spiritual_community":
			sanity = minf(sanity + SANITY_GAIN, MAX_STAT)
			money = maxf(money - MONEY_LOSS, 0.0)
			consecutive_bar_days = 0
		"bar":
			money = minf(money + MONEY_GAIN, MAX_STAT)
			sanity = maxf(sanity - SANITY_LOSS, 0.0)
			consecutive_bar_days += 1
	last_location_visited = location
	stats_changed.emit(sanity, money)


func apply_event_deltas(sanity_delta: float, money_delta: float) -> void:
	sanity = clampf(sanity + sanity_delta, 0.0, MAX_STAT)
	money = clampf(money + money_delta, 0.0, MAX_STAT)
	stats_changed.emit(sanity, money)


func check_game_over() -> bool:
	if game_over:
		return true
	if sanity <= 0.0:
		game_over = true
		game_over_triggered.emit("Your sanity has crumbled. The spiritual path was neglected too long.")
		return true
	if money <= 0.0:
		game_over = true
		game_over_triggered.emit("You're broke. The bills pile up and you can't sustain the community.")
		return true
	return false


func add_history(entry: String) -> void:
	recent_history.push_front(entry)
	if recent_history.size() > 5:
		recent_history.pop_back()
	history_updated.emit(entry)


## Return the current season as a string.
func get_season() -> String:
	match month_index:
		11, 0, 1:
			return "Winter"
		2, 3, 4:
			return "Spring"
		5, 6, 7:
			return "Summer"
		8, 9, 10:
			return "Autumn"
	return "Unknown"


## Return a mood descriptor based on current stats.
func get_mood() -> String:
	if sanity < 25.0 and money < 25.0:
		return "Everything feels precarious. The walls are closing in."
	if sanity < 25.0:
		return "Your spirit is fraying. You need to return to the community."
	if money < 25.0:
		return "The bills are piling up. Financial pressure weighs heavily."
	if sanity > 80.0 and money > 80.0:
		return "Life feels balanced and full of possibility."
	if sanity > 80.0:
		return "Your spirit soars. The community work is deeply fulfilling."
	if money > 80.0:
		return "Financially comfortable, but the soul needs tending too."
	return "You are managing. Not thriving, but surviving."


func get_character_names() -> Array[String]:
	var names: Array[String] = []
	for p in character_profiles:
		if p.id != StringName("leon"):  # exclude protagonist from friend visits
			names.append(p.display_name)
	return names


func get_all_characters() -> Array[CharacterProfile]:
	return character_profiles.duplicate()
