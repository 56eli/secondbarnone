# Design principles

**Read this before changing anything.** It is the shortest description of how
secondbarnone is built and why. `PROJECT_OVERVIEW.md` describes *what* the game
is; this describes *how decisions get made*, so that work by different hands at
different times still adds up to one game.

Every principle below was earned — each one is the generalisation of a real bug
that shipped. Where a rule cites an incident, that is not decoration: it is the
evidence for why the rule is worth its cost.

---

## The one-line summary

> **Rules live in `core/` and `data/`, are pure, and are asserted as
> invariants. The UI is a projection of state that must never be able to
> disagree with it.**

---

## 1. Architecture

### 1.1 `core/` and `data/` never touch the DOM

Enforced by convention and by the fact that the whole test suite runs
headlessly. If a rule cannot be tested without a browser, it is in the wrong
file.

```
core/   how the game works      (pure, testable, no DOM)
data/   what is in the game     (pure data + pure helpers)
ui/     how it is shown         (reads state, never mutates it)
app.js  wiring                  (the only place the two meet)
```

**`ui/` may read state; it must never write it.** Every mutation goes back
through a callback into `app.js`, which calls into `core/`. When you find
yourself wanting to set a field from a renderer, add a callback instead.

### 1.2 One function per decision, shared by preview and resolution

`computeDayEffects()` is called by the hub card, the location screen and
`resolveTurn()`. There is exactly one implementation of "what does this day
offer", so **the preview cannot lie**.

Any new mechanic that a player sees before committing to it must follow the
same shape: one pure function, called by both the thing that shows it and the
thing that applies it. Two code paths for one number is a permanent bug
generator.

### 1.3 Pass data, not formatted prose

`computeDayEffects()` returns `factors` — `{kind, emoji, label}` objects —
alongside the human-readable `reasons` strings.

