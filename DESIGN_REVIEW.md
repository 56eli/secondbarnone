# Calm-play design review

This pass treats attention as a game resource. The goal is not to remove depth,
but to leave the next meaningful choice visible without asking the player to
scan a dashboard of secondary systems.

## Feature triage

| Feature assessed | Decision | Why |
| --- | --- | --- |
| **Commitments** (multi-day task contracts) | **Removed** | They asked players to track deadlines, progress bars, rewards and failure penalties on top of the core balance game. The planning pressure took a disproportionate amount of hub and location space without strengthening the day-to-day choice. |
| **Journal** (long-form run log / notes) | **Removed** | It repeated the recent-history information already available at the hub, while adding another destination and an ever-growing reading surface. The hub keeps five concise recent-day lines instead. |
| **Hub mood sentence** | **Removed** | It repeated information already communicated by four resource gauges and competed with the greeting and focus cue. Its useful role is now handled by one state-specific, actionable-but-non-prescriptive cue. |
| Weather and forecast | **Kept** | Weather is legible, predictable, atmospheric and directly useful. It remains visible as a small current-sky badge, with the four-day forecast available in the Almanac rather than pushed into every decision. |

Exactly **three** secondary features were removed in this pass; no additional
feature was cut merely to make the interface sparse.

## Changes made

- Elevated Léon’s persistent HUD portrait from 44px to 60px (52px on narrow
  screens), strengthened his name weight, and retained the current weather in
  the same glanceable top row.
- Rebuilt the hub around a single heading, two primary daily destinations and
  one quieter City route. Satchel, Practice, Weather & milestones, and People
  now sit in one compact `Keep close` row.
- Added a read-only **daily focus cue**. It calmly calls attention to low
  sanity, energy, money or imminent rent without choosing a destination for
  the player. It becomes a reassuring “No rush” cue when nothing needs urgent
  attention.
- Replaced host biography/relationship copy on location pages with a short,
  character-specific greeting. Every location host has at least three lines;
  a deterministic day-based selection avoids flicker while naturally rotating
  on future visits. Full bios remain in People, where they belong.
- Added dedicated environmental art for all five previously unillustrated
  locations: Soup Kitchen, Flea Market, Verrier & Son Pawnbrokers, Open Mic,
  and Letting Office.
- Audited the event cast: **51 of 64 events (79.7%)** are associated with side
  characters. A catalogue test now enforces the requested 50% minimum.

## Coherence check

### Technical

- The deleted systems have been removed from state, turn resolution, UI,
  serialization and data imports; `v3` saves migrate their shared run data into
  the calmer `v4` shape while retired task/log fields are safely ignored.
- The coherence pass found that two item rewards had only been available via
  retired tasks. They now arrive through ordinary, character-led events, with a
  test preventing those rewards from becoming stranded again.
- All 22 locations now declare a deployable WebP background, and the asset
  check derives those references directly from the location catalogue.
- The dialogue, nudge and social-event rules are covered by unit and jsdom UI
  tests. Coverage remains well above the project’s 80% threshold.

### Atmosphere

The city still feels inhabited: hosts meet Léon with their own voice, the
recent-history drawer preserves a small sense of accumulated days, and the
weather remains a gentle part of the place rather than a warning dashboard.
The UI now lets the player first see *where to spend today*, then open deeper
systems only when wanted.
