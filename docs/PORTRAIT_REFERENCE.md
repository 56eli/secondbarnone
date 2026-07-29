# Portrait Generation Reference

**Purpose:** standard prompt template for regenerating character portraits in the house style.
**Last updated:** 2026-07-29

Edit this file freely — it is the single source of truth for the prompt used when
regenerating portraits in bulk.

---

## House style

Every portrait shares the following characteristics:

- **Warm semi-realistic oil painting**
- **Chest-up** composition
- **Circular distressed frame** — cream/beige, weathered, slightly chipped
- **Background detail** that says who the person is (their location, a tool, a setting)
- **Lighting:** warm, soft, directional — candlelight, bar lights, window glow
- **Palette:** earthy tones — amber, olive, rust, cream, with occasional pops of
  colour from clothing or background props
- **Resolution:** 896×896 (used for the hi-res lightbox tier)

---

## Prompt template

```
A warm semi-realistic oil painting portrait of a {sex} {age_descriptor} {character_name}
in a circular distressed cream frame. They are at {location_context}.
Chest-up composition. Warm directional lighting. Earthy palette with amber,
olive, and rust tones. The background shows {specific_background_detail}.
```

### Field guide

| Field | Values / guidance |
|-------|-------------------|
| `{sex}` | Male / Female / Non-human — drives facial structure, hair, clothing |
| `{age_descriptor}` | young / middle-aged / elderly — match the character's energy |
| `{character_name}` | the character's display name |
| `{location_context}` | where they are usually found (e.g. "a quiet library", "a bustling bar", "a rooftop at dusk") |
| `{specific_background_detail}` | one object or scene element that identifies them (e.g. "a stack of old books", "a cocktail shaker", "a pottery wheel", "a meditation cushion") |

---

## Non-human characters

For characters that are not human, replace the `{sex}` / `{age_descriptor}` / `{character_name}` section with the creature's description:

| Character | Type | Prompt seed |
|-----------|------|-------------|
| HawkinsTV | Robot (video camera / streaming device) | A friendly anthropomorphic video camera character with a small screen face, at a pirate radio station |
| DocBot | Robot (medical kiosk) | A vintage medical kiosk robot with a small screen face showing a neutral expression, in a community clinic |
| Carl-bot | Robot (tablet device) | A small tablet device on a wooden stand with a simple smiley face, in a meditation hall with a singing bowl |
| groovyphoenix | Firebird | A glowing phoenix bird with warm orange and red feathers, mid-flight, at a rooftop stage |

---

## Notes

- Do **not** include the character's name as text in the image.
- Do **not** include logos, watermarks, or signatures.
- Do **not** include UI elements, HUD overlays, or pixel art.
- The circular distressed frame is **part of the portrait**, not added in post-processing.
- Backgrounds should be **Parisian** where the location is in Paris (Haussmann limestone, wrought iron, zinc roofs) — see `PROJECT_OVERVIEW.md` for the coherence rules.
