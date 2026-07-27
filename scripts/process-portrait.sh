#!/usr/bin/env bash
# Crop a freshly generated portrait PNG to a centered square, resize to the
# standard 512px portrait size, and emit both the source PNG (kept in
# assets/) and the deployed WebP (docs/assets/).
#
# Usage: ./scripts/process-portrait.sh <id>
# Expects assets/portraits/<id>.png to exist already (raw AI output, any
# aspect ratio). Overwrites it in place with the square-cropped version.
set -euo pipefail
cd "$(cd "$(dirname "$0")" && pwd)/.."

id="$1"
src="assets/portraits/${id}.png"
[ -f "$src" ] || { echo "missing $src" >&2; exit 1; }

dims=$(identify -format '%wx%h' "$src")
w=${dims%x*}; h=${dims#*x}
if [ "$w" != "$h" ]; then
  side=$(( w < h ? w : h ))
  convert "$src" -gravity center -crop "${side}x${side}+0+0" +repage "$src"
fi

mkdir -p docs/assets/portraits
convert "$src" -resize 512x512 -quality 82 -define webp:method=6 \
  "docs/assets/portraits/${id}.webp"

printf '%-14s %s -> %s\n' "$id" "$(identify -format '%wx%h' "$src")" \
  "$(du -h "docs/assets/portraits/${id}.webp" | cut -f1)"
