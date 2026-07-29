# Vanna portrait — incident note

## What happened
Vanna's deployed portrait (both `docs/assets/portraits/vanna.webp` 288 px and
`docs/assets/portraits/hi/vanna.webp` 896 px) was the wrong image — it rendered
as a brown-haired woman in a bar with a notebook, **not** the canonical
"woman / very convincing bunny in a coat" ambiguity described in the bio and
required by art policy.

This was the cause of the repeated agent-drift in prior sessions: the
infrastructure that was *supposed* to prevent regeneration was already in
place — `FRAME_EXCEPTIONS = new Set(['brian', 'vanna'])` in
`scripts/build-portraits.js`, the "Vanna's bunny portrait must never be
changed" rule in `notes/ART_STANDARD.md`, and a SHA-256 hash regression test
in `tests/portrait-assets.test.js` — but the hashes hard-coded in that test
were the hashes of the wrong (human) portrait. The CI check therefore
"protected" the regressed art instead of the original bunny image, and every
agent that trusted the test concluded the picture was correct.

The source master `assets/portraits/vanna.png` is also the human version,
which means the regression predates the latest round of work — the bunny
master is not present in this checkout at all.

## Why the hashes didn't catch it
The immutability test in `tests/portrait-assets.test.js` pins exact SHA-256s
for Brian and Vanna:

```
vanna master b9d655e3…  (assets/portraits/vanna.png)
vanna thumb  a95ce9eb…  (docs/assets/portraits/vanna.webp)
vanna hi     d9bfb140…  (docs/assets/portraits/hi/vanna.webp)
```

Those hashes match the files that are on disk right now — the human-bar
portrait — so the test has been silently locking in the wrong art ever since
the regression landed. The test is useful as a "don't regenerate these two"
guard but only as strong as the initial commit.

## What was done today
1. Verified that the hash test is currently a false-green: rehashed all three
   files and they match the committed "frozen" hashes, but the image content
   is unambiguously a woman at a bar, not the bunny.
2. Left the frozen-hash test in place and **added a content-shape test** that
   looks for the circular, heavily-framed composition common to both Brian
   and Vanna (the only two characters that still use the framed v1 style) and
   will at least fail loudly if the portrait is silently replaced again.

## What still needs to happen (out of scope for the code audit session)
- The actual bunny master must be restored. Whoever has the original
  `vanna.png` (the framed half-bunny portrait) needs to replace:
    - `assets/portraits/vanna.png` with the original master
    - regenerate `docs/assets/portraits/vanna.webp` (288 px) and
      `docs/assets/portraits/hi/vanna.webp` (896 px) via `scripts/build-portraits.js`
    - update the three SHA-256 hashes in `tests/portrait-assets.test.js`
- After restoration, run `node scripts/build-portraits.js && npm test` and
  verify the frozen-hash test is now locking the correct image.

## Root-cause lessons
- Content-fidelity tests that pin hashes need a second, human-verified signal
  (content-dimension, dominant-palette, or a tagged reference set) or they
  can lock in regressions.
- "Hard permanent exceptions" in asset pipelines should be accompanied by a
  reference screenshot in-repo so reviewers can see what is being protected.
