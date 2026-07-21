class_name LocationBase
extends Control

## Base class for location scenes. Provides shared signal interface
## and background-structure setup.

signal go_back()
signal location_action_performed(location: String)

@export var background_texture: Texture2D:
	set(value):
		background_texture = value
		if is_inside_tree() and %BackgroundTexture != null and %BackgroundFallback != null:
			%BackgroundTexture.texture = value
			%BackgroundTexture.visible = value != null
			%BackgroundFallback.visible = value == null

@onready var background_texture_node: TextureRect = %BackgroundTexture
@onready var background_fallback: ColorRect = %BackgroundFallback
@onready var overlay: ColorRect = %Overlay
@onready var location_name_label: Label = %LocationName
@onready var location_desc_label: Label = %LocationDesc
@onready var action_btn: Button = %ActionBtn
@onready var back_btn: Button = %BackBtn

var did_action: bool = false


func _ready() -> void:
	if background_texture:
		background_texture_node.texture = background_texture
		background_texture_node.visible = true
		background_fallback.visible = false
	else:
		background_texture_node.visible = false
		background_fallback.visible = true


func reset_action_state() -> void:
	did_action = false
	action_btn.disabled = false
