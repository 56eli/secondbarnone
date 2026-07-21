# Balance of Spirit

A **2D browser-playable resource-management RPG** built in Godot 4.7.  
You play as **Léon**, who runs a spiritual community (sanity) and works at a bar (money).  
Each day you choose your priority — neglect either side and it's game over.

> **Current status**: Fully playable, zero runtime errors, ready for web export.

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
│       ├── location_base.gd         Base class — shared location UI + signals
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
    ├── generated/                   (generated sprite atlases go here)
    ├── background/README.md
    └── portraits/README.md
```

**11 scripts** · **5 scenes** · no addons · no autoloads · no external assets required

---

## Architecture

### Scene tree (`main.tscn`) — the root

```
Main (Control, fullscreen) ← script: main.gd
├── HUD (Control, top bar)
│   ├── HudBg (ColorRect)
│   ├── CalendarLabel  [%CalendarLabel]  "Thursday, January 1, 2026"
│   ├── DayProgressLabel  [%DayProgressLabel]  "Journey Day 1"
│   ├── SanityHBox
│   │   └── SanityLabel  [%SanityLabel]  "🧘 50 / 100"
│   └── MoneyHBox
│       └── MoneyLabel  [%MoneyLabel]  "💰 50 / 100"
├── ContentHost (Control) — instanced scenes appear here
├── ResultModal (Control) — "Day Complete" overlay (hidden)
│   ├── ModalBg (ColorRect)
│   └── ModalPanel
│       └── ModalVBox
│           ├── ModalTitle  [%ModalTitle]  "Day Complete"
│           ├── ModalActionText  [%ModalActionText]
│           ├── ModalEventTitle  [%ModalEventTitle]
│           ├── ModalEventDesc  [%ModalEventDesc]
│           ├── ModalStatsLabel  [%ModalStatsLabel]
│           └── ModalContinueBtn  [%ModalContinueBtn]
└── GameOverPanel (Panel, hidden)
    └── GameOverVBox
        ├── GameOverTitle
        ├── GameOverLabel  [%GameOverLabel]
        └── RestartBtn  [%RestartBtn]
```

All `[%Name]` nodes have `unique_name_in_owner = true` for clean script access.

**HUD** — Text-only counters (`🧘 Sanity: 50 / 100`, `💰 Money: 50 / 100`). No progress bars. Low-stat warning colours and `" — Low sanity!"` / `" — Low money!"` text appear when a stat drops below 25.

### Hub screen (`hub.tscn`)

```
Hub (Control) ← script: hub.gd
└── VBoxContainer
    ├── TitleLabel       "Balance of Spirit"
    ├── SubtitleLabel    "Find equilibrium between community and coin"
    ├── Spacer1
    ├── SpiritualBtn     [%SpiritualBtn]   "🧘 Visit Spiritual Community"
    ├── BarBtn           [%BarBtn]         "🍺 Visit the Bar"
    ├── Spacer2
    ├── CharactersBtn    [%CharactersBtn]  "👥 Characters"
    └── HistoryLabel     [%HistoryLabel]   "Recent History: …"
```

### Location scenes (`spiritual_community.tscn` / `bar.tscn`)

Both share the same structure, inheriting from `location_base.gd`:

```
Location (Control) ← script: spiritual_community.gd or bar.gd
├── BackgroundTexture (TextureRect)  [%BackgroundTexture]
├── BackgroundFallback (ColorRect)   [%BackgroundFallback]
├── Overlay (ColorRect)              [%Overlay]
└── ContentVBox
    ├── LocationName  [%LocationName]  "Spiritual Community" / "The Bar"
    ├── LocationDesc  [%LocationDesc]  atmosphere description
    ├── ActionBtn     [%ActionBtn]     the action (+15/-12 etc.)
    └── BackBtn       [%BackBtn]       "← Back to Hub"
