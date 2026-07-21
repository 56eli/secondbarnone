extends Control

signal visit_location(location: String)
signal open_characters()

@onready var spiritual_btn: Button = %SpiritualBtn
@onready var bar_btn: Button = %BarBtn
@onready var characters_btn: Button = %CharactersBtn
@onready var history_label: Label = %HistoryLabel

func _ready() -> void:
	spiritual_btn.pressed.connect(_on_spiritual_pressed)
	bar_btn.pressed.connect(_on_bar_pressed)
	characters_btn.pressed.connect(_on_characters_pressed)


func _on_spiritual_pressed() -> void:
	visit_location.emit("spiritual_community")


func _on_bar_pressed() -> void:
	visit_location.emit("bar")


func _on_characters_pressed() -> void:
	open_characters.emit()


func update_history(entries: Array[String]) -> void:
	if entries.is_empty():
		history_label.text = "Recent History:\n—"
		return
	var text: String = "Recent History:\n"
	for entry in entries:
		text += "• " + entry + "\n"
	history_label.text = text
