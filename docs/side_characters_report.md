# Side Characters Portrait Status Report

This document lists all side characters in **secondbarnone** and tracks which
ones have high-quality painted raster portraits (WebP/PNG) and which ones
still use procedural SVG placeholders. It is the canonical "what's missing"
list referenced by the project — update it whenever a portrait is painted or
a new character is added.

Through the **clickable-portrait pass** (July 2026), every portrait in the
game became a tappable/clickable popup showing the character's bio, and we
generated **32 new high-quality portraits** across two rounds, cutting the
placeholder list from 42 characters down to 10.

---

## 👥 Summary
- **Total Side Characters:** 51 (74 side characters + Léon, Kaden, Sato, Alex
  across all roles = 78 total cast; this report tracks the side-character
  portrait backlog specifically)
- **High-Quality Portraits Done:** 68 characters total have a painted WebP/PNG
  portrait (up from 32)
- **Still Using SVG Placeholders:** 10 (2 are intentionally non-human — see
  below — leaving **8 human characters** still needing a painted portrait)

---

## 🎨 Portrait Status List

### Done (High-Quality WebP/PNG Images)
Léon, Kaden, Sato, Alex, Geo, Lakshay, Arian, Simon, Kaj, Dorian, Barret,
Ethan, Matt, Artem, Klaudia, Brian, Susan, HawkinsTV, RicoLewis, Yun,
Marlies, Yume, Mateo, Luca, Cheezl, Kate, Emily, Joar, Brock Lee, Ahyeon,
Renata, SiekamCebulę, Lou, Baris, Stephen, Iulian — the earlier 32 from the
previous cycle — plus, newly painted this pass:

1. **Tarrasqu** (`tarrasqu`) — WebP 🌟 *[NEW]* (Tabletop GM regular)
2. **Friend** (`friend`) — WebP 🌟 *[NEW]* (Mysterious helper)
3. **nestomalt** (`nestomalt`) — WebP 🌟 *[NEW]* (Night-shift nurse)
4. **Self** (`self`) — WebP 🌟 *[NEW]* (Contented silent meditator)
5. **Daniela** (`daniela`) — WebP 🌟 *[NEW]* (Posture-correcting physiotherapist)
6. **Crveni** (`crveni`) — WebP 🌟 *[NEW]* (Fast union organizer)
7. **Gordon** (`gordon`) — WebP 🌟 *[NEW]* (Retired quiet firefighter)
8. **Oh** (`oh`) — WebP 🌟 *[NEW]* (Devout 11-word poet)
9. **RicardoEA** (`ricardoea`) — WebP 🌟 *[NEW]* (Rigorous electrical engineer)
10. **SpeedFire** (`speedfire`) — WebP 🌟 *[NEW]* (Ultra-fast supply courier)
11. **Scatmandu** (`scatmandu`) — WebP 🌟 *[NEW]* (Loud alley scat singer)
12. **Cat** (`cat`) — WebP 🌟 *[NEW]* (Actual cat who loves underfloor heating)
13. **Hanans** (`hanans`) — WebP 🌟 *[NEW]* (Skeptical herbal pharmacist)
14. **Kaschem** (`kaschem`) — WebP 🌟 *[NEW]* (Cold-brew enthusiast)
15. **Vanna** (`vanna`) — WebP 🌟 *[NEW]* (Passing-through travel writer)
16. **Sir Cruds** (`sir_cruds`) — WebP 🌟 *[NEW]* (Arrogant cheese knight)
17. **Qusтoge** (`qustoge`) — WebP 🌟 *[NEW]* (Deep poetry translator)
18. **groovyphoenix** (`groovyphoenix`) — WebP 🌟 *[NEW]* (Ecstatic dance DJ)
19. **Cary** (`cary`) — WebP 🌟 *[NEW]* (Existential philosopher locksmith)
20. **Aril Stellar☯** (`aril_stellar`) — WebP 🌟 *[NEW]* (Astrology newsletter writer)
21. **Alvigunilla** (`alvigunilla`) — WebP 🌟 *[NEW]* (Patient tapestry weaver)
22. **Fraghis** (`fraghis`) — WebP 🌟 *[NEW]* (Midnight competitive gamer)
23. **Mrone** (`mrone`) — WebP 🌟 *[NEW]* (Minimalist with 19 possessions)
24. **𝕽𝖆𝖚𝖑** (`raul`) — WebP 🌟 *[NEW]* (Gothic metal-flyer tattoo artist)
25. **Marlène xoxo** (`marlene_xoxo`) — WebP 🌟 *[NEW]* (Cabaret performer)
26. **diamndsdancin** (`diamndsdancin`) — WebP 🌟 *[NEW]* (Ecstatic dance movement teacher)
27. **Seth** (`seth`) — WebP 🌟 *[NEW]* (Long-haul regional driver)
28. **Kopung (고풍)** (`kopung`) — WebP 🌟 *[NEW]* (Antique-style ceramicist)
29. **Isra** (`isra`) — WebP 🌟 *[NEW]* (Refuge architecture student)
30. **Kobideh** (`kobideh`) — WebP 🌟 *[NEW]* (Grill house owner)
31. **stijn12d** (`stijn12d`) — WebP 🌟 *[NEW]* (Volunteer booking software dev)
32. **Andre Watson** (`andre_watson`) — WebP 🌟 *[NEW]* (Jazz trumpeter regular)

