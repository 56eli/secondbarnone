extends Control

## Main controller. Manages scene-switching via ContentHost,
## persistent HUD updates, result modals, and game-over overlay.

const HUB_SCENE: PackedScene = preload("res://scenes/hub.tscn")
const SPIRITUAL_SCENE: PackedScene = preload("res://scenes/locations/spiritual_community.tscn")
const BAR_SCENE: PackedScene = preload("res://scenes/locations/bar.tscn")
const CHARACTER_SCENE: PackedScene = preload("res://scenes/characters/character_profiles.tscn")

@onready var hud: Control = %HUD
@onready var calendar_label: Label = %CalendarLabel
@onready var day_progress_label: Label = %DayProgressLabel
@onready var sanity_label: Label = %SanityLabel
@onready var money_label: Label = %MoneyLabel
@onready var modal_event_rarity: Label = %ModalEventRarity
@onready var content_host: Control = %ContentHost
@onready var result_modal: Control = %ResultModal
@onready var modal_title: Label = %ModalTitle
@onready var modal_action_text: Label = %ModalActionText
@onready var modal_event_title: Label = %ModalEventTitle
@onready var modal_event_desc: Label = %ModalEventDesc
@onready var modal_stats_label: Label = %ModalStatsLabel
@onready var modal_continue_btn: Button = %ModalContinueBtn
@onready var game_over_panel: Panel = %GameOverPanel
@onready var game_over_label: Label = %GameOverLabel
@onready var restart_btn: Button = %RestartBtn

var _current_location_scene = null  # LocationBase
var _current_hub_scene = null       # HubScreen
var _current_characters_scene = null # CharacterProfilesScreen
var _event_manager: EventManager = null
var _action_applied: bool = false
var _GS  # GameState node


func _ready() -> void:
	# Create GameState as a child
	_GS = load("res://scripts/game_state.gd").new()
	add_child(_GS)
	_GS.name = "GameState"

	_event_manager = EventManager.new()
	add_child(_event_manager)
	_event_manager.initialize(_GS.get_character_names())

	_GS.stats_changed.connect(_on_stats_changed)
	_GS.day_changed.connect(_on_day_changed)
	_GS.game_over_triggered.connect(_on_game_over)
	_GS.history_updated.connect(_on_history_updated)

	modal_continue_btn.pressed.connect(_on_modal_continue)
	restart_btn.pressed.connect(_on_restart_pressed)

	show_hud()
	update_hud()
	_show_hub()


func _show_hub() -> void:
	_clear_content()
	var hub = HUB_SCENE.instantiate()
	content_host.add_child(hub)
	_current_hub_scene = hub
	hub.visit_location.connect(_on_hub_visit_location)
	hub.open_characters.connect(_on_hub_open_characters)
	hub.update_history(_GS.recent_history)
	show_hud()


func _on_hub_visit_location(location: String) -> void:
	var scene = null
	match location:
		"spiritual_community":
			scene = SPIRITUAL_SCENE.instantiate()
		"bar":
			scene = BAR_SCENE.instantiate()

	if scene:
		_clear_content()
		content_host.add_child(scene)
		_current_location_scene = scene
		scene.go_back.connect(_on_location_back)
		scene.location_action_performed.connect(_on_location_action)


func _on_location_back() -> void:
	if _current_location_scene:
		_current_location_scene.queue_free()
		_current_location_scene = null
	_show_hub()


func _on_location_action(location: String) -> void:
	if _action_applied:
		return
	_action_applied = true

	var action_desc: String = ""
	match location:
		"spiritual_community":
			_GS.apply_location_action("spiritual_community")
			action_desc = "You spent the day meditating and connecting with your spiritual community. Sanity restored, but donations cost you."
		"bar":
			_GS.apply_location_action("bar")
			action_desc = "You worked a shift at the bar. The tips are good, but the late nights are wearing on your spirit."

	# Step ②: Sunday rent (before random event)
	var rent_charged: bool = _GS.apply_rent_if_sunday()

	# Step ③: Scheduled random location event (every 2-5 journey-days)
	var selected_event: EventDefinition = null
	if not _GS.game_over:
		selected_event = _event_manager.select_event(
			_GS.journey_day,
			_GS.get_weekday_index(),
			location,
			_GS.consecutive_bar_days
		)
		if selected_event:
			_GS.apply_event_deltas(selected_event.sanity_delta, selected_event.money_delta)

	# Step ④⑤: Check game-over (sanity ≤ 0 or money ≤ 0 only — no day limit)
	var go_triggered: bool = _GS.check_game_over()

	var history_parts: Array[String] = []
	match location:
		"spiritual_community":
			history_parts.append("Visited the Spiritual Community")
		"bar":
			history_parts.append("Worked at the Bar")
	if rent_charged:
		history_parts.append("Paid rent (-%d money)" % _GS.RENT_AMOUNT)
	if selected_event:
		history_parts.append("Event: %s" % selected_event.title)
	_GS.add_history(" / ".join(history_parts))

	if not go_triggered:
		_show_result_modal(action_desc, selected_event, rent_charged)

	update_hud()