```

**Background behaviour** — When a `background_texture` is assigned, `BackgroundTexture` becomes visible and `BackgroundFallback` is hidden. When no texture is set, the fallback ColorRect is shown instead (solid dark colour). Both the `@export var` setter and `_ready()` toggle this pair, so the fallback never covers an assigned image.

### Characters screen (`character_profiles.tscn`)

```
CharacterProfiles (Control) ← script: character_profiles.gd
└── VBoxContainer
    ├── TitleLabel          "Characters"
    ├── ScrollContainer
    │   └── CharListVBox  [%CharListVBox]  — populated at runtime
    ├── Spacer
    ├── DetailPanel  [%DetailPanel] (hidden)
    │   └── DetailVBox
    │       ├── DetailName          [%DetailName]
    │       ├── DetailRole          [%DetailRole]
    │       ├── DetailBio           [%DetailBio]
    │       ├── DetailRelationship  [%DetailRelationship]
    │       └── DetailLocation      [%DetailLocation]
    ├── Spacer2
    └── BackBtn  [%BackBtn]  "← Back to Hub"
```

**Portrait rendering** — Each character-row portrait is a `Control` container holding both a `TextureRect` and a `Label`:
- When `char_profile.portrait` is non-null → the `TextureRect` is visible and displays the assigned texture; the initials label is hidden
- When `char_profile.portrait` is null → the `TextureRect` is hidden; the initials label is visible and shows the character's initials (e.g. "G" for Geo)

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
│                     │  ② Rent check (Days 7,14,21,28)   │
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
│                     │           Continue →               │
│                     │                   │                │
│                     │            GameState.advance_day() │
│                     └──────────────────┘                 │
└──────────────────────────────────────────────────────────┘
```

Effect order within each action (①②③④⑤ above):  
**① location action** (sanity/money deltas applied, clamped to 0..100)  
**② Sunday rent** (−18 money, charged exactly once per Sunday, every Sunday indefinitely)  
**③ scheduled random event** (fires every 2–5 completed journey-days via deterministic scheduling; no probability rolls)  
**④ stat clamping** applied per-step via `minf`/`maxf`/`clampf`  
**⑤ loss-only check** — game-over triggers when sanity ≤ 0 or money ≤ 0 only. There is no day-limit victory. The game continues indefinitely.

**Note:** Game-over is checked only after rent and the random event have both been resolved, so a helpful event can rescue a resource that would otherwise have hit zero.

---

## Data layer

### GameState (`game_state.gd`) — the central model

- Created as a child of `Main` in `main.gd._ready()` (not an autoload)
- Emits signals: `stats_changed`, `day_changed` (journey_day, weekday_name, month_name, year, day_of_month), `game_over_triggered`, `history_updated`
- Handles: stat changes, in-game Gregorian calendar starting **Thursday, January 1, 2026**, history (last 5), recurring Sunday rent, game-over logic
- Calendar: `day_of_month`, `month_index` (0=Jan), `year` (starts 2026), `journey_day` (elapsed actions, used for event scheduling). `get_date_display()` returns e.g. `"Thursday, January 1, 2026"`
- Calendar advancement handles month/year rollover with February 29 leap-year support
- Rent: charged exactly once every Sunday, identified by `get_weekday_index() == 6`. Tracked via `_last_rent_day_of_month` to prevent double-charging. Uses `apply_rent_if_sunday()` method.
- Game-over conditions: sanity ≤ 0 or money ≤ 0 only. **No day-limit victory** — the game continues indefinitely through future months and years.
- Owns the `CharacterProfile[]` array (14 characters from `CharacterData`)

### Events (`event_manager.gd` + `event_definition.gd`)

- **25+ event definitions** with location-restricted selection and explicit rarity weights
- **Scheduled event system**: No probability rolls. On restart, the first event is scheduled 2–5 completed journey-days ahead. After each event, the next is scheduled another 2–5 days ahead. Constants: `MIN_EVENT_GAP_DAYS = 2`, `MAX_EVENT_GAP_DAYS = 5`.
- Categories: `SPIRITUAL`, `FINANCIAL`, `BAR`, `COMMUNITY`, `BURNOUT`, `FRIEND`
- All events have a `required_location` field (either `"spiritual_community"` or `"bar"`). Bar actions only get Bar events; Spiritual Community actions only get Community events.
- **Explicit rarity** on every event via `EventDefinition.Rarity`:
  - `STANDARD` — weight 10, effects 4–12 points
  - `RARE_HELPFUL` — weight 2, effects 15–25 points (e.g. +25 sanity or +25 money)
  - `RARE_HURTFUL` — weight 2, effects 10–20 points (e.g. −20 sanity, −18 sanity)
