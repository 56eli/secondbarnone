# Vanna portrait — canonical source lock

The project owner supplied `1c9f2c0e961d34425f62988f97f7e271.png` as Vanna's
canonical portrait: a close-up rabbit image. It replaced the obsolete human-at-a-bar
master on 29 July 2026.

The canonical source is now `assets/portraits/vanna.png`; the obsolete source was
replaced, not retained. `docs/assets/portraits/vanna.webp` and
`docs/assets/portraits/hi/vanna.webp` were regenerated from it.

`tests/portrait-assets.test.js` pins SHA-256 hashes for the master and both derived
tiers. This is an intentional content lock: any Vanna change must be a deliberate
owner-approved replacement with reviewed hashes, not a batch portrait regeneration.
Vanna is no longer a framed-art exception because the canonical source is a clean,
square image.
