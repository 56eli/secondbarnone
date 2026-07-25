extends "res://scripts/locations/location_base.gd"


func _ready() -> void:
	super._ready()

	# Load background texture
	var bg_path := "res://assets/backgrounds/spiritual_community.png"
	if ResourceLoader.exists(bg_path):
		background_texture = load(bg_path)

	action_btn.pressed.connect(_on_action_pressed)
	back_btn.pressed.connect(_on_back_pressed)

	location_name_label.text = "Spiritual Community"
	location_desc_label.text = "A peaceful sanctuary for meditation, connection, and spiritual growth. Soft candlelight flickers as the scent of incense fills the air."
	action_btn.text = "🧘 Meditate & Connect
(+15 Sanity, -10 Money)"


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
