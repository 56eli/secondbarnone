# Background Images

Place location background images in this directory.

## Expected files and recommended sizes

| Scene                | Suggested filename          | Size   | Notes                          |
|----------------------|-----------------------------|--------|--------------------------------|
| Spiritual Community  | `spiritual_community.png`   | 800×600 | Interior, warm/calm aesthetic  |
| Bar                  | `bar.png`                   | 800×600 | Dim/atmospheric aesthetic      |

## Usage

In each location scene, assign the texture to the `BackgroundTexture` TextureRect node
via the editor inspector. Set stretch_mode to `keep_aspect_covered` and adjust the
Rect2 offset values if needed for 800×600 or 16:9 displays.
