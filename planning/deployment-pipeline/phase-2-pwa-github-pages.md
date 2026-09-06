# Phase 2 — PWA on GitHub Pages (fate.stanislavsonder.com)

> **Status: done (2026-08-25).** Live Release on `main` deploys to **https://fate.stanislavsonder.com**. HTTPS, SPA deep links, and PWA installability confirmed.

Outcome: every release deploys the web build to GitHub Pages, served at **https://fate.stanislavsonder.com**. DNS + Pages settings were done in Phase 0.4.

## 2.1 Repo changes

1. **`public/CNAME`** — new file containing exactly:

   ```
   fate.stanislavsonder.com
   ```

   Vite copies `public/` into `dist/`, so the CNAME survives every build and Pages keeps the custom domain across deploys.

2. **SPA fallback** — GitHub Pages serves `404.html` for unknown paths. After build, copy `dist/index.html` → `dist/404.html` (a step in the workflow, or a small `closeBundle` hook in `vite.config.mts`). This makes deep links (e.g. `/character/123`) load the app instead of a 404. Note the service worker already has `navigateFallback: '/index.html'` for repeat visitors; the 404 fallback covers first visits.

3. **No `base` change needed** — a custom domain serves from the root, so Vite's default `base: '/'` and the `<base href="/" />` in `index.html` are already correct. (This is exactly why the subdomain was chosen over `stanislavsonder.github.io/fate-core`.)

4. **Manifest check** — `public/site.webmanifest` uses relative/root paths (`start_url`, icons); verify installability at the new domain with Lighthouse once deployed. `vite-plugin-pwa` (`registerType: 'autoUpdate'`) handles service-worker refresh — a redeploy makes existing installs pick up the new version on next load.

## 2.2 Workflow job (append to `release.yml`)

Shipped in `.github/workflows/release.yml`. Deltas vs the original snippet: Node 24 action majors (`download-artifact@v7`, `configure-pages@v6`, `upload-pages-artifact@v5`, `deploy-pages@v5`); `actions: read` + `contents: read` so artifact download works under job-level permissions; `if` also requires `main` (aligned with `github-release`).

```yaml
deploy-pages:
  needs: [build-web, github-release]
  if: ${{ !inputs.dry_run && github.ref == 'refs/heads/main' }}
  runs-on: ubuntu-latest
  permissions:
    actions: read
    contents: read
    pages: write
    id-token: write
  environment:
    name: github-pages
    url: ${{ steps.deployment.outputs.page_url }}
  steps:
    - uses: actions/download-artifact@v7
      with:
        name: dist
        path: dist
    - run: cp dist/index.html dist/404.html
    - uses: actions/configure-pages@v6
    - uses: actions/upload-pages-artifact@v5
      with:
        path: dist
    - id: deployment
      uses: actions/deploy-pages@v5
```

Decision (recommended: **release-only**): deploy the PWA only from the Release workflow so the web version always equals the released app version. If continuous deploys from `main` are ever wanted, extract this job into a reusable `deploy-pages.yml` triggered by both.

## 2.3 Acceptance test

- [x] `public/CNAME` + `deploy-pages` job on `1.4.0`.
- [x] Live Release on `main` (`dry_run: false`): https://fate.stanislavsonder.com loads, HTTPS enforced.
- [x] Deep link (e.g. `/tabs/settings`) loads the app.
- [x] Lighthouse PWA check passes; app is installable; after a second deploy, an installed PWA picks up the update.