---

### Still Needs High-Quality Images (Currently SVGs) — 10 remaining

1. **Carl-bot** (`carl_bot`) — SVG *(intentional — renders as a machine, see note below)*
2. **DocBot** (`docbot`) — SVG *(intentional — renders as a machine, see note below)*
3. **Air-Vaisselle** (`air_vaisselle`) — SVG (Transcendent dishwasher)
4. **blokely** (`blokely`) — SVG (Salvaged material sculptor)
5. **Jits** (`jits`) — SVG (Jiu-jitsu master meditator)
6. **Jared** (`jared`) — SVG (Audio PA sound engineer)
7. **Orshi** (`orshi`) — SVG (Melancholic translator of poetry)
8. **Brendan** (`brendan`) — SVG (Lonely grading schoolteacher)
9. **Hazel** (`hazel`) — SVG (Medicinal tea-blend herbalist)
10. **yungnosaj** (`yungnosaj`) — SVG (Field-recording beat producer)

**Note on Carl-bot and DocBot:** `scripts/generate-avatars.js` deliberately
renders these two as stylised machines (a tablet-on-a-stand and a first-aid
kiosk) rather than painted human portraits, since they aren't people. They
could still get a painted "object portrait" in the same circular vignette
style if that's ever wanted — they're listed here for completeness, not
because they were missed.

---

## How to fill in the rest

1. Generate a source image (1024×1024 or similar) matching the existing
   painted style: warm semi-realistic digital painting, circular vignette
   crop implied by a distressed cream-painted border, character shown from
   the chest up with a background detail that signals their role.
2. Save it to `assets/portraits/<id>.png`.
3. Run `./scripts/process-portrait.sh <id>` to square-crop (if needed),
   downscale to 512px, and emit the deployed WebP into
   `docs/assets/portraits/<id>.webp`.
4. Add `<id>` to the `WEBP_PORTRAITS` set in `docs/js/data/characters.js`,
   the `BESPOKE` set in `scripts/generate-avatars.js` (so the procedural
   generator stops overwriting it), and the `painted` set in the
   `portrait extensions match the painted / generated split` test in
   `tests/coverage.test.js`.
5. Run `npm run check` (tests + `scripts/check-assets.js`) and update the
   lists above.
6. Keep an eye on the total deployed payload — `scripts/check-assets.js`
   enforces a budget (currently 5 MB) so the game stays a fraction of the
   size of the original Godot build.
