#!/usr/bin/env bash
# Regenerate the web assets in docs/assets/ from the full-resolution source
# art in assets/.
#
# The source PNGs are 1024x1024 / 1200x896 and total ~19 MB, which is far more
# than the game displays. This downscales them and converts to WebP, taking the
# payload to well under 1 MB.
#
# Requires: ImageMagick (`convert`).
# Usage: ./scripts/optimize-assets.sh

set -euo pipefail

cd "$(cd "$(dirname "$0")" && pwd)/.."

if ! command -v convert &>/dev/null; then
  echo "ERROR: ImageMagick 'convert' not found." >&2
  echo "  Debian/Ubuntu: sudo apt install imagemagick" >&2
  echo "  macOS:         brew install imagemagick" >&2
  exit 1
fi

PORTRAIT_SIZE=512      # portraits render at most ~84px, 512 covers retina
BACKGROUND_WIDTH=1000  # backgrounds are full-bleed behind a dark scrim
PORTRAIT_QUALITY=82
BACKGROUND_QUALITY=80

mkdir -p docs/assets/portraits docs/assets/backgrounds

echo "Converting portraits -> ${PORTRAIT_SIZE}px WebP…"
for f in assets/portraits/*.png; do
  [ -e "$f" ] || continue
  name=$(basename "$f" .png)
  convert "$f" -resize "${PORTRAIT_SIZE}x${PORTRAIT_SIZE}" \
    -quality "$PORTRAIT_QUALITY" -define webp:method=6 \
    "docs/assets/portraits/${name}.webp"
  printf '  %-12s %s\n' "$name" "$(du -h "docs/assets/portraits/${name}.webp" | cut -f1)"
done

echo "Converting backgrounds -> ${BACKGROUND_WIDTH}px WebP…"
for f in assets/backgrounds/*.png; do
  [ -e "$f" ] || continue
  name=$(basename "$f" .png)
  convert "$f" -resize "${BACKGROUND_WIDTH}x" \
    -quality "$BACKGROUND_QUALITY" -define webp:method=6 \
    "docs/assets/backgrounds/${name}.webp"
  printf '  %-12s %s\n' "$name" "$(du -h "docs/assets/backgrounds/${name}.webp" | cut -f1)"
done

echo "Regenerating procedural avatars…"
node scripts/generate-avatars.js

echo "Copying SVGs verbatim (already tiny)…"
cp -f assets/portraits/*.svg docs/assets/portraits/ 2>/dev/null || true
cp -f assets/backgrounds/*.svg docs/assets/backgrounds/ 2>/dev/null || true

# Drop any web asset whose source no longer exists (e.g. a renamed character),
# so docs/ never accumulates orphans.
for f in docs/assets/portraits/*; do
  [ -e "$f" ] || continue
  base=$(basename "$f"); stem="${base%.*}"
  if [ ! -e "assets/portraits/${stem}.png" ] && [ ! -e "assets/portraits/${stem}.svg" ]; then
    echo "  removing orphan ${base}"
    rm -f "$f"
  fi
done

echo
echo "Source art:  $(du -sh assets | cut -f1)"
echo "Web payload: $(du -sh docs/assets | cut -f1)"
echo
echo "Done. Verify with: node scripts/check-assets.js"
