# Character & Location Art Standardization Spec v2.0

**Project:** secondbarnone  
**Date:** 2026-07-29  
**Status:** Active — long-term health plan  
**Owner:** Art + Engineering  

**IMPORTANT POLICY CHANGE (v2.0):**  
The circular distressed cream frame is **deprecated** for all new art. It was never part of the original vision and became an accidental default. 

**Future standard:** Clean square paintings (no baked frame).  
**Previews everywhere in the game** (HUD, lists, hosts, events) are **round** via CSS clipping.  
**Popup / lightbox** shows the clean **square** art at standardized size.

**Hard permanent exceptions (never regenerate):**
- **Brian** (`brian.png`) — keep framed version forever.
- **Vanna** (`vanna.png`) — keep framed version forever.

All **other** characters will eventually be AI-regenerated (or hand-painted) to the new frame-less square standard.

This document is the **single source of truth**. It supersedes `PORTRAIT_REFERENCE.md`.

---

## 1. Philosophy & Goals (Long-term Health)

**Core Principle:**  
Clean, high-quality, coherent square art that feels like it belongs to this specific Paris game. The visual language lives in the painting itself + consistent CSS presentation, not baked decorative frames.

**Quality Pillars**
1. **Coherence** — Single house style (warm semi-realistic oil) across the cast.
2. **Future-proof generation** — Reliable AI prompts + human briefs for repeatable high-quality output.
3. **Presentation clarity** — Round previews (CSS) + clean square popups.
4. **Maintainability** — Clear PNG masters only, automated validation, easy re-generation.
5. **Narrative Fit** — Art reinforces character + location without decorative artifacts.
6. **Long-term health** — Easy to regenerate the entire cast to a new standard over time (except 2 hard exceptions).

**Target State (Long-term Health)**
- All **new and regenerated** portraits (76 characters): clean square PNG masters (≥1024px), **no baked frame**.
- Brian & Vanna: permanently preserved (framed exceptions).
- 100% PNG masters only as source of truth (no SVG, no legacy WebP as master).
- Strict adherence to v2.0 style + prompt for reliable, repeatable AI generation.
- CSS-only round previews everywhere + clean standardized square lightbox.
- Full automated + manual QA gates.

---

## 2. Character Portrait SPEC (v2.0)

### 2.1 Master File Requirements (Source of Truth)

| Property              | Requirement (new art)                                      | Rationale |
|-----------------------|------------------------------------------------------------|---------|
| **Format**            | PNG (lossless)                                             | Master must survive re-exports |
| **Filename**          | `assets/portraits/<id>.png`                                | Matches catalogue |
| **Dimensions**        | Square, minimum **1024×1024**, recommended **1152–1400px** | Headroom + future |
| **Aspect**            | 1:1 exactly                                                | Consistent square presentation |
| **Color depth**       | 8-bit sRGB                                                 | Web safe |
| **File size (master)**| < 3 MB (target < 2.2 MB)                                   | Git + build friendly |
| **Content**           | Clean square painting — **NO** baked circular frame, vignette or border | See policy above |
| **No text**           | Zero letters, numbers, logos, watermarks, signatures       | Clean |
| **No UI**             | No HUD, buttons, overlays                                  | Pure art |

**Presentation rule (enforced by CSS):**
- Inline previews everywhere = round (via `border-radius: 50%`)
- Lightbox = clean square (standardized size)

**Exceptions:** Brian and Vanna keep their existing framed PNG masters permanently. They are never regenerated.

**Legacy handling**
- Existing `.webp` or `.svg` in `assets/portraits/` are **deprecated sources**.
- `build-portraits.js` **must only** resolve `.png` as the canonical master.
- Old `.webp`/`.svg` can stay temporarily for reference but must be removed in the migration pass.

### 2.2 House Style Bible (Mandatory)

**Style Name:** "Warm Parisian Semi-Realistic Oil"

**Composition**
- Chest-up (head + shoulders + upper torso)
- Subject slightly off-center (rule of thirds) or centered for intimate portraits
- Circular **distressed cream/beige frame** baked into the painting (weathered edges, subtle chips, soft vignette inside)
- Background detail that **identifies the character** (location prop, tool, or environment)

**Lighting**
- Warm directional key light (candle, window, bar lamp, late afternoon)
- Soft fill, gentle rim on hair/shoulders
- No harsh shadows or cool neon unless character-specific

