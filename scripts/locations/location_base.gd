class_name LocationBase
extends Control

## Base class for location scenes. Provides shared signal interface,
## background-switching, particle effects, and ambient overlay.

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
@onready var particles_container: Control = %ParticlesContainer

var did_action: bool = false
var _particle_timer: Timer
var _particles: Array[ColorRect] = []


func _ready() -> void:
	if background_texture:
		background_texture_node.texture = background_texture
		background_texture_node.visible = true
		background_fallback.visible = false
	else:
		background_texture_node.visible = false
		background_fallback.visible = true

	_start_particles()


func reset_action_state() -> void:
	did_action = false
	action_btn.disabled = false


func _start_particles() -> void:
	# Create floating particle effect
	_particle_timer = Timer.new()
	_particle_timer.wait_time = 0.8 + randf() * 1.2
	_particle_timer.one_shot = false
	_particle_timer.timeout.connect(_spawn_particle)
	add_child(_particle_timer)
	_particle_timer.start()


func _spawn_particle() -> void:
	if not is_inside_tree():
		return

	var p := ColorRect.new()
	var size: float = randf_range(2.0, 5.0)
	p.custom_minimum_size = Vector2(size, size)
	p.size = Vector2(size, size)
	p.color = Color(1.0, 1.0, 1.0, randf_range(0.08, 0.2))
	p.position = Vector2(randf_range(0, size.x * 200), size.y * 130)
	p.mouse_filter = Control.MOUSE_FILTER_IGNORE

	particles_container.add_child(p)
	_particles.append(p)

	# Float upward and fade
	var tween := create_tween()
	tween.set_parallel(true)
	tween.tween_property(p, "position:y", -30.0, 3.0 + randf() * 2.0).set_ease(Tween.EASE_OUT)
	tween.tween_property(p, "modulate:a", 0.0, 3.0 + randf() * 2.0).set_ease(Tween.EASE_IN)
	tween.tween_callback(func():
		if is_instance_valid(p):
			p.queue_free()
		_particles.erase(p)
	)


func _exit_tree() -> void:
	if _particle_timer:
		_particle_timer.stop()
