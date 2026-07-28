#!/usr/bin/env bash
# Enables the prepared GitHub Actions CI workflow.
#
# Why this exists: the workflow below was authored by an automation account
# whose GitHub App token lacks the `workflows` OAuth scope, so *it* cannot
# push a file under .github/workflows/. A human maintainer's credentials can.
# This script does the whole activation: move, commit, push. Run it once:
#
#     ./scripts/enable-ci.sh
#
set -euo pipefail
cd "$(dirname "$0")/.."

SRC="docs/ci/github-actions-ci.yml"
DST=".github/workflows/ci.yml"

if [ -f "$DST" ]; then
  echo "CI is already enabled ($DST exists). Nothing to do."
  exit 0
fi
if [ ! -f "$SRC" ]; then
  echo "error: $SRC not found — the prepared workflow is missing." >&2
  exit 1
fi

mkdir -p .github/workflows
git mv "$SRC" "$DST"
git commit -m "Enable CI: activate the prepared GitHub Actions workflow"
git push
echo "CI enabled. The workflow will run on the next push to any branch."