- Burnout event (`"burnout"`) only fires when visiting the Bar with 3+ consecutive bar days
- Dedup: won't pick the same event two **consecutive** times if another valid event exists
- Result modal shows the rarity label (e.g. `[ Common ]`, `[ Rare (Helpful) ]`)

**`EventManager.reset()`** — Resets `_previous_event_id`, `_consecutive_bar_days`, `_next_event_day`, and re-schedules the first event 2–5 days from day 1. Called by `main.gd._on_restart_pressed()`.

### Characters (`character_data.gd` + `character_profile.gd` + `character_profiles.gd`)

- `CharacterProfile` is a custom `Resource` with: id, display_name, role, bio, relationship, location, portrait, notes
- 14 characters: Léon (protagonist) + 13 side characters
- `CharacterData.create_all_profiles()` is a static factory called once by GameState
- Characters screen shows scrollable list with name/role + detail panel on click

---

## Game Balance

|              | Sanity | Money | Calendar |
|--------------|--------|-------|----------|
| Start        | 50     | 50    | Thursday, January 1, 2026 |
| Max          | 100    | 100   | Ongoing  |
| **Spiritual**| **+15**| **−10**| +1 journey day |
| **Bar**      | **−12**| **+12**| +1 journey day |

Rent: **−18 money** every Sunday (determined by weekday, not day-number), charged **once** per applicable day before the random event  
Lose: sanity ≤ 0 or money ≤ 0 — no victory condition, the game continues indefinitely  
Events follow a **deterministic 2–5 day schedule** with explicit Standard / Rare Helpful / Rare Hurtful weights  

The game forces a hard tradeoff. Alternating locations roughly sustains both.  
Random events provide unpredictable boosts or setbacks every few days.

---

## Event Catalog

### Spiritual Community
| Rarity | Event | Sanity Δ | Money Δ |
|--------|-------|----------|---------|
| Standard | Inspiring Meditation | +8 | 0 |
| Standard | Moment of Clarity | +10 | 0 |
| Standard | Community Support | +8 | 0 |
| Standard | Community Potluck | +8 | +8 |
| Standard | Group Healing Circle | +12 | 0 |
| Standard | Wise Elder Visit | +10 | 0 |
| Standard | Small Fundraiser | +5 | +5 |
| Standard | Spiritual Doubt | −8 | 0 |
| Standard | Community Disagreement | −6 | 0 |
| **Rare Helpful** | **Deep Meditation Breakthrough** | **+25** | 0 |
| **Rare Hurtful** | **Spiritual Crisis** | **−20** | 0 |
| **Rare Hurtful** | **Schism in the Community** | **−10** | 0 |

### Bar
| Rarity | Event | Sanity Δ | Money Δ |
|--------|-------|----------|---------|
| Standard | Unexpected Tips | 0 | +8 |
| Standard | Slow Night | 0 | −5 |
| Standard | Difficult Customer | −6 | 0 |
| Standard | Regular Tells a Story | +6 | 0 |
| Standard | Philosophical Drunk | +4 | 0 |
| Standard | Karaoke Night Success | +8 | +8 |
| Standard | Broken Equipment | 0 | −12 |
| **Rare Helpful** | **Big Tip Night** | 0 | **+25** |
| **Rare Hurtful** | **Bar Fight** | **−18** | **−8** |
| **Rare Hurtful** | **Burnout** | **−15** | 0 (needs 3+ consecutive bar days) |

### Rent (scheduled, not random)
| Day | Event | Money Δ |
|-----|-------|---------|
| Every Sunday | Rent (determined by weekday) | −18 |

---

## Browser Export

- **Renderer**: Compatibility (`gl_compatibility`) — WebGL 2.0
- **Window**: 800×600, `canvas_items` stretch, `expand` aspect
- **Export preset**: `export_presets.cfg` → Web → outputs to `build/web/index.html`
- **Single-threaded**: no SharedArrayBuffer — works on itch.io / any static host
- **Requires**: HTML5 export templates installed (Editor → Manage Export Templates → Download)

