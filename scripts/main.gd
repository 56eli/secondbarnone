extends Control

## Main controller. Manages scene-switching via ContentHost,
## persistent HUD updates with animated stat bars, result modals
## with stat-delta animations, scene fade transitions, and game-over overlay.

const HUB_SCENE: PackedScene = preload("res://scenes/hub.tscn")
const SPIRITUAL_SCENE: PackedScene = preload("res://scenes/locations/spiritual_community.tscn")
const BAR_SCENE: PackedScene = preload("res://scenes/locations/bar.tscn")
const CHARACTER_SCENE: PackedScene = preload("res://scenes/characters/character_profiles.tscn")

# Transition durations
const FADE_DURATION: float = 0.35
const BAR_ANIM_DURATION: float = 0.5

@onready var hud: Control = %HUD
@onready var calendar_label: Label = %CalendarLabel
@onready var day_progress_label: Label = %DayProgressLabel
@onready var sanity_label: Label = %SanityLabel
@onready var money_label: Label = %MoneyLabel
@onready var sanity_bar: ProgressBar = %SanityBar
@onready var money_bar: ProgressBar = %MoneyBar
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
@onready var fade_overlay: ColorRect = %FadeOverlay
@onready var sanity_delta_label: Label = %SanityDeltaLabel
@onready var money_delta_label: Label = %MoneyDeltaLabel

var _current_location_scene = null
var _current_hub_scene = null
var _current_characters_scene = null
var _event_manager: EventManager = null
var _action_applied: bool = false
var _GS
var _fade_tween: Tween

# Track previous values for delta display
var _prev_sanity: float = 50.0
var _prev_money: float = 50.0


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

	# Set up stat bar max values
	sanity_bar.max_value = _GS.MAX_STAT
	money_bar.max_value = _GS.MAX_STAT
	sanity_bar.value = _GS.sanity
	money_bar.value = _GS.money

	# Start with fade in
	fade_overlay.modulate.a = 1.0
	show_hud()
	update_hud()
	_show_hub()
	_fade_in()


func _fade_in() -> void:
	if _fade_tween and _fade_tween.is_valid():
		_fade_tween.kill()
	_fade_tween = create_tween()
	_fade_tween.tween_property(fade_overlay, "modulate:a", 0.0, FADE_DURATION)


func _fade_out(callback: Callable) -> void:
	if _fade_tween and _fade_tween.is_valid():
		_fade_tween.kill()
	_fade_tween = create_tween()
	_fade_tween.tween_property(fade_overlay, "modulate:a", 1.0, FADE_DURATION)
	_fade_tween.tween_callback(callback)


func _show_hub() -> void:
	_clear_content()
	var hub = HUB_SCENE.instantiate()
	content_host.add_child(hub)
	_current_hub_scene = hub
	hub.visit_location.connect(_on_hub_visit_location)
	hub.open_characters.connect(_on_hub_open_characters)
	hub.update_history(_GS.recent_history)
	hub.refresh_stats(_GS)
	show_hud()
	_fade_in()


func _on_hub_visit_location(location: String) -> void:
	_fade_out(func():
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
		_fade_in()
	)


func _on_location_back() -> void:
	_fade_out(func():
		if _current_location_scene:
			_current_location_scene.queue_free()
			_current_location_scene = null
		_show_hub()
	)


func _on_location_action(location: String) -> void:
	if _action_applied:
		return
	_action_applied = true

	# Track previous stats for delta display
	_prev_sanity = _GS.sanity
	_prev_money = _GS.money

	var action_desc: String = ""
	match location:
		"spiritual_community":
			_GS.apply_location_action("spiritual_community")
			action_desc = "You spent the day meditating and connecting with your spiritual community. Sanity restored, but donations cost you."
		"bar":
			_GS.apply_location_action("bar")
			action_desc = "You worked a shift at the bar. The tips are good, but the late nights are wearing on your spirit."

	# Step 2: Sunday rent (before random event)
	var rent_charged: bool = _GS.apply_rent_if_sunday()

	# Step 3: Scheduled random location event
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

	# Step 4-5: Check game-over
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

	# Animate stat bars
	_animate_stat_bars()
	update_hud()


