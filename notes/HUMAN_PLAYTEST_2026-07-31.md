# Human playtest intake — 31 July 2026

**Source:** owner playthrough and follow-up interview  
**Outcome:** reached day 150 / enlightenment  
**Product preference:** short, replayable game  
**Strongest area:** presentation broadly (art, audio, writing, UI atmosphere)

## Raw feedback, preserved

- Difficulty is nice, but the locations do not feel well-rounded.
- Most locations cost a lot of energy. The current system is balanced, but the experience feels choppy: “high low high low” from day to day.
- Character descriptions, events, and art still need owner personalization/manual intervention.
- The core loop becomes repetitive. The 60-day achievement helps, but handwritten/funny moments are what make the game memorable.
- Replayability therefore depends on a quick laugh or surprising authored beat appearing occasionally.

## Senior interpretation

This is not primarily a difficulty complaint. It is a **rhythm and authored-density complaint**.

The current economy is mathematically coherent, but the energy profile clusters many actions around meaningful negative costs:

- founding community: −14;
- bar: −26;
- clinic: −14;
- soup kitchen: −16;
- night market: −14;
- open mic: −16;
- Sato: −16;
- Vermillion: −24;
- LoC Mines: −26;
- retreat: −30.

Recovery exists, but it is concentrated in a small number of explicit rest locations (+18 bathhouse, +28 loft). That creates a repeating **push → crash → recovery** waveform even when the long-run win rate is fair. The player experiences the cost curve as abrupt because individual days have similar energy direction and the meaningful recovery decision is obvious.

The right first response is not to make the game easier or flatten all costs. It is to add **more playable middle states**:

1. low-cost “breathing room” days that still advance a goal;
2. moderate-cost activities that trade two resources instead of only draining energy;
3. authored micro-beats that make a non-optimal day feel worthwhile;
4. more differentiated location identities so the player is choosing a mood/plan, not just selecting the next energy sign.

## Product north star

> A short, replayable narrative balance game where each run is mechanically readable, emotionally colored by the cast, and punctuated by a memorable authored laugh or surprise often enough that starting again feels worthwhile.

This implies:

- preserve the current resource tension and deterministic seed promise;
- target a satisfying short run before the 60-day acknowledgement, while retaining the 150-day endurance arc for committed players;
- prioritize authored density and location rhythm over adding more systems;
- treat art and writing as owner-directed content, not bulk AI-generated filler;
- tune for **felt cadence** (energy/resource shape over consecutive days), not only aggregate survival rates.

## Proposed design workstreams

### P1 — Cadence pass, before new content

Instrument and report per-run rhythm metrics in the simulator:

- consecutive negative-energy days;
- consecutive positive-energy/recovery days;
- number of days below 25 energy;
- number of “breathing room” days with energy cost at most −8;
- resource swing between adjacent chosen locations;
- ratio of recovery days to work days;
- days where the best available choice is effectively forced.

Use these metrics to identify whether the sawtooth is caused by the catalogue, hub availability, weather, or player policy. Do not tune by intuition alone.

### P1 — Location role taxonomy

Audit every location against a readable role:

- **earn:** money-positive, manageable energy;
- **restore:** energy/sanity-positive, explicit cost;
- **connect:** reputation/relationship value with moderate resource cost;
- **explore:** unusual event/insight value, variable economy;
- **risk:** high reward and high cost, clearly signposted.

Every hub day should ideally expose a mix of roles when gates/weather allow. A location may have multiple tags, but one primary player-facing role should be clear.

### P1 — Authored “laugh beat” distribution

Create a small manual content plan rather than generating another large event batch:

- 1–2 low-stakes comic or strange micro-beats per major location;
- a few event outcomes that react to current resource state or recent choices;
- recurring callback lines so a run builds a memory;
- explicit owner review for voice, character identity, and art references.

The goal is not more text. It is a predictable chance of a memorable beat during a short run.

### P2 — Replayability wrapper

After cadence and content are improved, evaluate a short-run structure:

- a compact 14- or 21-day “episode” that uses the same city and systems;
- seed-linked run summary and a reason to try another seed;
- optional challenge modifiers only after the base loop is stable;
- preserve the 60-day achievement as the full-run milestone, not the only satisfying endpoint.

Do not add a separate mode until the base cadence metrics and playtest feedback show what the short run should contain.

## Acceptance criteria for the next tuning pass

- No broad difficulty change without a before/after 300-seed report.
- Report cadence metrics for inattentive, average, and engaged models.
- No location is changed without an explicit role, intended emotional tone, and weather/gate review.
- Keep the hard-collapse rule, but reduce unnecessary adjacent-day whiplash through role variety rather than free energy.
- Add a small manual event batch only after the owner reviews character voice and art direction.
- Re-run the owner playtest after each focused change and record whether the rhythm feels less “high low high low.”

## Immediate next step requiring owner direction

Before changing numbers, choose one of these tuning philosophies:

1. **Gentle cadence:** add more low-cost neutral locations/variants while preserving the current resource averages.
2. **Meaningful recovery:** make some non-rest locations restore a small amount of energy in exchange for money/sanity/reputation.
3. **Choice density:** keep the numbers but improve hub role composition so recovery and moderate options appear more reliably.
4. **Hybrid:** combine small cadence changes with a role-composition pass; recommended starting point.

The recommended sequence is to instrument first, then run the same 300-seed models, then make the smallest hybrid catalogue adjustment that reduces consecutive negative-energy streaks without raising the success ceiling.