---

## Validation History

The following issues were identified and corrected during a focused validation pass:

| # | Problem | Correction | File(s) changed |
|---|---------|------------|----------------|
| 1 | `BackgroundFallback` remained visible when a texture was assigned at runtime, drawing on top of the image | Setter now hides fallback when texture is non-null: `%BackgroundFallback.visible = value == null` | `location_base.gd` |
| 2 | Characters only showed a plain `Label` with initials; no `TextureRect` for actual portrait images | Replaced single label with a `Control` container holding both a `TextureRect` (visible when `portrait != null`) and an initials `Label` (visible when `portrait == null`) | `character_profiles.gd` |
| 3 | Day-30 victory condition removed; game now has no day-limit win | Removed `MAX_DAYS`, removed `game_won` signal and handler, `check_game_over()` only checks sanity≤0 or money≤0 | `game_state.gd`, `main.gd` |
| 4 | Rent used a hardcoded day list [7,14,21,28] that didn't extend past day 28 | Replaced with Sunday-weekday check via `apply_rent_if_sunday()`, tracked with `_last_rent_day_of_month` for once-per-Sunday dedup | `game_state.gd`, `main.gd` |
| 5 | Calendar display was `"January 2026 – Week 1 – Thursday"` — omitted the day-of-month | Changed to `"Thursday, January 1, 2026"` via `get_date_display()`, journey day shown via separate `"Journey Day X"` label | `game_state.gd`, `main.tscn` |
| 6 | Random events used a probablistic cooldown system (30% chance per day after 3-day min gap) with unbounded max gap | Replaced with deterministic scheduling: events fire every 2–5 completed journey-days with no probability roll. Constants: `MIN_EVENT_GAP_DAYS=2`, `MAX_EVENT_GAP_DAYS=5` | `event_manager.gd`, `main.gd` |
| 7 | Events had no explicit rarity; weights were small and inconsistent | Added `EventDefinition.Rarity` enum (STANDARD/RARE_HELPFUL/RARE_HURTFUL) with weights 10/2/2. `_make_event` now accepts rarity. Result modal shows `[ Common ]` / `[ Rare (Helpful) ]` / `[ Rare (Hurtful) ]` | `event_definition.gd`, `event_manager.gd`, `main.tscn`, `main.gd` |
| 8 | General events had no `required_location` so Bar events could fire at Community and vice-versa | All events now have a `required_location` field set to either `"spiritual_community"` or `"bar"`. `_build_pool` filters strictly by location. | `event_manager.gd` |
| 9 | Progress bars were removed but low-stat warnings were also removed | Restored low-stat warnings as text: font turns red and `" — Low sanity!"` / `" — Low money!"` is appended when stat < 25 | `main.gd` |
| 10 | `day_changed` signal had 6 params but some connections were stale | Updated signal to 5 params (journey_day, weekday_name, month_name, year, day_of_month). All connections and callbacks updated. | `game_state.gd`, `main.gd` |

---

## How to share with another AI

This whole project fits in one message. Include the **Project Structure** section above for context, then paste the key scripts below. The AI can ask for any specific file.

### Key architectural patterns to tell another AI

1. **`main.gd`** is the controller — owns GameState + EventManager, manages scene switching, HUD updates, result modals
2. **No autoloads** — GameState is created as a child of the Main node in `_ready()`
3. **Signals everywhere** — `hub.gd` emits `visit_location`, locations emit `go_back`/`location_action_performed`, GameState emits `stats_changed`/`day_changed`/`game_over_triggered`
4. **All %Name nodes** have `unique_name_in_owner = true` in scenes — used via `@onready var x: Type = %X`
5. **Theme overrides** use method calls (`add_theme_color_override`, `remove_theme_stylebox_override`) not bracket notation
6. **Events are data-driven** — `EventManager` selects from a weighted pool with constraints; all event data is in `.gd`, not `.tscn`
7. **Characters are Resources** — `CharacterProfile` extends `Resource`, created by static factory `CharacterData.create_all_profiles()`
