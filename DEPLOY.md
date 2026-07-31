# Deploying

GitHub Pages serves **`crazy-branch` → `/docs`**. `crazy-branch` is the
canonical release branch. It should also be the repository default/protected
branch; the connected Arena integration cannot change those owner settings
(HTTP 403), so the exact follow-up is tracked in
`notes/REPOSITORY_GOVERNANCE.md`.

A merged pull request targeting `crazy-branch` that changes `docs/` triggers the
legacy Pages build; the source itself is the build. Release through a reviewed
pull request, never by updating stale historical `main`:

```bash
npm ci
npm run check
npm run coverage:check
npm run test:e2e       # after `npx playwright install chromium webkit`
git push origin <feature-branch>
gh pr create --base crazy-branch --head <feature-branch>
```

Before merging, require all three workflow jobs:

- `quality` — lint, format, typecheck, Node/jsdom coverage, visual assets, budgets;
- `browser` — Chromium desktop/320px and WebKit 768px smoke matrix;
- `balance` — canonical 300-seed/61-day hub report.

After merge, verify the Pages deployment records the merged SHA at:

https://56eli.github.io/secondbarnone/

Only then create the release tag and prune branches proven merged.
