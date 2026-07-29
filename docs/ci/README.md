# Continuous integration

`github-actions-ci.yml` is a ready-to-use GitHub Actions workflow for this
repository. **It is not active yet** — it lives here rather than in
`.github/workflows/` because the automation account that authored it cannot
create workflow files: GitHub rejects pushes that add or edit
`.github/workflows/**` without the `workflows` OAuth scope, and its token does
not have that scope (confirmed again 2026-07-28 — a second attempt to push the
file was refused with the same error). A human maintainer's credentials do
have it.

## Activating it

One command, from a checkout with normal write access:

```bash
./scripts/enable-ci.sh
```

The script verifies the prepared workflow exists, moves it to
`.github/workflows/ci.yml`, commits and pushes. Nothing else needs changing.
There are no secrets, no external services and no paid runners — the workflow
installs dev dependencies and runs the scripts already in `package.json`.

## Why it matters

Every quality gate in this repository is currently **voluntary**. `npm run
check` exists, is good, and nothing runs it automatically. That is how a
`ReferenceError` in the hub renderer reached production and had to be fixed
twice (PRs #23 and #24) — a thirty-second lint would have caught it.

Until CI is on, the safety net is local discipline:

- `npm run test:fast` while working (~3 s),
- `npm run check` before **every** push (tests + asset integrity),
- `scripts/install-git-hooks.sh` installs a pre-push hook that runs
  `npm run check` and refuses the push if it fails. Opt-in per clone, but it
  makes "forgot to run the gates" a non-event.

## What it runs

The job is split to match the test tiers in `package.json`, so a failure names
the layer that broke rather than reporting "tests failed".

| Job          | Command                                                  | Roughly |
| ------------ | -------------------------------------------------------- | ------- |
| `quality`    | `lint`, `typecheck`, `format:check`                      | 10 s    |
| `rules`      | `test:fast` — balance, invariants, exploits, content     | 3 s     |
| `interface`  | `test:ui` — jsdom DOM, UI and accessibility              | 40 s    |
| `assets`     | `test:assets` + `check-assets.js` (installs ImageMagick) | 40 s    |
| `coverage`   | `coverage:check` — 80% floor on all three metrics        | 60 s    |

`rules` is the gate that should fail first: it is the fastest and covers the
game logic where the expensive bugs live.

Deliberately **not** in the workflow: `npm run test:mutation`. The mutation
harness writes to source files and refuses to run on a dirty tree, which
makes it a poor per-commit gate — it belongs to a scheduled nightly run or a
manual pass before a release. See roadmap 3.4.

## Running the same checks locally

```bash
npm run test:fast     # while working — 353 rules tests, ~3 s
npm run check         # before pushing — everything + asset integrity
```
