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

# Background music: regenerate the warm-piano master (44.1 kHz additive
# synthesis) and downsample the deployed copy to 11.025 kHz so the lazy asset
# stays well under its 1 MiB budget. Stdlib Python only — no ffmpeg — so this
# runs independently of the ImageMagick requirement below.
if command -v python3 &>/dev/null; then
  echo "Synthesizing background music…"
  python3 scripts/gen-piano.py assets/music/warm_piano.wav
  python3 scripts/downsample.py assets/music/warm_piano.wav docs/assets/music/warm_piano.wav 11025 16
else
  echo "  ! python3 not found — skipping music regeneration" >&2
fi

if ! command -v convert &>/dev/null; then
  echo "ERROR: ImageMagick 'convert' not found." >&2
  echo "  Debian/Ubuntu: sudo apt install imagemagick" >&2
  echo "  macOS:         brew install imagemagick" >&2
  exit 1
fi

BACKGROUND_WIDTH=1000
BACKGROUND_QUALITY=80

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
  convert "$src" -resize "${BACKGROUND_WIDTH}x>" \
    -quality "$BACKGROUND_QUALITY" -define webp:method=6 \
    "docs/assets/backgrounds/${name}.webp"
  printf '  %-22s %s\n' "$name" "$(du -h "docs/assets/backgrounds/${name}.webp" | cut -f1)"
done

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
