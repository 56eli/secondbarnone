extends "res://scripts/locations/location_base.gd"


func _ready() -> void:
	super._ready()

	# Load background texture
	var bg_path := "res://assets/backgrounds/bar.png"
	if ResourceLoader.exists(bg_path):
		background_texture = load(bg_path)

	action_btn.pressed.connect(_on_action_pressed)
	back_btn.pressed.connect(_on_back_pressed)

	location_name_label.text = "The Bar"
	location_desc_label.text = "A dimly lit bar with worn wooden counters and amber glow. The clink of glasses and murmur of conversation fill the warm, smoky air."
	action_btn.text = "🍻 Work a Shift
(+12 Money, -12 Sanity)"


func _on_action_pressed() -> void:
	if did_action:
		return
	did_action = true
	action_btn.disabled = true
	location_action_performed.emit("bar")


func _on_back_pressed() -> void:
	if did_action:
		return
	go_back.emit()
