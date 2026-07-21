class_name CharacterData
extends Node

## Returns an array of all CharacterProfile resources for the game.
## Call this once from GameState to build the character database.

static func create_all_profiles() -> Array[CharacterProfile]:
	var profiles: Array[CharacterProfile] = []

	# Protagonist
	profiles.append(_make_profile("leon", "Léon", CharacterProfile.Role.PROTAGONIST,
		"The protagonist of Balance of Spirit. Runs a spiritual community.", "Self."))

	# Side characters — all use neutral placeholders per specification
	profiles.append(_make_profile("geo", "Geo", CharacterProfile.Role.SIDE_CHARACTER))
	profiles.append(_make_profile("lakshay", "Lakshay", CharacterProfile.Role.SIDE_CHARACTER))
	profiles.append(_make_profile("arian", "Arian", CharacterProfile.Role.SIDE_CHARACTER))
	profiles.append(_make_profile("simon", "Simon", CharacterProfile.Role.SIDE_CHARACTER))
	profiles.append(_make_profile("kaj", "Kaj", CharacterProfile.Role.SIDE_CHARACTER))
	profiles.append(_make_profile("dorian", "Dorian", CharacterProfile.Role.SIDE_CHARACTER))
	profiles.append(_make_profile("barret", "Barret", CharacterProfile.Role.SIDE_CHARACTER))
	profiles.append(_make_profile("ethan", "Ethan", CharacterProfile.Role.SIDE_CHARACTER))
	profiles.append(_make_profile("matt", "Matt", CharacterProfile.Role.SIDE_CHARACTER))
	profiles.append(_make_profile("artem", "Artem", CharacterProfile.Role.SIDE_CHARACTER))
	profiles.append(_make_profile("klaudia", "Klaudia", CharacterProfile.Role.SIDE_CHARACTER))
	profiles.append(_make_profile("brian", "Brian", CharacterProfile.Role.SIDE_CHARACTER))
	profiles.append(_make_profile("susan", "Susan", CharacterProfile.Role.SIDE_CHARACTER))

	return profiles


static func _make_profile(
	id: String,
	display_name: String,
	role: CharacterProfile.Role,
	bio: String = "Biography to be written.",
	relationship: String = "Relationship to Léon to be defined."
) -> CharacterProfile:
	var p := CharacterProfile.new()
	p.id = StringName(id)
	p.display_name = display_name
	p.role = role
	p.short_bio = bio
	p.relationship_to_leon = relationship
	p.default_location = "Location not yet assigned."
	return p
