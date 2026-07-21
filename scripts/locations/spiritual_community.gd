extends "res://scripts/locations/location_base.gd"
# class_name not used — loaded via PackedScene


func _ready() -> void:
	super._ready()

	action_btn.pressed.connect(_on_action_pressed)
	back_btn.pressed.connect(_on_back_pressed)

	location_name_label.text = "Spiritual Community"
	location_desc_label.text = "A peaceful space for meditation, connection, and spiritual growth."
	action_btn.text = "🧘 Meditate & Connect\n(+15 Sanity, -10 Money)"


func _on_action_pressed() -> void:
	if did_action:
		return
	did_action = true
	action_btn.disabled = true
	location_action_performed.emit("spiritual_community")


func _on_back_pressed() -> void:
	if did_action:
		return
	go_back.emit()
