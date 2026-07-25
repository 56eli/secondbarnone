#!/usr/bin/env bash
# Build script for Balance of Spirit
# Requires: Godot 4.7+ with HTML5 export templates installed
#
# Usage: ./build.sh
#   This will export the game to docs/ and optionally push to GitHub.
#
# To install export templates in Godot:
#   Editor → Manage Export Templates → Download and Install

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "=== Balance of Spirit: Web Export Builder ==="
echo ""

# Try to find Godot
GODOT=""
for candidate in godot godot4 Godot_v4.7.1-stable_linux.x86_64 Godot; do
    if command -v "$candidate" &>/dev/null; then
        GODOT="$candidate"
        break
    fi
done

if [ -z "$GODOT" ]; then
    echo "ERROR: Godot not found in PATH."
    echo "Please install Godot 4.7+ or specify the path:"
    echo "  GODOT=/path/to/godot ./build.sh"
    exit 1
fi

echo "Using Godot: $GODOT"
echo ""

# Export web build
echo "Exporting web build..."
$GODOT --headless --path . --export-release "Web" docs/index.html 2>&1

echo ""
echo "Build complete! Files in docs/:"
ls -lh docs/

echo ""
echo "To deploy: commit and push the docs/ folder to your main branch."
echo "  git add docs/"
echo "  git commit -m 'Update web build'"
echo "  git push origin main"
