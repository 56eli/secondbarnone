# Side Characters Portrait Status Report

This document lists all side characters in **secondbarnone** and tracks which
ones have high-quality painted raster portraits (WebP/PNG) and which ones
still use procedural SVG placeholders. It is the canonical "what's missing"
list referenced by the project — update it whenever a portrait is painted or
a new character is added.

Through the **clickable-portrait pass** (July 2026), every portrait in the
game became a tappable/clickable popup showing the character's bio, and we
generated **40 new high-quality portraits** across three rounds. Every human
character in the cast now has a painted portrait.

---

## 👥 Summary
- **Total cast:** 78 (Léon, Kaden, Sato, Alex + 74 side characters)
- **High-Quality Portraits Done:** 76 of 78 — every human character
- **Still Using SVG Placeholders:** 2, and both are intentional (see below)

---

## 🎨 Portrait Status List

### Done (High-Quality WebP/PNG Images) — 76 characters

Léon, Kaden, Sato, Alex, Geo, Lakshay, Arian, Simon, Kaj, Dorian, Barret,
Ethan, Matt, Artem, Klaudia, Brian, Susan, HawkinsTV, RicoLewis, Yun,
Marlies, Yume, Mateo, Luca, Cheezl, Kate, Emily, Joar, Brock Lee, Ahyeon,
Renata, SiekamCebulę, Lou, Baris, Stephen, Iulian (the original 32), plus
every side character painted during the clickable-portrait pass:

1. Tarrasqu (`tarrasqu`) — Tabletop GM regular
2. Friend (`friend`) — Mysterious helper
3. nestomalt (`nestomalt`) — Night-shift nurse
4. Self (`self`) — Contented silent meditator
5. Daniela (`daniela`) — Posture-correcting physiotherapist
6. Crveni (`crveni`) — Fast union organizer
7. Gordon (`gordon`) — Retired quiet firefighter
8. Oh (`oh`) — Devout 11-word poet
9. RicardoEA (`ricardoea`) — Rigorous electrical engineer
10. SpeedFire (`speedfire`) — Ultra-fast supply courier
11. Scatmandu (`scatmandu`) — Loud alley scat singer
12. Cat (`cat`) — Actual cat who loves underfloor heating
13. Hanans (`hanans`) — Skeptical herbal pharmacist
14. Kaschem (`kaschem`) — Cold-brew enthusiast
15. Vanna (`vanna`) — Passing-through travel writer
16. Sir Cruds (`sir_cruds`) — Arrogant cheese knight
17. Qusтoge (`qustoge`) — Deep poetry translator
18. groovyphoenix (`groovyphoenix`) — Ecstatic dance DJ
19. Cary (`cary`) — Existential philosopher locksmith
20. Aril Stellar☯ (`aril_stellar`) — Astrology newsletter writer
21. Alvigunilla (`alvigunilla`) — Patient tapestry weaver
22. Fraghis (`fraghis`) — Midnight competitive gamer
23. Mrone (`mrone`) — Minimalist with 19 possessions
24. 𝕽𝖆𝖚𝖑 (`raul`) — Gothic metal-flyer tattoo artist
25. Marlène xoxo (`marlene_xoxo`) — Cabaret performer
26. diamndsdancin (`diamndsdancin`) — Ecstatic dance movement teacher
27. Seth (`seth`) — Long-haul regional driver
28. Kopung (고풍) (`kopung`) — Antique-style ceramicist
29. Isra (`isra`) — Refuge architecture student
30. Kobideh (`kobideh`) — Grill house owner
31. stijn12d (`stijn12d`) — Volunteer booking software dev
32. Andre Watson (`andre_watson`) — Jazz trumpeter regular
33. Air-Vaisselle (`air_vaisselle`) — Transcendent dishwasher
34. blokely (`blokely`) — Salvaged material sculptor
35. Jits (`jits`) — Jiu-jitsu master meditator
36. Jared (`jared`) — Audio PA sound engineer
37. Orshi (`orshi`) — Melancholic translator of poetry
38. Brendan (`brendan`) — Lonely grading schoolteacher
39. Hazel (`hazel`) — Medicinal tea-blend herbalist
40. yungnosaj (`yungnosaj`) — Field-recording beat producer

---

### Still Using SVG (2, both intentional)

1. **Carl-bot** (`carl_bot`) — SVG. `scripts/generate-avatars.js` deliberately
   renders this as a stylised machine (a tablet on a stand), not a person.
2. **DocBot** (`docbot`) — SVG. Same reasoning — it's a first-aid kiosk, not
   a person.

Both *could* still get a painted "object portrait" in the same circular
vignette style if that's ever wanted (a friendly illustrated tablet/kiosk
rather than a generated SVG), but they're deliberately excluded from the
"paint every character" backlog since they aren't people.

---

## How to add a portrait for a new character

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
   enforces a budget (currently 6 MB) so the game stays a fraction of the
   size of the original Godot build.
