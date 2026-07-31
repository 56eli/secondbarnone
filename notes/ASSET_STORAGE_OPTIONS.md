# Source-art storage options

**Current decision (31 July 2026): defer migration.** The owner's priority is
the best outcome with the smallest burden and no operational complications. A
history rewrite, LFS quota/tooling, or two-repository workflow does not meet that
bar today. Masters remain ordinary Git files, the inactive LFS attributes were
removed, and contributors should use shallow clones when repository size
matters. Revisit only when storage or clone cost becomes a concrete problem.

The deployable game is small (`docs/` is about 10 MB), but full-resolution
source masters under `assets/` are about 252 MB and the shallow checkout already
contains roughly 258 MiB of packed Git objects.

## What Git LFS is

Git LFS (Large File Storage) replaces each tracked large file in ordinary Git
history with a tiny text pointer containing its object id and size. The actual
PNG/WAV bytes live in an LFS object store. A normal checkout with Git LFS
installed reads the pointers and downloads the corresponding large objects.

Benefits:

- ordinary Git commits, diffs, fetches and clones stay much smaller;
- files keep familiar paths such as `assets/portraits/leon.png`;
- GitHub understands LFS pointers and can fetch the real files for authorized
  clones;
- source and code revisions can still move together.

Costs and caveats:

- GitHub LFS storage/bandwidth has quotas and may incur cost;
- every contributor/CI job that needs masters must install Git LFS;
- adding `.gitattributes` only affects future writes. This repository already
  has the attributes, but the existing large blobs remain ordinary Git objects;
- actually shrinking retained history requires an owner-approved migration such
  as `git lfs migrate import --include='assets/**' --everything`, followed by a
  coordinated force-push/history rewrite. Old clones and open branches then
  need repair or replacement;
- the deployed `docs/assets/**` should normally stay ordinary Git files because
  GitHub Pages needs the actual optimized bytes, not LFS pointer text.

## Why another branch in the same repository does not solve it

Moving masters to an `art` branch can make the default working tree cleaner, but
it does **not** remove their objects from the repository. GitHub still stores the
blobs, repository history remains large, and ordinary clones often fetch the
objects/refs unless deliberately shallow and single-branch. A branch is useful
for workflow separation, not storage reduction.

## Practical choices

### A. Git LFS in this repository

Keep source paths and migrate `assets/**` to LFS. Best when source and code must
be versioned atomically and expected LFS quota is acceptable.

Owner-run outline (not safe to execute casually):

```bash
# First make a full mirror backup and stop merges.
git clone --mirror https://github.com/56eli/secondbarnone.git secondbarnone-backup.git

# In a fresh owner checkout with git-lfs installed:
git lfs install
git lfs migrate info --everything --include='assets/**'
git lfs migrate import --everything --include='assets/**'
git lfs ls-files

# Verify code/tests/assets, then coordinate the rewritten push and retire old clones.
```

A precise migration plan must enumerate protected branches/tags and verify Pages
still serves real `docs/` assets before any force-push.

### B. Separate source-art repository

Create a dedicated private/public `secondbarnone-art` repository, ideally using
LFS there. Keep only optimized runtime assets and manifests in this game repo.
Record a source-art revision id in a small file here so a deploy can be traced to
its masters.

This separates permissions and keeps game clones small, but source/code changes
become a coordinated two-repository operation. A plain second repository
without LFS still grows large over time; it only isolates that growth.

### C. External object storage

Store versioned masters in S3-compatible storage, a managed asset library, or a
versioned release archive. Commit a manifest containing filename, SHA-256,
source revision, provenance and retrieval location.

This gives the smallest Git repository and flexible lifecycle policies, but
requires backup/access management and a documented restore process.

## Recommendation

Do **not** move masters to another branch in this same repository as a size fix.
For this project, the two sensible directions are:

1. **same-repo Git LFS** if atomic source/code history is worth LFS quota and a
   coordinated rewrite; or
2. **a separate art repository using LFS** if artists/permissions and game code
   should be isolated.

The owner has chosen to leave existing history untouched. Continue committing
optimized `docs/assets/**` normally, keep SHA manifests, avoid duplicate master
formats, and revisit only if repository size becomes a concrete blocker.
