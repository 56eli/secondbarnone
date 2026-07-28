# Continuous integration

`github-actions-ci.yml` is a ready-to-use GitHub Actions workflow for this
repository. **It is not active yet** — it lives here rather than in
`.github/workflows/` because the automation account that authored it cannot
create workflow files (GitHub rejects pushes that add or edit
`.github/workflows/**` without the `workflows` OAuth scope).

## Activating it

A maintainer with normal write access enables it in one command:

```bash
mkdir -p .github/workflows
git mv docs/ci/github-actions-ci.yml .github/workflows/ci.yml
git commit -m "Enable CI"
git push
```

Nothing else needs changing. There are no secrets, no external services and no
paid runners — it installs dev dependencies and runs the scripts already in
`package.json`.

## Why it matters

Every quality gate in this repository is currently **voluntary**. `npm run
check` exists, is good, and nothing runs it. That is how a `ReferenceError` in
the hub renderer reached production and had to be fixed twice (PRs #23 and
#24) — a thirty-second lint would have caught it.

## What it runs

The job is split to match the test tiers in `package.json`, so a failure names
the layer that broke rather than reporting "tests failed".

| Job | Command | Roughly |
| --- | --- | --- |
| `quality` | `lint`, `typecheck`, `format:check` | 10s |
| `rules` | `test:fast` — balance, invariants, exploits, content | 3s |
| `interface` | `test:ui` — jsdom DOM, UI and accessibility | 100s |
| `assets` | `test:assets` + `check-assets.js` (installs ImageMagick) | 40s |
| `coverage` | `coverage:check` — 80% floor on all three metrics | 120s |

`rules` is the gate that should fail first: it is the fastest and covers the
game logic where the expensive bugs live.

## Running the same checks locally

```bash
npm run test:fast     # while working — 325 tests, ~3s
npm run check         # before pushing — everything + asset integrity
```
