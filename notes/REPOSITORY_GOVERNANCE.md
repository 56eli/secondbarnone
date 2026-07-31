# Repository governance actions

**Decision (31 July 2026):** `crazy-branch` remains the canonical release
branch and GitHub Pages source. Merged Arena session branches may be deleted
after the current release PR is safely merged. Preserve `crazy-branch`, `main`,
`godot`, and the active release/session branch.

The connected Arena GitHub integration can read repository settings but receives
HTTP 403 when changing the default branch or protection. These owner-level
steps therefore cannot be completed from this session.

## Owner actions after the release PR merges

1. **Set the default branch** to `crazy-branch`:
   - GitHub → Settings → Branches → Default branch; or
   - `gh repo edit 56eli/secondbarnone --default-branch crazy-branch` from an
     owner-authorized checkout.
2. **Protect `crazy-branch`** (or add an equivalent ruleset):
   - require a pull request;
   - require the `quality`, `browser`, and `balance` checks;
   - require the branch to be up to date before merge;
   - block force pushes and deletion;
   - keep administrator bypass only for recovery.
3. **Treat `main` as historical** until deliberately reconciled. Do not target
   feature PRs at it and do not switch Pages back to it. PR #50 demonstrated
   that fixes merged only to `main` do not deploy.
4. **Tag the accepted release** only after Pages reports the merged SHA.
5. **Delete merged Arena branches** using the verified procedure below.

## Safe merged-branch cleanup

Dry-run first:

```bash
repo=56eli/secondbarnone
canonical=crazy-branch

# Heads of merged PRs targeting the canonical branch.
gh pr list -R "$repo" --state merged --base "$canonical" --limit 200 \
  --json headRefName,number,mergedAt,title \
  --jq '.[] | select(.headRefName | startswith("arena/")) |
        [.headRefName, (.number|tostring), .mergedAt, .title] | @tsv'
```

Before deleting any head, confirm its PR is merged and preserve the active
release branch. Then delete with GitHub's API (one example):

```bash
branch='arena/EXAMPLE-secondbarnone'
gh api -X DELETE "repos/$repo/git/refs/heads/${branch//\//%2F}"
```

Do not bulk-delete by name alone. A remote branch can contain unmerged work even
when it looks like an old Arena session. Keep a text copy of the dry-run output
with the release record.

## Release tagging

After the accepted PR is merged and Pages deploys that SHA:

```bash
git fetch origin crazy-branch
git tag -a v2.6.1 origin/crazy-branch -m 'secondbarnone v2.6.1'
git push origin v2.6.1
gh release create v2.6.1 --generate-notes --target crazy-branch
```

Use the actual chosen version if the balance/product change is promoted as a
minor rather than a patch release.
