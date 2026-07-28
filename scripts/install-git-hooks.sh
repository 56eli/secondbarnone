#!/usr/bin/env bash
# Installs the repository's Git hooks into this clone.
#
# Hooks are not versioned by Git (they live in .git/hooks/), so every clone
# must opt in once:
#
#     ./scripts/install-git-hooks.sh
#
# What you get: a pre-push hook that runs `npm run check` (the full test
# suite plus asset integrity) and refuses the push if any gate fails. This is
# the local stand-in for CI until docs/ci/github-actions-ci.yml is activated
# — see docs/ci/README.md for why the workflow cannot be enabled by the
# automation account.
#
# Skip a single push in an emergency with: git push --no-verify

set -euo pipefail
cd "$(dirname "$0")/.."

HOOKS_DIR=".git/hooks"
if [ ! -d "$HOOKS_DIR" ]; then
  echo "error: $HOOKS_DIR not found — run this from a full clone." >&2
  exit 1
fi

cat > "$HOOKS_DIR/pre-push" <<'HOOK'
#!/usr/bin/env bash
# Installed by scripts/install-git-hooks.sh — do not edit here, edit there.
echo "pre-push: running npm run check (full gates)…"
npm run check
HOOK
chmod +x "$HOOKS_DIR/pre-push"

echo "Installed .git/hooks/pre-push — pushes now run npm run check."
echo "Bypass once with git push --no-verify if you must."
