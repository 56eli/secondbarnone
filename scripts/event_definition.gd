class_name EventDefinition
extends Resource

enum Category { SPIRITUAL, FINANCIAL, BAR, COMMUNITY, BURNOUT, FRIEND, RENT }

enum Rarity { STANDARD, RARE_HELPFUL, RARE_HURTFUL }

@export var id: StringName
@export var title: String
@export var description: String
@export var category: Category = Category.SPIRITUAL
@export var rarity: Rarity = Rarity.STANDARD
@export var sanity_delta: float = 0.0
@export var money_delta: float = 0.0
@export var weight: float = 1.0

# Optional constraints
@export var required_location: String = ""          # empty = any location
@export var minimum_day: int = 1                    # first day this can appear
@export var allowed_weekdays: Array[int] = []       # empty = any weekday (0=Mon..6=Sun)
@export var required_character: String = ""         # empty = no character needed
@export var is_rent_event: bool = false             # flag for rent scheduling

## Human-readable name for the rarity value.
static func rarity_name(r: Rarity) -> String:
    match r:
        Rarity.STANDARD:
            return "Common"
        Rarity.RARE_HELPFUL:
            return "Rare (Helpful)"
        Rarity.RARE_HURTFUL:
            return "Rare (Hurtful)"
    return ""
