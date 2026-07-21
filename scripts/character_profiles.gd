extends Control

signal back_to_hub()

@onready var char_list_vbox: VBoxContainer = %CharListVBox
@onready var detail_panel: Panel = %DetailPanel
@onready var detail_name: Label = %DetailName
@onready var detail_role: Label = %DetailRole
@onready var detail_bio: Label = %DetailBio
@onready var detail_relationship: Label = %DetailRelationship
@onready var detail_location: Label = %DetailLocation
@onready var back_btn: Button = %BackBtn

var _char_buttons: Array[Button] = []


func _ready() -> void:
	back_btn.pressed.connect(_on_back_pressed)


func set_characters(chars: Array[CharacterProfile]) -> void:
	# Clear existing buttons if re-populating
	for c in _char_buttons:
		if is_instance_valid(c):
			c.queue_free()
	_char_buttons.clear()
	for child in char_list_vbox.get_children():
		char_list_vbox.remove_child(child)
		child.queue_free()
	_populate_character_list(chars)


func _populate_character_list(characters: Array[CharacterProfile]) -> void:

	for char_profile in characters:
		var hbox := HBoxContainer.new()
		hbox.size_flags_horizontal = 3
		hbox.add_theme_constant_override("separation", 8)

		# Portrait container: TextureRect + initials label overlay
		var portrait_container := Control.new()
		portrait_container.custom_minimum_size = Vector2(32, 32)

		var portrait_texture_rect := TextureRect.new()
		portrait_texture_rect.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		portrait_texture_rect.visible = char_profile.portrait != null
		if char_profile.portrait:
			portrait_texture_rect.texture = char_profile.portrait
		portrait_container.add_child(portrait_texture_rect)
		portrait_texture_rect.set_anchors_and_offsets_preset(PRESET_FULL_RECT)

		var portrait_fallback_label := Label.new()
		portrait_fallback_label.visible = char_profile.portrait == null
		portrait_fallback_label.custom_minimum_size = Vector2(32, 32)
		portrait_fallback_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		portrait_fallback_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		portrait_fallback_label.add_theme_font_size_override("font_size", 14)
		portrait_fallback_label.add_theme_color_override("font_color", Color(0.8, 0.8, 0.8, 1))
		var initials: String = _get_initials(char_profile.display_name)
		portrait_fallback_label.text = initials
		portrait_container.add_child(portrait_fallback_label)
		portrait_fallback_label.set_anchors_and_offsets_preset(PRESET_FULL_RECT)

		# Name + role label
		var info_label := Label.new()
		info_label.size_flags_horizontal = 3
		var role_text: String = "Protagonist" if char_profile.role == CharacterProfile.Role.PROTAGONIST else "Side Character"
		info_label.text = "%s — %s" % [char_profile.display_name, role_text]
		info_label.add_theme_font_size_override("font_size", 14)
		info_label.add_theme_color_override("font_color", Color(0.85, 0.85, 0.85, 1))

		# Click button (transparent, covers row)
		var row_btn := Button.new()
		row_btn.flat = true
		row_btn.size_flags_horizontal = 3
		row_btn.add_theme_font_size_override("font_size", 1)
		row_btn.add_theme_color_override("font_color", Color(0, 0, 0, 0))
		row_btn.custom_minimum_size = Vector2(0, 36)
		row_btn.pressed.connect(_on_character_selected.bind(char_profile))

		# Layer: bg + hbox on top, then transparent button on top of both
		var bg := ColorRect.new()
		bg.color = Color(0.08, 0.08, 0.12, 1)
		bg.anchor_right = 1.0
		bg.anchor_bottom = 1.0

		var row_container := Control.new()
		row_container.size_flags_horizontal = 3
		row_container.custom_minimum_size = Vector2(0, 36)

		bg.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
		row_container.add_child(bg)
		hbox.add_child(portrait_container)
		hbox.add_child(info_label)
		row_container.add_child(hbox)
		row_container.add_child(row_btn)
		row_btn.set_anchors_and_offsets_preset(PRESET_FULL_RECT)

		char_list_vbox.add_child(row_container)
		_char_buttons.append(row_btn)


func _on_character_selected(profile: CharacterProfile) -> void:
	detail_panel.visible = true
	detail_name.text = profile.display_name

	match profile.role:
		CharacterProfile.Role.PROTAGONIST:
			detail_role.text = "Protagonist"
		CharacterProfile.Role.SIDE_CHARACTER:
			detail_role.text = "Side Character"

	detail_bio.text = profile.short_bio
	detail_relationship.text = "Relationship to Léon: %s" % profile.relationship_to_leon
	detail_location.text = "Location: %s" % profile.default_location

	# Scroll to detail panel
	detail_panel.size_flags_vertical = 0


func _on_back_pressed() -> void:
	back_to_hub.emit()


func _get_initials(display_name: String) -> String:
	if display_name.is_empty():
		return "?"
	var parts := display_name.split(" ", false)
	var initials := ""
	for part in parts:
		if not part.is_empty():
			initials += part[0]
	return initials.to_upper()
