# Deploying

GitHub Pages serves **`crazy-branch` → `/docs`**. `crazy-branch` is the
canonical release branch and should also be the repository default. A merged
pull request targeting `crazy-branch` that changes `docs/` triggers the legacy
Pages build; the source itself is the build.

Release through a reviewed pull request, never by updating the stale historical
`main` branch:

```bash
npm run check
npm run coverage:check
git push origin <feature-branch>
gh pr create --base crazy-branch --head <feature-branch>
```

Before merging, require the `check` workflow and confirm its 60-day balance
summary. After merge, verify the Pages deployment records the merged SHA at:

https://56eli.github.io/secondbarnone/
