# Portrait Images

Place character portrait images in this directory.

## Naming convention

Use the character's lowercase ID with a `.png` extension.
Example: `leon.png`, `geo.png`, `lakshay.png`, etc.

## Recommended size

- 96×96 pixels for the character list
- Square aspect ratio (1:1)
- Pixel art or simple vector portraits

## Usage

In the CharacterProfiles scene, each profile displays the portrait assigned
via the `portrait` field of the `CharacterProfile` resource. Portraits are
shown in the character list. If no portrait is assigned, a fallback with the
character's initials is displayed.
