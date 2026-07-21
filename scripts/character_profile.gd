class_name CharacterProfile
extends Resource

enum Role { PROTAGONIST, SIDE_CHARACTER }

@export var id: StringName
@export var display_name: String
@export var role: Role = Role.SIDE_CHARACTER
@export var short_bio: String = "Biography to be written."
@export var relationship_to_leon: String = "Relationship to Léon to be defined."
@export var default_location: String = "Location not yet assigned."
@export var portrait: Texture2D
@export var notes: String = ""
@export var unlocked: bool = true