**Palette (Earthy Warm)**
Primary: `#3F2A1F`, `#5C4633`, `#8B6F47`, `#C9A87C`, `#E8D9C0` (cream frame)
Accents: rust, olive, amber, deep teal, muted burgundy
Skin: warm undertones (avoid cool grays or plastic pink)
Hair & clothing: rich but desaturated

**Rendering**
- Visible brush texture / painterly marks (semi-realistic, **not** photoreal)
- Soft edges on clothing/background, sharper on eyes/face
- Subtle canvas/paper texture optional (very light)

**Mood**
- Intimate, lived-in, slightly melancholic but warm
- Human, approachable, never glamorous or cartoon

**Frame Details (baked in)**
- Off-white cream `#E8D9C0` to warm beige `#D4C2A3`
- Distressed edges: irregular wear, small chips, soft paint drips
- Inner vignette (darker toward edges of circle)
- Frame thickness ~8-12% of diameter

### 2.3 Prompt Template (v1.1 — Updated)

Use this **exact** base for all AI generations (human artists receive the same brief):

```
Warm semi-realistic oil painting portrait of a {sex} {age} {name}, 
chest-up, in a circular distressed cream-painted frame with weathered edges and subtle chips.
{character_description}. 
At {location_context} in Paris. 
{background_detail} visible in the soft background.
Warm directional lighting from {light_source}, earthy palette of amber, olive, rust, cream and deep teal.
Painterly brush texture, intimate and lived-in mood, no text, no logos, no watermarks.
Square composition, 1024x1024 reference.
```

**Field Guide**
- `{sex}`: Male / Female / Non-binary / Robot (anthropomorphic) / etc. — drives anatomy & clothing
- `{age}`: young adult / middle-aged / elderly / teen
- `{name}`: display name (for prompt only)
- `{character_description}`: 1-2 sentences from bio + personality
- `{location_context}`: e.g. "the bar at night", "a quiet library reading nook", "rooftop overlooking zinc roofs"
- `{background_detail}`: one specific prop (books, cocktail shaker, pottery wheel, meditation cushion, etc.)
- `{light_source}`: "a warm bar lamp", "afternoon window light", "candle on a table"

**Non-Human / Special Cases**
See section 2.6.

### 2.4 Character Consistency Rules

- **Léon (protagonist)**: middle-length dark brown hair, short orthodox-style beard, warm brown eyes, simple linen or worn sweater. Recurring in HUD.
- **Rivals (Sato, Alex)**: polished vs. creative contrast — Sato cool/expensive minimal, Alex theatrical/bar flair.
- **Kaden**: immaculate suit, cold polite smile, never warm lighting.
- **Robots (HawkinsTV, Carl-bot, DocBot)**: clearly mechanical objects with expressive faces/screens — still inside the circular frame and painterly style.
- **Animals (Cat)**: stylized but clearly a cat; treated as character, not cartoon.
- **Firebird (groovyphoenix)**: glowing warm feathers, still framed as portrait.

**Clothing & Props**
- Always reflect **Paris + location** (no cowboy hats, no generic fantasy).
- Recurring motif: linen, wool, worn leather, simple jewelry.
- No modern corporate logos or obvious 2020s streetwear unless intentional for a character.

### 2.5 Technical Delivery (Tiers)

| Tier     | Path                              | Size   | Usage                              | Notes |
|----------|-----------------------------------|--------|------------------------------------|-------|
| Master   | `assets/portraits/<id>.png`       | ≥1024px| Source of truth                    | Never committed to docs/ |
| Thumbnail| `docs/assets/portraits/<id>.webp` | 288px  | All inline avatars (HUD, list, etc)| Max inline size 84 CSS px |
| Hi-res   | `docs/assets/portraits/hi/<id>.webp` | 896px | Lightbox only (lazy)               | Never upscaled |

**Build rules** (enforced by `build-portraits.js` + tests):
- Always prefer largest `.png` master.
- Never upscale.
- Hi-res never smaller than thumb.
- Prune any unreferenced files.

### 2.6 Non-Human & Edge Cases

| Character Type | Treatment |
|----------------|-----------|
| Robots         | Object portrait (device + expressive screen/face) inside the frame. Still painterly. |
| Animals        | Realistic or stylized animal in context (never anthropomorphic unless specified). |
| Mythic (phoenix) | Glowing creature portrait with warm palette matching house style. |
| Abstract / "Self" | Meditation cushion + silhouette or symbolic element. |

All still follow the circular frame + chest-up (or equivalent) rule.

---

## 3. Location Background SPEC

### 3.1 Master Requirements

