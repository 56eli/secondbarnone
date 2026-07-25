# Balance of Spirit

A **2D browser-playable resource-management RPG** built in Godot 4.7.  
You play as **Léon**, who runs a spiritual community (sanity) and works at a bar (money).  
Each day you choose your priority — neglect either side and it's game over.

> **Current status**: Fully playable, enriched with visual assets, animations, and deep character lore.

---

## What's New (Enhancement Pass)

- **Animated stat bars** — Sanity and money bars smoothly animate between values
- **Scene fade transitions** — Smooth black fades between hub, locations, and character screen
- **Floating particles** — Ambient particles float gently in location scenes
- **Background images** — AI-generated PNG backgrounds for both locations
- **Character portraits** — 14 characters now have face portraits (PNG + SVG)
- **Rich character bios** — All 14 characters have full backstories and relationships
- **Stat delta indicators** — Animated +/- labels show exactly what changed each day
- **Seasonal flavor** — Game detects season (Winter/Spring/Summer/Autumn) and mood
- **Hub atmosphere** — Gradient background with mood text on the hub screen
- **Color-coded rarity** — Event rarity tags are color-coded (green=helpful, red=hurtful)
- **More events** — 8 new events added (Rainy Day Reflection, New Face, Anonymous Benefactor, Trivia Night, Neighborhood Drama, Unexpected Reunion, Surprise Inspection, Old Friend)
- **Richer descriptions** — All event and location descriptions expanded

---

## Project Structure

```
res/
├── project.godot                    Godot config (800×600, Compatibility renderer)
├── export_presets.cfg               HTML5/Web export preset
├── PROJECT_OVERVIEW.md              ← This file
├── scripts/
│   ├── main.gd                      Main controller — scene switching, HUD, modals
│   ├── game_state.gd                Persistent state — stats, calendar, history
│   ├── hub.gd                       Hub screen — location and character buttons
│   ├── event_manager.gd             Data-driven event system
│   ├── event_definition.gd          Custom Resource — event data schema
│   ├── character_profile.gd         Custom Resource — character data schema
│   ├── character_data.gd            Static factory — 14 character profiles
│   ├── character_profiles.gd        Characters screen — list + detail panel
│   └── locations/
│       ├── location_base.gd         Base class — shared location UI + particles
│       ├── spiritual_community.gd   Spiritual Community location
│       └── bar.gd                   Bar location
├── scenes/
│   ├── main.tscn                    Root scene — HUD + content host + modals
│   ├── hub.tscn                     Hub screen — title + action buttons
│   ├── characters/
│   │   └── character_profiles.tscn  Character roster + detail panel
│   └── locations/
│       ├── spiritual_community.tscn Spiritual Community scene
│       └── bar.tscn                 Bar scene
└── assets/
    ├── backgrounds/
    │   ├── spiritual_community.png  AI-generated community background
    │   ├── bar.png                  AI-generated bar background
    │   └── hub_background.svg       Gradient hub atmosphere
    └── portraits/
        ├── leon.png                 AI-generated portrait
        ├── geo.png                  AI-generated portrait
        ├── lakshay.png              AI-generated portrait
        ├── arian.png                AI-generated portrait
        ├── simon.png                AI-generated portrait
        ├── kaj.png                  AI-generated portrait
        ├── dorian.png               AI-generated portrait
        ├── barret.png               AI-generated portrait
        ├── ethan.svg                SVG portrait
        ├── matt.svg                 SVG portrait
        ├── artem.svg                SVG portrait
        ├── klaudia.svg              SVG portrait
        ├── brian.svg                SVG portrait
        └── susan.svg                SVG portrait
```

---

## Architecture

### Scene tree (`main.tscn`) — the root

```
Main (Control, fullscreen)
├── HUD (Control, top bar)
│   ├── HudBg (ColorRect)
│   ├── CalendarLabel  [%CalendarLabel]  "Thursday, January 1, 2026"
│   ├── DayProgressLabel  [%DayProgressLabel]  "Journey Day 1"
│   └── StatBarsContainer
│       ├── SanityRow
│       │   ├── SanityLabel  [%SanityLabel]  "🧘 Sanity: 50 / 100"
│       │   ├── SanityBar  [%SanityBar]  animated progress bar
│       │   └── SanityDeltaLabel  [%SanityDeltaLabel]  animated +/- delta
│       └── MoneyRow
│           ├── MoneyLabel  [%MoneyLabel]  "💰 Money: 50 / 100"
│           ├── MoneyBar  [%MoneyBar]  animated progress bar
│           └── MoneyDeltaLabel  [%MoneyDeltaLabel]  animated +/- delta
├── ContentHost (Control) — instanced scenes appear here
├── FadeOverlay (ColorRect) — fullscreen black for fade transitions
├── ResultModal (Control) — "Day Complete" overlay (hidden)
└── GameOverPanel (Panel, hidden)
```

### Hub scene (`hub.tscn`)

```
Hub (Control)
├── HubBackground (TextureRect) — gradient atmosphere
├── HubOverlay (ColorRect) — dark tint
└── MainVBox
    ├── TitleLabel       "Balance of Spirit"
    ├── SubtitleLabel    "Find equilibrium between community and coin"
    ├── DayLabel         "Thursday, January 1, 2026  |  Journey Day 1"
    ├── MoodLabel        "Winter  |  You are managing. Not thriving, but surviving."
    ├── StatsHBox (Sanity + Money)
    ├── SpiritualBtn     "🧘 Visit Spiritual Community"
    ├── BarBtn           "🍺 Visit the Bar"
    ├── CharactersBtn    "👥 Characters"
    └── HistoryLabel     "Recent History: …"
```

### Location scenes — now with particles

