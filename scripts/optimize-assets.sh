#!/usr/bin/env bash
# Regenerate the web assets in docs/assets/ from the source art in assets/.
#
# Portraits are delegated to scripts/build-portraits.js, which emits two tiers
# (288px inline thumbnail + 896px lightbox sheet) and prunes its own orphans.
# Backgrounds are downscaled to 1000px WebP here.
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

BACKGROUND_WIDTH=1000
BACKGROUND_QUALITY=80
# Backgrounds are budgeted against the 4 MB eager payload, and a handful of
# detail-rich scenes (foliage, crowds, stonework) overshoot their share at
# q80. Encode at q80 first; anything still over the target gets one
# deterministic step down. The step is small: at 1000px and 3:2, q68 is
# visually indistinguishable for these painterly scenes, and the alternative —
# refusing new locations — is worse. Measured: eight heavy backgrounds,
# 997K at q80 -> 763K at q68.
BACKGROUND_TARGET_KB=100
BACKGROUND_QUALITY_HEAVY=68

mkdir -p docs/assets/portraits docs/assets/backgrounds

shopt -s nullglob

# Portraits are built by a dedicated script now, because they ship in two
# sizes (288px inline thumbnail + 896px lightbox sheet) and the source picker
# has to prefer the largest available master rather than the first format it
# finds. See scripts/build-portraits.js.
echo "Building portrait tiers…"
node scripts/build-portraits.js

echo "Converting backgrounds -> ${BACKGROUND_WIDTH}px WebP…"
# Only build backgrounds the location catalogue actually references. Building
# every PNG in assets/ used to resurrect retired art: four pre-Paris scenes
# (bar, spiritual_community, public_library, river_walk) were superseded by
# their paris_* replacements but kept reappearing in the payload on each run.
wanted=$(node -e "
import('./docs/js/data/locations.js').then((m) => {
  const names = m.LOCATIONS.map((l) => l.bg).filter(Boolean)
    .map((b) => b.replace('assets/backgrounds/', '').replace(/\.webp$/, ''));
  names.push('hub_background');
  console.log([...new Set(names)].join('\n'));
});")

for name in $wanted; do
  src="assets/backgrounds/${name}.png"
  if [ ! -e "$src" ]; then
    # Some early backgrounds only ever existed as a deployed WebP.
    [ -e "docs/assets/backgrounds/${name}.webp" ] \
      || echo "  ! no source for ${name}" >&2
    continue
  fi
  out="docs/assets/backgrounds/${name}.webp"
  q="$BACKGROUND_QUALITY"
  convert "$src" -resize "${BACKGROUND_WIDTH}x>" \
    -quality "$q" -define webp:method=6 "$out"
  size_kb=$(( $(stat -c%s "$out") / 1024 ))
  if [ "$size_kb" -gt "$BACKGROUND_TARGET_KB" ]; then
    q="$BACKGROUND_QUALITY_HEAVY"
    convert "$src" -resize "${BACKGROUND_WIDTH}x>" \
      -quality "$q" -define webp:method=6 "$out"
    size_kb=$(( $(stat -c%s "$out") / 1024 ))
  fi
  printf '  %-22s %s (q%s)\n' "$name" "$(du -h "$out" | cut -f1)" "$q"
done

echo "Regenerating procedural avatars…"
# No-op while every character has painted art; still here so a newly added
# character gets a stand-in face before their portrait is commissioned.
node scripts/generate-avatars.js

echo "Copying SVG backgrounds verbatim…"
cp -f assets/backgrounds/*.svg docs/assets/backgrounds/ 2>/dev/null || true

# Portrait pruning is handled inside build-portraits.js, which knows about the
# hi/ subdirectory. Deleting orphans here would strip the entire lightbox tier,
# since those files have no same-named source in assets/portraits/.
for f in docs/assets/backgrounds/*; do
  [ -e "$f" ] || continue
  base=$(basename "$f"); stem="${base%.*}"
  if [ ! -e "assets/backgrounds/${stem}.png" ] \
     && [ ! -e "assets/backgrounds/${stem}.svg" ] \
     && [ ! -e "assets/backgrounds/${stem}.webp" ]; then
    echo "  removing orphan ${base}"
    rm -f "$f"
  fi
done

echo
echo "Source art:  $(du -sh assets | cut -f1)"
echo "Web payload: $(du -sh docs/assets | cut -f1)"
echo
echo "Done. Verify with: npm run check"
