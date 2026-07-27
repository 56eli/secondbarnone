# Location background source art

This directory contains full-resolution source PNGs for the browser game. The
deployable counterparts live in `docs/assets/backgrounds/` as 1000px WebP.

New scenes should use a calm, painterly environmental composition with darker
edge space for the game overlay. Keep filenames equal to the location id, for
example `soup_kitchen.png` → `docs/assets/backgrounds/soup_kitchen.webp`.

To create a deploy asset without rebuilding unrelated artwork:

```bash
convert assets/backgrounds/<location>.png -resize '1000x>' -quality 80 \
  -define webp:method=6 docs/assets/backgrounds/<location>.webp
```

`node scripts/check-assets.js` verifies every background referenced by the
location catalogue.