| Property     | Requirement                              |
|--------------|------------------------------------------|
| Format       | PNG                                      |
| Dimensions   | Landscape, **≥1400px wide**, recommended 1536–1920px |
| Aspect       | ~16:9 or 3:2 (never square or portrait)  |
| Filename     | `assets/backgrounds/<id>.png`            |
| Content      | Full scene, no UI, no text               |
| Paris Coherence | Haussmann limestone, zinc roofs, wrought iron, plane trees, wet cobbles where appropriate |

### 3.2 Style Rules

- **Daylight bias** (mean luminance > 0.28 after scrim)
- Soft atmospheric perspective
- Subtle weather cues only when location tag demands (never night unless explicitly a night location)
- Low contrast in center for UI text legibility
- Scrim-friendly: test luminance after `rgba(8,8,16,0.62)` overlay

**Hub background** (`hub_background.webp`) is special: blue-hour street corner showing bar + spiritual community facing each other.

---

## 4. Production & Generation Workflow

### 4.1 Recommended Pipeline (AI + Human)

1. **Briefing**
   - Pull character profile + location from `characters.js` + `locations.js`.
   - Fill prompt template + add 1-2 reference photos (mood only).

2. **Generation**
   - Primary: Midjourney / Flux / SD3 with exact prompt + `--stylize 250 --v 6` (or equivalent).
   - Secondary: Human artist paints over or from scratch using same brief.

3. **Post-processing (mandatory)**
   - Crop/resize to exact square (portraits) or landscape.
   - Bake the circular distressed frame (use a reusable PSD/clip or script).
   - Color grade to palette using reference swatches.
   - Remove any text/watermarks.
   - Export master PNG.

4. **Validation**
   - Run `node scripts/build-portraits.js --only=<id>`
   - Run `npm run check`
   - Visual QA checklist (see §6).

5. **Commit**
   - Add PNG master to `assets/portraits/`.
   - Delete any previous .webp/.svg for that id.
   - Update `CHARACTER_AND_LOCATION_TEMPLATES.md` (mark as "Custom" or "Regenerated").

### 4.2 Tooling Updates Needed

- Enhance `build-portraits.js` to **reject non-PNG masters** (or warn loudly).
- Add luminance + contrast checks to `portrait-assets.test.js`.
- Add palette histogram guard (optional but powerful).
- Create `scripts/validate-art.js` (standalone visual spec checker).

---

## 5. Migration Plan (Current State → Compliant)

**Current problems (July 2026):**
- Only 62/78 characters have PNG masters.
- 57 legacy SVGs in source.
- Some masters too large (>2.8 MB).
- Inconsistent source resolutions.
- AI-generated but marketed as "painted".
- Check-assets currently fails on payload + music.

**Phased Migration (recommended order)**

**Phase 0 — Cleanup (1-2 days)**
- Delete all `assets/portraits/*.svg`
- Delete superseded background PNGs (`bar.png`, `spiritual_community.png`, etc.)
- Remove `docs/assets/music/warm_piano.wav` (or move to LFS)

**Phase 1 — Masters (priority)**
- Generate/re-paint the 16 missing PNG masters.
- Re-export the 62 existing ones at consistent 1152–1250px if needed.
- Update `build-portraits.js` to hard-fail on non-PNG.

**Phase 2 — QA Gates**
- Add automated tests for:
  - All masters are PNG ≥1024px
  - Frame is present (simple edge detection or manual hash list)
  - Luminance within 0.25–0.65 range
- Pin the "best 10" current portraits by hash as regression guards.

**Phase 3 — Documentation & Templates**
- Mark all portraits "Regenerated to Spec v1.0" in `CHARACTER_AND_LOCATION_TEMPLATES.md`.
- Update `PORTRAIT_REFERENCE.md` to point to this spec.
- Add reference moodboard folder: `assets/art-references/`

**Phase 4 — Long-term**
- Git LFS for `assets/` (portraits + backgrounds).
- Human artist pass on protagonist + 5 key characters (Léon, Brian, Kaden, Sato, Alex).
- Style guide PDF for future contractors.

---

## 6. Quality Assurance Checklist

**Automated (must pass `npm run check` + new validator)**
- [ ] PNG master exists and ≥1024×1024
- [ ] Both tiers build successfully
- [ ] No SVGs deployed
- [ ] Thumbnail ≤288px, Hi ≤896px
- [ ] Hi never smaller than thumb
- [ ] Background luminance >0.28
- [ ] House of Middleway >0.35 and brightest

