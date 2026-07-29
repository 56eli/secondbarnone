# Portrait Images — v2.0 Frame-less Square Standard

**Policy (active):**
- All **new and regenerated** portraits must be **clean square PNG masters** (≥1024×1024).
- **NO baked circular frames**, vignettes, or decorative borders in the painting itself.
- **Previews** everywhere in the game (HUD, lists, hosts, events) are rendered **round** via CSS only.
- **Lightbox popup** displays the clean standardized **square** art.
- **Hard permanent exceptions** (never regenerate): `brian` and `vanna`. Their current framed masters are frozen forever.

See the full spec: `docs/ART_STANDARDIZATION_SPEC.md`

## Naming convention

Use the character's lowercase ID with a `.png` extension.
Example: `leon.png`, `geo.png`, `lakshay.png`, etc.

**Only PNG masters are accepted** for new art (v2.0).

## Master requirements (new art)

- Format: PNG (lossless)
- Size: Square, minimum 1024×1024 (recommended 1152–1400 px)
- Content: Clean square painting — no frame baked in
- No text, logos, watermarks, or UI elements

## Legacy files

- `.svg` files are deprecated procedural placeholders — should be removed.
- Old `.webp` files in this folder are legacy sources. New characters must have a `.png` master.

## Usage

Portraits are used via `createAllProfiles()` in `docs/js/data/characters.js`.
The build (`scripts/build-portraits.js`) produces:
- `docs/assets/portraits/<id>.webp` (288px thumbnails — round via CSS)
- `docs/assets/portraits/hi/<id>.webp` (896px — clean square for lightbox)