func _show_result_modal(action_desc: String, event: EventDefinition, rent_charged: bool) -> void:
	modal_action_text.text = action_desc

	var event_occurred: bool = event != null
	modal_event_rarity.visible = event_occurred
	modal_event_title.visible = event_occurred
	modal_event_desc.visible = event_occurred

	if event_occurred:
		modal_event_rarity.text = "[ %s ]" % EventDefinition.rarity_name(event.rarity)
		modal_event_title.text = event.title
		modal_event_desc.text = event.description
		if rent_charged:
			modal_event_desc.text += "\n\n(Also paid rent: -%d money)" % _GS.RENT_AMOUNT

	modal_stats_label.text = "Final: 🧘 %d / 100  |  💰 %d / 100" % [int(_GS.sanity), int(_GS.money)]

	result_modal.visible = true
	modal_continue_btn.disabled = false


func _on_modal_continue() -> void:
	result_modal.visible = false
	_action_applied = false
	_GS.advance_day()

	if _current_location_scene:
		_current_location_scene.queue_free()
		_current_location_scene = null
	_show_hub()


func _on_hub_open_characters() -> void:
	var chars = CHARACTER_SCENE.instantiate()
	_clear_content()
	content_host.add_child(chars)
	_current_characters_scene = chars
	chars.back_to_hub.connect(_on_characters_back)
	chars.set_characters(_GS.get_all_characters())


func _on_characters_back() -> void:
	if _current_characters_scene:
		_current_characters_scene.queue_free()
		_current_characters_scene = null
	_show_hub()


func _clear_content() -> void:
	for child in content_host.get_children():
		child.queue_free()
	_current_location_scene = null
	_current_hub_scene = null
	_current_characters_scene = null


func show_hud() -> void:
	hud.visible = true


func hide_hud() -> void:
	hud.visible = false


func update_hud() -> void:
	var s: float = _GS.sanity
	var m: float = _GS.money

	calendar_label.text = _GS.get_date_display()
	day_progress_label.text = "Journey Day %d" % [_GS.journey_day]

	# Sanity counter with low-stat warning
	var sanity_text: String = "🧘 Sanity: %d / %d" % [int(s), int(_GS.MAX_STAT)]
	if s < 25.0:
		sanity_label.add_theme_color_override("font_color", Color(1.0, 0.3, 0.3))
		sanity_text += " — Low sanity!"
	else:
		sanity_label.add_theme_color_override("font_color", Color(1.0, 1.0, 1.0))
	sanity_label.text = sanity_text

	var money_text: String = "💰 Money: %d / %d" % [int(m), int(_GS.MAX_STAT)]
	if m < 25.0:
		money_label.add_theme_color_override("font_color", Color(1.0, 0.3, 0.3))
		money_text += " — Low money!"
	else:
		money_label.add_theme_color_override("font_color", Color(1.0, 1.0, 1.0))
	money_label.text = money_text


func _on_stats_changed(_s: float, _m: float) -> void:
	update_hud()


func _on_day_changed(_journey_day: int, _weekday: String, _month: String, _year: int, _day_of_month: int) -> void:
	update_hud()


func _on_history_updated(_entry: String) -> void:
	if _current_hub_scene:
		_current_hub_scene.update_history(_GS.recent_history)


func _on_game_over(message: String) -> void:
	game_over_panel.visible = true
	game_over_label.text = message
	result_modal.visible = false
	hud.visible = false


func _on_restart_pressed() -> void:
	_GS.reset_game()
	_event_manager.reset()
	_action_applied = false
	game_over_panel.visible = false
	result_modal.visible = false
	hud.visible = true
	_clear_content()
	_show_hub()
	update_hud()
