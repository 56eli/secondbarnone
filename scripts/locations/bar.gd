extends "res://scripts/locations/location_base.gd"
# class_name not used — loaded via PackedScene


func _ready() -> void:
	super._ready()

	action_btn.pressed.connect(_on_action_pressed)
	back_btn.pressed.connect(_on_back_pressed)

	location_name_label.text = "The Bar"
	location_desc_label.text = "A dimly lit bar where the drinks flow and the tips keep the bills paid."
	action_btn.text = "🍺 Work a Shift\n(+12 Money, -12 Sanity)"


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