**Manual (artist + designer sign-off)**
- [ ] Circular distressed frame clearly visible and consistent
- [ ] Warm directional lighting
- [ ] Earthy palette dominant
- [ ] Background detail clearly signals character/location
- [ ] No text, watermarks, modern logos
- [ ] Paris-appropriate architecture & props
- [ ] Sex/gender/presentation matches profile
- [ ] Character recognizable at 84px thumbnail

**Regression Guards**
- Content hashes for the 4 previously off-style portraits + 5 repainted backgrounds.
- Add more as we stabilize.

---

## 7. Backgrounds Quick Reference

All locations must use the Paris-coherent masters committed in `assets/backgrounds/`.

Key rules already enforced:
- 1000px wide deployed WebP
- Dark enough for white text under scrim
- Referenced from `locations.js`

Future: add explicit aspect ratio + mean luminance floor tests.

---

## 8. Long-term Health Plan (Asset Generation)

**Vision (3–5 years):**
- The entire cast (except Brian & Vanna) is regenerated 1–2 more times to ever-higher quality using this spec.
- All art is AI-generated from the v2.0 prompt + style bible (or hand-painted to the same spec).
- Source of truth is always clean square PNG masters.
- Presentation is 100% CSS-driven (round previews + square lightbox).
- Full automation: one command can regenerate + validate the whole cast.

### Phased Long-term Roadmap

**Phase A — Foundation (now)**
- Adopt v2.0 spec + prompt everywhere.
- Update build script, tests, docs (done in this pass).
- Purge legacy SVGs from `assets/portraits/`.
- Document Brian & Vanna as permanent exceptions.

**Phase B — Masters (next 1–2 months)**
- Create PNG masters for the remaining ~16 characters using the **frame-less** prompt.
- Re-generate any existing characters that still have noticeable issues (wrong sex/presentation, weak background detail, etc.).
- Add luminance + basic "no-frame" heuristic tests (edge detection or hash pinning of clean squares).

**Phase C — Full Cast Refresh (medium term)**
- Systematic pass over all 76 non-exception characters.
- Create a small set of **style reference sheets** (Léon + 3–4 key characters) for consistent AI prompting.
- Human artist polish pass on protagonist + 2–3 rivals if budget allows.

**Phase D — Automation & Governance**
- `npm run regenerate-art -- --all` (or equivalent script).
- CI gate that fails if a non-exception portrait uses a legacy framed source.
- Git LFS for `assets/portraits/` and `assets/backgrounds/`.
- Public moodboard + prompt library.

**Phase E — Future Standards**
- When a new house style emerges, only the 76 characters are re-generated. Brian & Vanna stay as historical artifacts.

### How to Regenerate a Character (v2.0)

1. Use the exact prompt from `PORTRAIT_REFERENCE.md` (v2.0 template).
2. Output **square**, clean (no frame).
3. Save `assets/portraits/<id>.png`.
4. `node scripts/build-portraits.js --only=<id>`
5. `npm run check`
6. Update `CHARACTER_AND_LOCATION_TEMPLATES.md`.

---

## 9. Open Questions & Future Work

- Reference sheets for the protagonist and key NPCs (for AI consistency)?
- Optional subtle inner vignette in CSS (not baked) for lightbox polish?
- Color script per district / time of day?
- Move to a small Node pipeline using Sharp for resizing + basic validation?
- Commission 1–2 real oil paintings of Léon and Brian (as a deliberate contrast to the AI cast)?

---

## Appendix A — Current Compliance Snapshot (2026-07-29, post v2.0 changes)

| Metric                              | Value             | Target          | Status |
|-------------------------------------|-------------------|-----------------|--------|
| Characters with PNG master          | 62 / 78           | 78              | 79%    |
| Characters on v2.0 frame-less standard | 0 (transition) | 76              | Starting |
| Hard exceptions protected           | 2 (brian, vanna)  | 2               | ✓      |
| Legacy SVGs in source               | 57                | 0               | Needs purge |
| Build script enforces v2.0 policy   | Partial (warnings)| Full            | In progress |
| Tests cover frame-less policy       | Added             | Full            | ✓      |

**Immediate next actions (recommended)**
1. Purge all `assets/portraits/*.svg`
2. Generate the 16 missing PNG masters using the **v2.0 no-frame** prompt.
3. Run full `npm run check` after each batch.
4. Update `side_characters_report.md` and `CHARACTER_AND_LOCATION_TEMPLATES.md` to reference v2.0.

---

*This is a living document. Future art generations must follow v2.0 (frame-less square) except for the two named permanent exceptions.*