> **Incident.** Three renderers recovered the weather emoji by string-matching
> nine emoji *out of the display copy* (`r.includes('☀️') || …`), to
> rediscover a value the engine already had. It was copy-pasted three times and
> shipped a `ReferenceError` to production (PRs #23/#24).

If the UI needs to branch on something, return it as data. Prose is for
humans, at the end of the pipeline, once.

### 1.4 One source of truth per visual dimension

> **Incident.** `.avatar` declared `width: 56px; height: 56px; flex: 0 0 42px`.
> Every avatar sits in a flex row, where flex-basis wins on the main axis, so
> portraits rendered 42×56 and `border-radius: 50%` drew an **oval**. Every
> individual declaration looked reasonable.

Sizes that must agree are derived from one custom property (`--avatar-size`).
Variants set the property and nothing else. `tests/presentation.test.js`
fails the build if a variant re-introduces a raw `width`/`height`/`flex`.

---

## 2. Game rules

### 2.1 A day is atomic

Resolving a day and advancing past it are **one operation**, inside
`resolveTurn()`.

> **Incident.** `advanceDay()` used to be called from the result modal's
> Continue handler, while the autosave fired before it. Refreshing at the modal
> reloaded a save with the day's gains banked and the calendar unmoved. Ten
> refreshes took a run from 30 sanity / 20 energy to 100/100 without spending a
> day — bypassing rent, the endurance goal, and every day-gated unlock.

The general rule: **there must be no persistable state that represents half a
transaction.** If you add a multi-step interaction, make the whole thing
resolve in one call, or give the intermediate state an explicit representation
in the save that the loader knows how to finish.

### 2.2 Derived, never rolled

Weather and daily variance are pure functions of `(day, seed)` via FNV-1a hash,
not RNG draws.

Consequences worth preserving: the almanac can read four days ahead without
consuming randomness; reloading a save shows the same day rather than
re-rolling it in the player's favour; and the hub can rerender on any stat
change without the board shifting under the player's hand.

**Anything the player can see in advance must be derived.** Anything they
cannot may use the seeded RNG.

### 2.3 Every currency needs a sink

> **Incident.** Insight was awarded for the whole run and the entire perk tree
> cost 66. From roughly day 20, insight accumulated with **nothing to buy** — a
> currency the game kept paying out that had stopped meaning anything.

Perks are the permanent tier and are finite by design. **Observances**
(`data/observances.js`) are the repeatable tier and are what makes insight
matter at day 90. Before adding a new resource, say where it drains.

### 2.4 Pressure rises; counterplay rises with it

> **Incident.** Rent was flat at 18 for a 300-day run and *fell* with
> reputation and the union perk. The only economic pressure in the game got
> cheaper the longer you survived, and a four-branch `if/else` held the city
> for 300 days at 99 sanity and 1,765 money.

Rent now steps up every fortnight to a ceiling. Relief still applies **on
top**, so investment keeps paying — it buys back a rising cost instead of
discounting a static one. `tests/balance.test.js` asserts the perk tree is
worth at least three runs in twelve; that gap is the justification for the
escalation existing.

**Corollary — paying ahead is never a discount.** `prepayCost()` prices each
week at the Sunday it actually covers. Two separate exploits came from getting
this wrong (a 44% weekly discount, then a 20% bulk-buy dodge). Convenience
mechanics buy *certainty*, never a better rate.

### 2.5 A win condition must be satisfiable

> **Incident.** The mastery layer required `reputation >= 80` *and*
> `money >= 200` alongside broad exploration and no bar streaks. Those are
> mutually exclusive: 25 seeds of a competent explorer cleared every other
> condition and failed on money **every time**. It was also undocumented — no
> achievement, no almanac entry, no mention in any file.

Before shipping a goal: **simulate a player who is trying to reach it**, and
make it discoverable in-game. If a player cannot find out a thing exists, it
does not exist.

### 2.6 No free lunches

Every location must cost something on its **luckiest** possible day. Enforced
by test, including with an observance running.

---

## 3. Testing

### 3.1 Invariants over examples

371 example-based tests at 99.5% line coverage did not catch the save exploit
or the rent discount. Both lived in code every one of those tests ran.
**Coverage measures whether a line executed, not whether the input space was
explored.**

`tests/invariants.test.js` states properties that must hold for *every*
reachable state and fuzzes thousands of them. It found two real bugs in code
written the same afternoon (`[]` migrating into a blank save;
`{"gameState":null}` importing the envelope as a run).

When adding a system, ask: *what must be true of it in every state?* That
sentence is the test.

### 3.2 Test the promise, not the attribute

`aria-modal="true"` is a claim that nothing outside the dialog is reachable.
The test checks **reachability**, not the attribute. Three controls were
tabbable behind a dialog that declared itself modal.

### 3.3 Exploit tests are permanent

`tests/exploits.test.js` reproduces each exploit as a sequence of real
operations — save, reload, replay — rather than asserting on an internal flag.
A refactor that keeps the flag but breaks the protection must fail. **Never
delete one**, even if the exploit becomes impossible for unrelated reasons.

### 3.4 Assert against constants, not literals

A test that hard-codes `assert.equal(raw.v, 5)` breaks on every schema bump and
teaches the next person that migrations are dangerous. Import
`CURRENT_SAVE_VERSION` instead. The same goes for balance numbers: reference
`RENT_AMOUNT`, never `18`.

### 3.5 Tiers, so the fast gate is fast

| Command | Contents | Time |
| --- | --- | --- |
| `npm run test:fast` | rules, balance, invariants, exploits, content | ~3s |
| `npm run test:ui` | jsdom: DOM, UI, accessibility, portrait popup | ~100s |
| `npm run test:assets` | image dimensions, hashes, budgets (ImageMagick) | ~13s |
| `npm test` | everything | ~120s |

Run `test:fast` constantly; let CI run the rest. Do not add a jsdom test for
something a pure test can prove.

---

## 4. Content

### 4.1 Structure over discipline

Events are declared as a **map of location id → events**, and
`buildEventPool()` stamps `requiredLocation` from the key. An event physically
cannot drift away from its location, because the gate is not a field anyone has
to remember to fill in.

Prefer designs where the invariant is structural. A rule that relies on an
author remembering will eventually meet an author who does not.

### 4.2 Every character is bound to one location, with at least three events

This is what makes a location somewhere specific people are rather than a slot
machine with scenery. Enforced by test.

**Known limitation:** 77 of 78 characters have *exactly* three, so the floor is
also the ceiling. `affinity` exists to break this — see the roadmap.

### 4.3 Adding content is a checklist, and it should be a script

Adding one location currently means coordinated edits across `locations.js`,
`characters.js` (×3 people), `events.js` (×9 events), `SMALL_TALK`, two asset
directories and six image files. The failure mode is a red suite rather than a
helpful error.

**Check the asset budget first** — `node scripts/check-assets.js` hard-fails
above 8 MB and the margin is thin. See `DEVELOPMENT_ROADMAP.md` for the
scaffolding tooling this wants.

---

## 5. Accessibility

Not a feature; a correctness property, tested in
`tests/accessibility.test.js`.

- Modals trap focus (`inert` on every non-dialog child of `<body>`, not just
  `#app` — the skip link is a sibling), close on Escape, and restore focus.
- Exactly one `<h1>`; the heading outline is sane.
- Every interactive control has an accessible name.
- Panels that swap content on selection are `aria-live`.
- Destructive actions confirm. "Reset game" arms first, fires second.
- `prefers-reduced-motion` disables particles and collapses transitions.

**Still owed:** text size, high contrast, a non-colour stat mode (the bars
currently encode status in hue alone), and arrow-key navigation on the People
listbox. Tracked in the roadmap.

---

## 6. Process

### 6.1 Comments explain *why*

The codebase's strongest quality is that its comments justify decisions rather
than restate code. Keep it. When you fix a bug, leave the reasoning where the
next person will hit it — most comments in `core/` exist because someone got it
wrong once.

### 6.2 Every quality gate runs in CI

`docs/ci/github-actions-ci.yml` runs lint, typecheck, formatting, all three
test tiers, asset integrity and the coverage floor. It ships **inactive** —
see `docs/ci/README.md` for the one command that enables it, and why it could
not be committed to `.github/workflows/` directly. Do not merge red.

### 6.3 Document pending work where it will be found

`DEVELOPMENT_ROADMAP.md` is the single list of what is not done, ordered, with
the reasoning attached. `TECHNICAL_REVIEW.md` is the point-in-time audit that
produced it. If you defer something, write it down there — not in a comment
nobody greps for.

### 6.4 Save schema changes are cumulative

`migrateSave()` walks version to version, falling through, so a v3 save reaches
current through every intermediate default. Adding v7 means **adding a block at
the bottom**, never editing the ones above it. Add a fixture to the migration
test for every version the game claims to support.
