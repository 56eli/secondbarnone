# Deploying

GitHub Pages serves `main` → `/docs`. Any push to `main` that touches `docs/`
goes live in about a minute.

```bash
npm run check && git add -A && git commit -m "..." && git push origin main
```

No build step, no export, no settings to change.
