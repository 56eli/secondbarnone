# Asset and content provenance register

**Status:** integrity is verified; commercial-use rights are not certified.

This project transparently records most portraits, profiles, events and location
art as AI-generated in `CHARACTER_AND_LOCATION_TEMPLATES.md`. Portrait SHA-256
manifests prove which exact bytes are approved and deployed. Neither statement
is a license grant: generation history and hashes do not by themselves prove
commercial distribution rights.

## Current source classes

| Class | Location | Current record | Commercial status |
| --- | --- | --- | --- |
| Portrait masters | `assets/portraits/*.png` | Character template AI/source notes + SHA manifest | Review required before monetization |
| Location masters | `assets/backgrounds/*.png` | Background README and commit history | Review required before monetization |
| Character/profile/event prose | `docs/js/data/`, templates | Primarily marked AI-generated | Editorial/IP review required |
| Warm piano | `scripts/gen-piano.py`, `assets/music/warm_piano.wav` | Reproducible stdlib synthesis owned in repository | Source process documented; owner legal review still applies |
| Owner-supplied locked art | Brian/Vanna notes + hashes | Explicit content locks; Vanna source noted owner-supplied | Obtain/retain owner's source-rights record |

## Required fields for any future asset

Record these beside the asset review or in a future machine-readable manifest:

- stable asset id and repository path;
- creator/tool/model and generation date, if generated;
- prompt/source inputs and whether any third-party reference image was used;
- commissioning/uploader identity;
- applicable tool terms or license at creation time;
- edits performed after generation;
- SHA-256 of approved master and deployed derivative;
- commercial-use approval status and reviewer/date;
- required attribution or restrictions.

## Release policy

- Free preview deployment may continue under the owner's current risk decision.
- Do not claim that SHA hashes establish copyright or licensing.
- Before a paid storefront, sponsorship, merch, or sublicensing release, the
  owner should have qualified legal/IP review of the register and underlying
  generation/source records.
- If provenance for a high-risk asset cannot be established, replace it with a
  commissioned or clearly licensed alternative and retain the replacement
  record.

This document is an operational register template, not legal advice.
