# Portrait Generation Reference (v2.0)

**Purpose:** Standard prompt + rules for all future character portraits (AI-generated to new standard).
**Last updated:** 2026-07-29
**Canonical spec:** `docs/ART_STANDARDIZATION_SPEC.md`

**CRITICAL POLICY (v2.0):**
- **No baked frames** in new or regenerated art.
- All new art = clean **square** paintings.
- **Previews** in the game (HUD, character lists, host banners, event cards) are made **round** via CSS (`border-radius: 50%` + `overflow: hidden`).
- **Popup / lightbox** shows the clean **square** standardized art.
- **Hard permanent exceptions** (never regenerate or reframe): **Brian** (`brian.png`) and **Vanna** (`vanna.png`).

All future AI-generated (or hand-painted) portraits **must** follow the frame-less square standard.

---

## House Style (Frame-less Square Standard)

Every new portrait must follow:

- **Warm semi-realistic oil painting** (visible painterly brush texture)
- **Chest-up** composition (head + shoulders + upper torso)
- **Clean square** — **no** baked circular frame, no vignette border, no distressed edges
- **Background detail** that clearly signals the character's location, job or personality (Paris context where appropriate)
- **Lighting:** warm, soft, directional (window light, bar lamp, candle, afternoon sun)
- **Palette:** earthy warm tones — amber, olive, rust, cream, deep teal + rich but desaturated clothing
- **Mood:** intimate, lived-in, human, approachable
- **Master resolution:** 1024×1024 minimum (recommended 1152–1400 px square)

**Presentation in game (CSS only):**
- All `.avatar`, `.hud-portrait`, `.host-avatar`, `.event-avatar`, `.detail-avatar` etc. are clipped **round** by CSS.
- The lightbox (`.portrait-full`) shows the true clean square art at standardized size.

---

## Prompt Template v2.0 (No Frame — Use This)

```
A warm semi-realistic oil painting chest-up portrait of a {sex} {age_descriptor} {character_name}.
Clean square composition. No frame, no border, no vignette, no circular element.
They are at {location_context} in Paris.
The background clearly shows {specific_background_detail} that identifies who they are.
Warm directional lighting from {light_source}. 
Earthy warm palette: amber, olive, rust, cream, deep teal.
Visible painterly brush texture. Intimate and lived-in mood.
No text anywhere, no logos, no watermarks, no UI elements.
Square 1024x1024 reference.
```

### Field guide

| Field | Guidance |
|-------|----------|
| `{sex}` | Male / Female / Non-binary / Robot (object) / etc. |
| `{age_descriptor}` | young adult / middle-aged / elderly |
| `{character_name}` | display name (for prompt only) |
| `{location_context}` | e.g. "a quiet library reading nook", "behind the bar counter at night", "a rooftop overlooking zinc Paris roofs" |
| `{specific_background_detail}` | one strong identifying element (stack of philosophy books, cocktail shaker + citrus, pottery wheel, singing bowl, meditation cushion, etc.) |
| `{light_source}` | "soft afternoon window light", "warm bar lamp glow", "candlelight from the side" |

---

## Non-Human / Special Cases (Adapt the Template)

| Character      | Type     | Recommended prompt seed |
|----------------|----------|-------------------------|
| HawkinsTV      | Robot    | A friendly anthropomorphic video-camera robot with a small expressive screen face, clean square warm oil painting, at a pirate radio station attic in Paris |
| DocBot         | Robot    | A vintage medical kiosk robot with a small screen face, clean square semi-realistic oil painting, inside a worn Paris community clinic |
| Carl-bot       | Robot    | A small tablet device on a wooden stand with a simple warm smiling face, clean square oil painting style, in a meditation hall |
| groovyphoenix  | Firebird | A glowing warm phoenix bird with rich orange and red feathers, clean square composition, at a rooftop stage overlooking Paris |
| Cat            | Animal   | A realistic but painterly domestic tabby cat resting on a meditation cushion, clean square warm oil painting, inside a spiritual community hall |

---

## Hard Permanent Exceptions

- **Brian** (`brian.png`) — framed version is frozen forever.
- **Vanna** (`vanna.png`) — framed version is frozen forever.

These two retain their existing circular distressed cream frame treatment. **Do not** regenerate them. All other 76 characters must use the clean square frame-less standard going forward.

---

## Generation & Production Notes

1. Generate square output only.
2. Strong background storytelling element.
3. Parisian architecture/props when the location is in Paris.
4. Save master as `assets/portraits/<lowercase-id>.png` (lossless).
5. Run: `node scripts/build-portraits.js --only=<id>`
6. Run: `npm run check`
7. Update `CHARACTER_AND_LOCATION_TEMPLATES.md` (mark as "Regenerated v2.0").

**Long-term health goal:** This prompt + the full rules in `ART_STANDARDIZATION_SPEC.md` make it possible to reliably regenerate the entire cast (except Brian & Vanna) to a higher and more consistent standard over multiple passes.

---

## Notes

- Never include the character's name as text in the image.
- No logos, watermarks, signatures, or UI.
- No pixel art or cartoon styles for human characters.
- All backgrounds in portraits should feel like they belong in the Paris setting of the game.