```
Location (Control)
├── BackgroundTexture (TextureRect) — AI art
├── BackgroundFallback (ColorRect)
├── Overlay (ColorRect) — dark tint
├── ParticlesContainer (Control) — floating particles
└── ContentVBox
    ├── LocationName
    ├── LocationDesc
    ├── ActionBtn
    └── BackBtn
```

---

## Game Flow

```
┌──────────────────────────────────────────────────────────┐
│                    GAME LOOP                             │
│                                                          │
│  Show Hub ──→ Pick Location ──→ See Location Scene       │
│                     │                   │                │
│                     │            ┌──────┴──────┐        │
│                     │            │  Back (hub)  │        │
│                     │            │  Action!     │        │
│                     │            └──────┬──────┘        │
│                     │                   ▼                │
│                     │  ① GameState.apply_location_action│
│                     │  ② Rent check (Sundays)           │
│                     │  ③ EventManager.select_event      │
│                     │  ④ GameState.apply_event_deltas   │
│                     │  ⑤ GameState.check_game_over      │
│                     │                   │                │
│                     │            ┌──────┴──────┐        │
│                     │            │ Game over?   │        │
│                     │            │ → Show panel │        │
│                     │            │ → Restart     │        │
│                     │            └──────┬──────┘        │
│                     │                   ▼                │
│                     │         Show Result Modal          │
│                     │           "Day Complete"           │
│                     │           (animated fade-in)       │
│                     │           Continue →               │
│                     │                   │                │
│                     │            GameState.advance_day() │
│                     └──────────────────┘                 │
│                                                          │
│  All scene transitions use fade-to-black for polish     │
└──────────────────────────────────────────────────────────┘
```

---

## Game Balance

|              | Sanity | Money | Calendar |
|--------------|--------|-------|----------|
| Start        | 50     | 50    | Thursday, January 1, 2026 |
| Max          | 100    | 100   | Ongoing  |
| **Spiritual**| **+15**| **−10**| +1 journey day |
| **Bar**      | **−12**| **+12**| +1 journey day |

Rent: **−18 money** every Sunday

---

## Characters

| ID | Name | Location |
|----|------|----------|
| leon | Léon | Spiritual Community & The Bar |
| geo | Geo | Spiritual Community |
| lakshay | Lakshay | Spiritual Community |
| arian | Arian | Spiritual Community |
| simon | Simon | Spiritual Community |
| kaj | Kaj | Spiritual Community |
| dorian | Dorian | The Bar |
| barret | Barret | The Bar |
| ethan | Ethan | The Bar & Spiritual Community |
| matt | Matt | The Bar |
| artem | Artem | The Bar |
| klaudia | Klaudia | Spiritual Community & The Bar |
| brian | Brian | Spiritual Community & The Bar |
| susan | Susan | Spiritual Community & The Bar |

All characters have rich backstories, detailed relationships to Léon, and portrait artwork.

---

## Event Catalog (29 events)

### Spiritual Community
| Rarity | Event | Sanity | Money |
|--------|-------|--------|-------|
| Standard | Inspiring Meditation | +8 | 0 |
| Standard | Moment of Clarity | +10 | 0 |
| Standard | Community Support | +8 | 0 |
| Standard | Community Potluck | +8 | +8 |
| Standard | Group Healing Circle | +12 | 0 |
| Standard | Wise Elder Visit | +10 | 0 |
| Standard | Small Fundraiser | +5 | +5 |
| Standard | Spiritual Doubt | −8 | 0 |
| Standard | Community Disagreement | −6 | 0 |
| Standard | Rainy Day Reflection | +6 | 0 |
| Standard | A New Face | +7 | +3 |
| Rare Helpful | Deep Meditation Breakthrough | +25 | 0 |
| Rare Helpful | Anonymous Benefactor | +5 | +20 |
| Rare Hurtful | Spiritual Crisis | −20 | 0 |
| Rare Hurtful | Schism in the Community | −10 | 0 |

### Bar
| Rarity | Event | Sanity | Money |
|--------|-------|--------|-------|
| Standard | Unexpected Tips | 0 | +8 |
| Standard | Slow Night | 0 | −5 |
| Standard | Difficult Customer | −6 | 0 |
| Standard | Regular Tells a Story | +6 | 0 |
| Standard | Philosophical Drunk | +4 | 0 |
| Standard | Karaoke Night Success | +8 | +8 |
| Standard | Broken Equipment | 0 | −12 |
| Standard | Trivia Night Triumph | +5 | +5 |
| Standard | Neighborhood Drama | −4 | 0 |
| Rare Helpful | Big Tip Night | 0 | +25 |
| Rare Helpful | Unexpected Reunion | +15 | +5 |
| Rare Hurtful | Bar Fight | −18 | −8 |
| Rare Hurtful | Burnout (needs 3+ consecutive bar days) | −15 | 0 |
| Rare Hurtful | Surprise Inspection | −8 | −12 |

---

## Browser Export

- **Renderer**: Compatibility (`gl_compatibility`) — WebGL 2.0
- **Window**: 800×600, `canvas_items` stretch, `expand` aspect
- **Export preset**: `export_presets.cfg` → Web → outputs to `build/web/index.html`

## How to share with another AI

1. **`main.gd`** — controller, scene switching, HUD, transitions, modals
2. **`game_state.gd`** — stats, calendar, season detection, mood
3. **`event_manager.gd`** — 29 data-driven events with rarity weights
4. **`location_base.gd`** — base class with particle effects and background switching
5. **`character_data.gd`** — 14 characters with rich bios and portrait loading
6. **Signals everywhere**: `visit_location`, `go_back`, `location_action_performed`, `stats_changed`, `day_changed`, `game_over_triggered`
