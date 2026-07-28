# Portrait source art

Painted source masters for the cast. The deployable tiers live in
`docs/assets/portraits/` and are **derived, never edited by hand**:

```
thumb  docs/assets/portraits/<id>.webp      288px — every inline use
hi     docs/assets/portraits/hi/<id>.webp   ≤896px — the tap-to-enlarge lightbox
```

Rebuild with `node scripts/build-portraits.js` (or `npm run assets`), and see
`docs/ART_DIRECTION.md` for the style standard before painting or repainting
anyone.

## Naming and provenance

One file per character, named by id. Two master formats coexist, newest
batch first:

| Batch | Format | Notes |
| --- | --- | --- |
| Current | `assets/portraits/<id>.png` ≥1024×1024 | The post-Paris painted set |
| Older | `assets/portraits/<id>.webp` 512×512 | First painted batch; the hi tier never upscales, so these characters enlarge to 512px |

The source picker (`build-portraits.js#sourceFor`) chooses the **largest**
candidate on disk per id — do not keep two masters of the same person at
different resolutions side by side.

**No painted source has been lost.** An earlier report claimed sixteen
launch characters survived only as deployed web art; verification (July 2026)
found their original 512×512 WebP masters here the whole time. What those
sixteen genuinely lack is the ≥1024px PNG master of the current batch, so
their lightbox enlargement caps at 512px. That gap is a repaint commission —
the cast preamble in `docs/side_characters_report.md` lists the ids — and
repaints, like all cast art, are the repo owner's call.
