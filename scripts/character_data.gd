class_name CharacterData
extends Node

## Returns an array of all CharacterProfile resources for the game.
## Call this once from GameState to build the character database.

static func create_all_profiles() -> Array[CharacterProfile]:
	var profiles: Array[CharacterProfile] = []

	# Protagonist
	profiles.append(_make_profile("leon", "Léon", CharacterProfile.Role.PROTAGONIST,
		"A former office worker who left the corporate world behind to found a spiritual community. Léon seeks balance between inner peace and the practical demands of keeping the lights on. He tends bar by night to fund his true calling.",
		"Self.",
		"Spiritual Community & The Bar"))

	# Spiritual Community Members
	profiles.append(_make_profile("geo", "Geo", CharacterProfile.Role.SIDE_CHARACTER,
		"An elderly sage who was one of the first to join Léon's community. Geo spent decades traveling the world studying meditation techniques. His quiet wisdom and gentle humor ground the community when tensions rise.",
		"Geo is Léon's mentor and closest confidant. He sees in Léon the same restless searching he felt in his own youth.",
		"Spiritual Community"))

	profiles.append(_make_profile("lakshay", "Lakshay", CharacterProfile.Role.SIDE_CHARACTER,
		"A warm-hearted community member who manages the daily logistics: cooking, supplies, and schedules. Lakshay's practical skills keep the community running smoothly while his infectious optimism lifts everyone's spirits.",
		"Lakshay looks up to Léon as a leader and often brings him chai during long meditation sessions.",
		"Spiritual Community"))

	profiles.append(_make_profile("arian", "Arian", CharacterProfile.Role.SIDE_CHARACTER,
		"A charismatic and sometimes skeptical member who pushes the community to evolve. Arian believes spirituality should engage with the modern world, not retreat from it. His debates keep the community intellectually honest.",
		"Arian and Léon have a productive but occasionally tense relationship. Arian challenges Léon's decisions, but always with the community's best interests at heart.",
		"Spiritual Community"))

	profiles.append(_make_profile("simon", "Simon", CharacterProfile.Role.SIDE_CHARACTER,
		"A weathered veteran of intentional communities, Simon has seen dozens of utopian projects rise and fall. He brings hard-earned realism about what makes communities last or collapse.",
		"Simon respects Léon's vision but isn't shy about pointing out when idealism blinds him to practical realities.",
		"Spiritual Community"))

	profiles.append(_make_profile("kaj", "Kaj", CharacterProfile.Role.SIDE_CHARACTER,
		"A quiet artist who found in the community a canvas for spiritual expression. Kaj paints mandalas and leads visual meditation workshops. Their art adorns the community hall walls.",
		"Kaj is deeply grateful to Léon for creating a space where creativity and spirituality intertwine.",
		"Spiritual Community"))

	# Bar Regulars
	profiles.append(_make_profile("dorian", "Dorian", CharacterProfile.Role.SIDE_CHARACTER,
		"A silver-tongued regular at the bar who claims to have been everything from a jazz pianist to a diamond smuggler. Nobody knows which stories are true, but they are always worth hearing.",
		"Dorian treats Léon as a kindred spirit, another soul navigating the space between who they were and who they want to be.",
		"The Bar"))

	profiles.append(_make_profile("barret", "Barret", CharacterProfile.Role.SIDE_CHARACTER,
		"The bar's owner, a burly warm-hearted man who gave Léon a job when he needed it most. Barret runs the bar like a family, remembering every regular's name and drink.",
		"Barret is like a father figure to Léon. He doesn't fully understand the spiritual community thing, but he respects Léon's dedication.",
		"The Bar"))

	profiles.append(_make_profile("ethan", "Ethan", CharacterProfile.Role.SIDE_CHARACTER,
		"A young college student who works part-time at the bar. Ethan is bright-eyed and curious about everything, including Léon's double life. He has started attending meditation sessions on weekends.",
		"Ethan sees Léon as a mentor figure and is increasingly drawn to the idea of a more meaningful life.",
		"The Bar & Spiritual Community"))

	profiles.append(_make_profile("matt", "Matt", CharacterProfile.Role.SIDE_CHARACTER,
		"A laid-back surfer-turned-bartender who works the weekend shifts. Matt's philosophy is simple: good waves, good drinks, good people. His effortless calm is contagious.",
		"Matt and Léon share a relaxed friendship. Matt doesn't need to understand the spiritual stuff to be a loyal friend.",
		"The Bar"))

	profiles.append(_make_profile("artem", "Artem", CharacterProfile.Role.SIDE_CHARACTER,
		"A sharp-dressed businessman who comes to the bar to escape the boardroom. Artem secretly envies Léon's courage to walk away from corporate life, though he would never admit it.",
		"Artem and Léon have fascinating conversations about money, meaning, and the cost of ambition.",
		"The Bar"))

	# Bridge Characters (move between both worlds)
	profiles.append(_make_profile("klaudia", "Klaudia", CharacterProfile.Role.SIDE_CHARACTER,
		"A musician who plays at both the community's evening gatherings and the bar's open mic nights. Klaudia's songs bridge the two worlds, carrying themes of longing, peace, and resilience.",
		"Klaudia and Léon share a deep creative bond. She understands the tension between his two lives better than anyone.",
		"Spiritual Community & The Bar"))

	profiles.append(_make_profile("brian", "Brian", CharacterProfile.Role.SIDE_CHARACTER,
		"A former finance guy who burned out and found his way to Léon's community. Brian now helps manage the community's modest finances and occasionally bartends. He is proof that transformation is possible.",
		"Brian sees his own past in Léon's current struggle and offers financial advice born of hard experience.",
		"Spiritual Community & The Bar"))

	profiles.append(_make_profile("susan", "Susan", CharacterProfile.Role.SIDE_CHARACTER,
		"A nurse by day and spiritual seeker by night. Susan brings medical knowledge to the community and a healing presence wherever she goes. She is the person everyone calls when someone is sick or struggling.",
		"Susan is one of Léon's most trusted friends. She is the steady, nurturing presence that both the community and the bar staff rely on.",
		"Spiritual Community & The Bar"))

	return profiles


static func _make_profile(
	id: String,
	display_name: String,
	role: CharacterProfile.Role,
	bio: String = "Biography to be written.",
	relationship: String = "Relationship to Léon to be defined.",
	location: String = "Location not yet assigned."
) -> CharacterProfile:
	var p := CharacterProfile.new()
	p.id = StringName(id)
	p.display_name = display_name
	p.role = role
	p.short_bio = bio
	p.relationship_to_leon = relationship
	p.default_location = location

	# Load portrait texture if available
	var portrait_paths: Array[String] = [
		"res://assets/portraits/%s.png" % id,
		"res://assets/portraits/%s.svg" % id,
	]
	for path in portrait_paths:
		if ResourceLoader.exists(path):
			p.portrait = load(path)
			break

	return p