func _animate_stat_bars() -> void:
	var tween := create_tween()
	tween.set_parallel(true)
	tween.tween_property(sanity_bar, "value", _GS.sanity, BAR_ANIM_DURATION).set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_CUBIC)
	tween.tween_property(money_bar, "value", _GS.money, BAR_ANIM_DURATION).set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_CUBIC)


func _show_result_modal(action_desc: String, event: EventDefinition, rent_charged: bool) -> void:
	modal_action_text.text = action_desc

	var event_occurred: bool = event != null
	modal_event_rarity.visible = event_occurred
	modal_event_title.visible = event_occurred
	modal_event_desc.visible = event_occurred

	if event_occurred:
		var rarity_color := Color(0.6, 0.85, 0.6)
		match event.rarity:
			EventDefinition.Rarity.RARE_HELPFUL:
				rarity_color = Color(0.4, 0.9, 0.5)
			EventDefinition.Rarity.RARE_HURTFUL:
				rarity_color = Color(0.95, 0.4, 0.4)
		modal_event_rarity.add_theme_color_override("font_color", rarity_color)
		modal_event_rarity.text = "[ %s ]" % EventDefinition.rarity_name(event.rarity)
		modal_event_title.text = event.title
		modal_event_desc.text = event.description
		if rent_charged:
			modal_event_desc.text += "\n\n(Also paid rent: -%d money)" % _GS.RENT_AMOUNT

	# Calculate deltas
	var sanity_delta: float = _GS.sanity - _prev_sanity
	var money_delta: float = _GS.money - _prev_money

	# Show stat summary with deltas
	var sanity_sign := "+" if sanity_delta >= 0 else ""
	var money_sign := "+" if money_delta >= 0 else ""
	modal_stats_label.text = "Sanity: %d / %d  (%s%d)  |  Money: %d / %d  (%s%d)" % [
		int(_GS.sanity), int(_GS.MAX_STAT), sanity_sign, int(sanity_delta),
		int(_GS.money), int(_GS.MAX_STAT), money_sign, int(money_delta)
	]

	# Flash delta indicators
	_show_stat_delta(sanity_delta_label, sanity_delta)
	_show_stat_delta(money_delta_label, money_delta)

	result_modal.visible = true
	modal_continue_btn.disabled = false

	# Animate modal in
	result_modal.modulate.a = 0.0
	var tween := create_tween()
	tween.tween_property(result_modal, "modulate:a", 1.0, 0.25)


func _show_stat_delta(label: Label, delta: float) -> void:
	if delta == 0:
		label.visible = false
		return
	label.visible = true
	var sign := "+" if delta >= 0 else ""
	label.text = "%s%d" % [sign, int(delta)]
	if delta >= 0:
		label.add_theme_color_override("font_color", Color(0.4, 0.9, 0.5))
	else:
		label.add_theme_color_override("font_color", Color(0.95, 0.4, 0.4))

	# Animate: float up and fade
	label.modulate.a = 1.0
	label.position.y = 0
	var tween := create_tween()
	tween.set_parallel(true)
	tween.tween_property(label, "position:y", -30.0, 1.0).set_ease(Tween.EASE_OUT)
	tween.tween_property(label, "modulate:a", 0.0, 1.0).set_delay(0.3)


func _on_modal_continue() -> void:
	result_modal.visible = false
	_action_applied = false
	_GS.advance_day()

	if _current_location_scene:
		_current_location_scene.queue_free()
		_current_location_scene = null
	# Fade to hub
	_fade_out(func():
		_show_hub()
	)


func _on_hub_open_characters() -> void:
	_fade_out(func():
		var chars = CHARACTER_SCENE.instantiate()
		_clear_content()
		content_host.add_child(chars)
		_current_characters_scene = chars
		chars.back_to_hub.connect(_on_characters_back)
		chars.set_characters(_GS.get_all_characters())
		_fade_in()
	)


func _on_characters_back() -> void:
	_fade_out(func():
		if _current_characters_scene:
			_current_characters_scene.queue_free()
			_current_characters_scene = null
		_show_hub()
	)


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

	# Update stat bars (without animation for regular updates)
	sanity_bar.value = s
	money_bar.value = m

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
	_prev_sanity = _GS.sanity
	_prev_money = _GS.money
	game_over_panel.visible = false
	result_modal.visible = false
	hud.visible = true
	sanity_bar.value = _GS.sanity
	money_bar.value = _GS.money
	_clear_content()
	_show_hub()
	update_hud()
