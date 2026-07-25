extends Control

signal visit_location(location: String)
signal open_characters()

@onready var spiritual_btn: Button = %SpiritualBtn
@onready var bar_btn: Button = %BarBtn
@onready var characters_btn: Button = %CharactersBtn
@onready var history_label: Label = %HistoryLabel
@onready var hub_sanity_label: Label = %HubSanityLabel
@onready var hub_money_label: Label = %HubMoneyLabel
@onready var day_label: Label = %DayLabel
@onready var mood_label: Label = %MoodLabel
@onready var hub_background: TextureRect = %HubBackground

var _gs = null


func _ready() -> void:
	spiritual_btn.pressed.connect(_on_spiritual_pressed)
	bar_btn.pressed.connect(_on_bar_pressed)
	characters_btn.pressed.connect(_on_characters_pressed)

	# Try to load hub background
	var bg_path := "res://assets/backgrounds/hub_background.svg"
	if ResourceLoader.exists(bg_path):
		hub_background.texture = load(bg_path)


func _on_spiritual_pressed() -> void:
	visit_location.emit("spiritual_community")


func _on_bar_pressed() -> void:
	visit_location.emit("bar")


func _on_characters_pressed() -> void:
	open_characters.emit()


func update_history(entries: Array[String]) -> void:
	if entries.is_empty():
		history_label.text = "Recent History:\n-"
		return
	var text: String = "Recent History:\n"
	for entry in entries:
		text += "  " + entry + "\n"
	history_label.text = text


func refresh_stats(gs) -> void:
	_gs = gs
	if not _gs:
		return
	day_label.text = "%s  |  Journey Day %d" % [_gs.get_date_display(), _gs.journey_day]

	# Show season and mood
	var season: String = _gs.get_season()
	var mood: String = _gs.get_mood()
	mood_label.text = "%s  |  %s" % [season, mood]

	var s: float = _gs.sanity
	var m: float = _gs.money
	hub_sanity_label.text = "🧘 Sanity: %d / %d" % [int(s), int(_gs.MAX_STAT)]
	hub_money_label.text = "💰 Money: %d / %d" % [int(m), int(_gs.MAX_STAT)]

	if s < 25.0:
		hub_sanity_label.add_theme_color_override("font_color", Color(1.0, 0.3, 0.3))
	else:
		hub_sanity_label.add_theme_color_override("font_color", Color(1.0, 1.0, 1.0))

	if m < 25.0:
		hub_money_label.add_theme_color_override("font_color", Color(1.0, 0.3, 0.3))
	else:
		hub_money_label.add_theme_color_override("font_color", Color(1.0, 1.0, 1.0))
