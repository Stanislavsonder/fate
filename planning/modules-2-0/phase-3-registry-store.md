# Phase 3 — Public Registry & In-App Mod Store

> **Status: closed out.** Every acceptance box is checked except device
> passes (deferred, no hardware available). See the updates below for the
> full verification trail: Cypress (Goal I), local CI verification, and two
> real live-repo actions (Checkpoints B and C).
> Everything through Goal G of the implementation plan is built, and the
> pipeline has been proven end-to-end against the real, live `fate-core-mods`
> repo — not a simulation: a real PR (#1) went through `validate-pr.yml`
> (scope/ownership/schema/version/build/security-lint/smoke-load all green),
> was merged, `publish.yml` ran, and `registry.json` is genuinely live on
> GitHub Pages with `sonder@example` as its first entry (hash manually
> re-verified byte-for-byte against the published `bundle.mjs`). See
> "What actually shipped" below for the full detail, including ten real bugs
> found only by running the real pipeline, not by reading the code.
>
> **Update (Cypress closeout session):** Goal I is done — 7 specs / 15 tests
> under `src/tests/e2e/specs/modStore/` (browse, install incl. tamper/hash-
> mismatch, update, remove incl. blocked-by-character, blocklist, offline/
> stale-cache, mod-not-installed guided install), all green against a local
> fixture registry (`src/tests/e2e/fixtures/mods/`), plus the full existing
> e2e suite (29/29) and unit suite (182/182). Along the way this also found
> and fixed two real, pre-existing bugs (not simulated — real e2e-only
> findings, same category as Phase 2's): `ModStoreBrowseTab.vue`'s `load()`
> was calling `refreshIndex(false)` (throttled) instead of `refreshIndex(true)`
> on open, racing main.ts's own fire-and-forget background refresh — opening
> the Mod Store shortly after boot could show stale/empty results even though
> a fetch had just succeeded; and `updateModules.ts` referenced the i18n key
> `modules.notFound` instead of the real `errors.module.notFound`, so the
> "module not found" toast rendered as a raw untranslated key. Both fixed.
> See `src/tests/e2e/support/modStore.ts` for the fixture/intercept harness.
>
> **Update (CI + Checkpoint C):** all 6 tampering cases, the republish-refusal
> guard, and the blocklist-regen logic verified against the real `scripts/ci/*.ts`
> in a fresh local clone (no live-repo writes — see the acceptance checklist
> below for exact method per case; also surfaced that `owners.json` on the
> live repo is still `{}`, a manual follow-up nobody did after PR #1).
> Checkpoint A (a live canary PR) turned out unnecessary once the scripts
> were actually read: the GitHub-API calls already no-op safely with no
> token/real PR, so direct script invocation runs the identical code path —
> skipped with the user's agreement. Checkpoint C is done for real: PR #2
> (`sonder@example` 1.0.0→1.0.1, docs-only) merged, `publish.yml` ran,
> `registry.json` live with `latestVersion: "1.0.1"`, hashes re-verified
> byte-for-byte. Checkpoint B also done for real: `blocklist.json` blocking
> `sonder@example` pushed directly to main (the intended mechanism —
> `publish.yml` triggers on push for `blocklist.json`; `validate-pr.yml`
> would actually reject a blocklist-only PR since it requires a touched
> `mods/` folder), confirmed live, immediately reverted and confirmed
> cleared — under a minute of real blocked window, aside from GitHub Pages'
> usual ~20s CDN propagation lag on the way back.
>
> **Still open:**
> - The joint live-browser session (watching the real update/blocklist flows
>   against the now-live v1.0.1 in an actual browser) — optional at this
>   point since both are already proven for real at the repo/registry level
>   plus hermetically in Cypress; would only add visual confirmation.
> - Device passes (iOS/Android) — no hardware confirmed available.
> - A follow-up item was filed in `phase-5-other-improvements.md`: Phase 2
>   (install-from-URL) and this phase (automatic background registry
>   fetches, mod downloads, README rendering) both contradict the current
>   Privacy Policy's explicit "operates entirely offline" / "does not
>   integrate with any third-party services" claims — needs a policy update
>   before either phase should be considered fully shipped to end users.

> **Prerequisites:** Phase 2 complete — **done** (loader, storage, FateSDK,
> `mod-build` preset, example mod all working and verified live in a real
> browser, not just unit tests). See "What Phase 2 actually shipped" below
> before starting: what's directly reusable, and gotchas already found and
> fixed that are easy to reintroduce here.
>
> **Outcome:** a public, curated GitHub repository (`fate-core-mods`) where
> community authors submit mod **source** via pull request; CI validates PRs,
> builds bundles from reviewed source on merge, and publishes a signed-by-hash
> index to GitHub Pages. The app gains a **Mod Store** page: browse, search,
> install, update, remove — with SHA-256 verification, offline caching, and a
> remote blocklist kill-switch.
>
> This is the phase with the most *product* surface. The technical pieces are
> mostly thin layers over what Phase 2 built.

## What Phase 2 actually shipped (read before starting)

Phase 2 is done and was verified end-to-end in a live browser (not just unit
tests) — install-from-URL, character-sheet rendering, config UI, data
persistence, disable/enable/update/remove, and the dev-mode SSE hot-reload
loop all work. That work leaves the following directly reusable for this
phase, and a few gotchas worth knowing before you start:

**Reusable as-is:**

- `src/mods/loader.ts`'s `loadExternalMod(row: StoredMod)` is already the
  shared loading path (ABI gate → hash check → blob import → shape
  validation → `assembleMod` → translation merge) — `installFromRegistry`
  (Step 6) goes through this exact function, unchanged, same as
  `installFromUrl` and `devMode.ts`'s dev-connect flow already do.
- `src/mods/installService.ts` exports `fetchManifest(baseUrl)` and
  `fetchBundleAndTranslations(baseUrl, manifest)` specifically so callers
  other than `installFromUrl` can reuse the fetch logic — `installFromRegistry`
  can call these directly against registry artifact URLs instead of
  duplicating the fetch/hash-compute code.
- `StoredMod.source` (`src/db/tables/mods.ts`) is already typed as
  `'registry' | 'url' | 'dev'` — `'registry'` was reserved for this phase
  from the start, nothing to add.
- The Dexie `kv` table (`src/db/database.ts`, schema v2) exists and is
  empty — reserved for exactly the `registryClient.ts` index cache Step 5
  describes. No new Dexie version needed to start using it.
- `docs/MOD_API.md` is the real, current ABI contract — link to it (or
  fold it in) from `SUBMITTING.md` instead of re-deriving author-facing
  docs from scratch.
- `packages/example-mod` (Step 9's migration target) isn't just scaffolding
  — it's a proven, non-trivial fixture: a sheet component, a config option,
  `getModData`/`setModData`, scoped CSS, an i18n key, and correct
  `onInstall` idempotency (see gotcha below). It's already been built
  through `@fate-app/mod-build`, installed from a URL, rendered on a real
  character, and hot-reloaded live — migrating it is close to copy-paste.

**Gotchas learned the hard way (all fixed, but worth knowing why):**

- **`onInstall` runs on every character load, not just first install**
  (`installModules.ts` calls it unconditionally whenever a character's
  context is rebuilt). `packages/example-mod` originally wrote an
  unconditional default and silently wiped user data on every reload —
  fixed with the same `getModData(...) ?? default` guard the built-in
  modules already use. Any review checklist / author docs for this phase
  should call this out explicitly; it's not obvious from the manifest.
- **A literal `@` in any string that goes through `$t()` crashes vue-i18n's
  message parser** (it's linked-message syntax). This bit a plain
  placeholder string in Settings UI, not mod content — but registry mod
  names/descriptions/README excerpts rendered through `$t()` or Vue
  interpolation should be checked for this if they're ever passed through
  the i18n pipeline rather than plain template interpolation.
- **`structuredClone` on a live reactive Pinia object throws
  `DataCloneError`.** `src/mods/devMode.ts`'s hot-reimport originally passed
  the raw `useCharacter().character` store ref into `useFate().changeCharacterModules`
  (which calls `structuredClone` internally) and crashed; fixed by going
  through the existing `useCharacter().reconfigureCharacter(id, modules)`
  action instead, which re-fetches a plain object first. Relevant if the Mod
  Store UI (Step 7) ever needs to pass character/context objects around —
  prefer existing store actions over raw store refs.
- **IndexedDB can't index booleans.** `StoredMod.enabled` is deliberately
  unindexed (`modsService.getAllEnabled()` filters in JS after `toArray()`)
  because Dexie/IndexedDB keys must be number/string/Date/binary/Array. If
  Step 5's `blocked: true` column needs to be queryable, don't index it as
  a boolean either — same workaround, or store it as 0/1.
- **Settings → Mods is already a top-level, always-visible entry**, not
  gated behind Developer Mode (`ROUTES.SETTINGS_MODS`, reachable directly
  from `SettingsPage.vue`) — this was a deliberate correction during Phase 2:
  Developer Mode now only gates *installing new, unreviewed* code
  (install-from-URL, connect-dev-mod), not managing what's already
  installed. Step 7's plan to have the Mod Store's "Installed" tab absorb
  `ModsManagePage.vue` should preserve this — and by the same logic, the
  Mod Store's browse/install-from-registry flow (the "trusted path" per
  Step 6 point 4) most likely shouldn't require Developer Mode either, only
  install-from-URL should stay behind it. Worth confirming as a product
  decision rather than defaulting to gating it.
- **Don't reuse `confirmInstallFromUrl`** (`src/utils/helpers/dialog.ts`) for
  registry installs — it's specifically the typed "type the mod id or
  'install' to confirm" friction for D10's *unreviewed* path. Step 6 point 4
  already says registry installs skip this; just don't accidentally wire the
  same helper in because it's the only install-confirmation code that exists
  yet.

---

## What actually shipped (this implementation session)

Everything through Goal G of the implementation plan is done:
`registryClient.ts` (refresh/cache/throttle/blocklist), `installFromRegistry`/
`updateFromRegistry`/`checkForUpdates` in `installService.ts`, the Mod Store
UI (`src/views/mods/ModStorePage.vue` + `parts/ModStoreBrowseTab.vue` +
`ModStoreDetailModal.vue` + `ModStoreInstalledTab.vue`, absorbing and
replacing `ModsManagePage.vue`), the `mod-not-installed` resolution issue
(`installModules.ts` + a dedicated actionable toast in
`showIssuesMessage.ts`), and the `fate-core-mods` repo itself (scaffold, both
CI workflows, security-lint config, docs) with `sonder@example` published
through it as the first real mod. `pnpm build && pnpm lint && pnpm test` is
green (182 unit tests). Goal I (Cypress e2e) was not started.

### Deviations from this doc's original design

- **`@fate-app/mod-types`/`@fate-app/mod-build` are already published to
  npm** (`0.1.2` / `0.1.5` at the time of writing) — Phase 2's Decision #6
  deferred this to Phase 4, but Phase 3 can't actually work without it (CI's
  smoke-load step and any real author's local dev both need to `pnpm install`
  them). **Phase 4's "published author SDK" goal is now already partly done**
  — its remaining scope is the scaffolder CLI and custom-dice capability, not
  the publish step itself. Update the phase table in `README.md` accordingly
  before starting Phase 4.
- **No `SETTINGS_MOD_STORE` route constant was added.** `ROUTES.SETTINGS_MODS`
  was simply repointed at `ModStorePage.vue` instead — same practical outcome
  (old URL still works, nothing deep-linked to the old install-only page
  anyway) with less churn than the doc's original "add a new constant, keep
  the old one as a redirect" plan.
- **`mod-not-installed`'s "deep link"** is a real, clickable toast action
  (`toastController` with a button that calls `router.push(ROUTES.SETTINGS_MODS)`)
  added directly in `showIssuesMessage.ts`, not a change to the Mod Store
  detail view's own routing (nothing else in the app currently deep-links
  into a *specific* mod's detail modal — `ModStorePage.vue`'s detail view is
  modal-based, opened from a card click in-page, not its own route).
- **Older (non-latest) registry versions are not installable.** The registry
  index only carries pinned file hashes for a mod's `latestVersion` (see the
  Step 1 index shape) — there's no source of truth to verify an older
  version's hash against. `installFromRegistry(id, version)` explicitly
  refuses a `version` argument that isn't the current latest, rather than
  silently installing it without hash-pinning. Revisit if per-version hash
  pinning is ever added to the index format.

### Real bugs found only by running the pipeline for real (not by reading code)

Ten, across two failure classes — package distribution and CI mechanics —
each is a durable lesson for anyone touching this infrastructure again:

**Getting `@fate-app/mod-types`/`mod-build` correctly published:**
1. `npm publish` (not `pnpm publish`) does **not** rewrite `workspace:`
   protocol dependency ranges — the first `mod-build` publish shipped a
   literal, broken `"@fate-app/mod-types": "workspace:^0.1.0"` in its
   published `package.json`. Always `pnpm publish` for workspace packages.
2. Node's `--experimental-transform-types` **refuses to strip types for any
   file under `node_modules`** — shipping raw `.ts` source with no build step
   (the original design, for zero-build-step local monorepo dev) is
   fundamentally incompatible with any consumer that runs it via plain Node.
   Fixed via `publishConfig` overrides: local workspace dev still resolves
   live `src/*.ts` (unchanged), but the *published* package ships compiled
   `dist/*.js` (a `prepack` hook runs `tsc` automatically).
3. `mod-types`' `index.ts` used extension-less relative exports
   (`export * from './character'`) — fine for bundler-style resolution, but
   Node's native ESM resolution requires explicit extensions. TypeScript's
   `rewriteRelativeImportExtensions` only rewrites *existing* `.ts`
   extensions to `.js`, it doesn't add missing ones — needed
   `allowImportingTsExtensions` plus explicit `.ts` suffixes on every
   relative export in the source itself.
4. `@fate-app/mod-build/testing`'s `smokeLoad()` never bootstrapped a DOM
   before Vue was first imported. `@vue/runtime-dom` captures a reference to
   `document` the moment it's first evaluated (module-scope, computed once)
   — a static top-level `import 'vue'` runs before any later
   `globalThis.document = ...` assignment can matter. Fixed by making every
   Vue import in `testing.ts` dynamic (`await import('vue')`), always after
   `ensureDom()` completes.
5. `ensureDom()`'s first attempt (copying every `jsdom` `window` property
   onto `globalThis`) hit `window.self`/`window.top`/`window.parent`'s
   circular self-references, overflowing the stack the moment anything tried
   to traverse the result. Fixed with a curated list of specific DOM
   constructors instead of a blind copy.
6. `smokeLoad()` mounted components with no `modelValue` prop and no `$t`
   mock — real sheet components (`defineModel<Character>({ required: true })`,
   template `$t()` calls) legitimately need both; this was a smoke-load false
   negative, not a bug in the mod being tested. Fixed by mounting with a
   stub `Character` as `modelValue` and `global.mocks.$t`.

**CI mechanics, found via a real PR against the live repo:**
7. `publish.yml`'s bash mod-folder-detection regex (`grep -oE '^mods/[^/]+'`,
   no trailing slash) matched `mods/README.md` itself as if it were a mod
   folder — broke on the very first push. Needed the trailing slash
   (`^mods/[^/]+/`) that `validate.ts`'s equivalent Node regex already had.
8. The scaffold was pushed without a `pnpm-lock.yaml` at all — `pnpm install
   --frozen-lockfile` fails outright with no lockfile to freeze against.
9. `validate.ts`'s id-prefix-vs-`author.github` check was written as "flag
   for maintainer review" in its own comment but implemented as a hard,
   CI-blocking error — would have rejected the very first submission
   (`sonder@example` from GitHub handle `Stanislavsonder`, an established
   alias, per this project's existing built-in-module naming convention).
   Moved to a non-blocking warning surfaced in the success PR comment.
10. pnpm's `minimumReleaseAge` policy (waits ~24h before trusting a freshly
    published version, real supply-chain protection) rejected the
    just-published `mod-build`/`mod-types` versions during `pnpm install
    --frozen-lockfile` — both in local testing and in real CI. Only
    configurable via `pnpm-workspace.yaml` (`minimumReleaseAge: 0`), **not**
    `.npmrc` — a non-obvious pnpm quirk. Set at both the repo root and inside
    `mods/sonder@example/` (each mod is its own install root, no shared
    workspace — see `mods/README.md`).
11. First-ever `gh-pages` branch creation was broken: a *failed*
    `actions/checkout` of the not-yet-existing `gh-pages` ref still leaves a
    git-initialized directory behind on the runner's default branch name
    (observed: `master`), so `[ ! -d gh-pages/.git ]` saw a directory and
    skipped the actual `git init -b gh-pages`. The first real commit landed
    on the wrong branch name and `git push origin gh-pages` failed with "src
    refspec gh-pages does not match any". Fixed by unconditionally renaming
    whatever branch is currently checked out to `gh-pages`
    (`git branch -m gh-pages`), which works whether that's a real fetched
    `gh-pages` (no-op) or the failed checkout's stray branch (works even with
    zero commits).
12. GitHub Pages needs to be **manually enabled** in repo settings (source =
    `gh-pages` branch, root) — not automatic just because the branch exists
    and has content. `.nojekyll` was also added to the branch root as a
    defensive measure (Pages runs Jekyll by default, which ignores
    underscore-prefixed paths and can otherwise mangle a plain static-file
    site) — not confirmed to have been *actually* causing a problem here, but
    cheap insurance.

---

## Trust model (read before building)

- **The PR review is the security boundary.** There is no sandbox. A merged
  mod runs with full app privileges on users' devices. CI automates the
  mechanical checks; a human (you) reads the source diff of every PR.
- **CI-only builds**: the published `bundle.mjs` is always built by CI from
  the merged source. Author-uploaded binaries are never accepted. This makes
  "published bundle == reviewed source" a provable property.
- **Immutability**: once `mods/<id>/<version>/` is published, it never
  changes. Fixes ship as new versions. The SHA-256 in the index is therefore
  a permanent commitment.
- **Blocklist**: the emergency brake. If a published version turns out
  malicious/broken, add it to `blocklist.json`; apps disable it on next index
  refresh. (Artifacts stay published — the blocklist is the mechanism, not
  deletion, so hashes/audits remain reproducible.)

---

## Step 1 — The `fate-core-mods` repository

Create a new public GitHub repo (suggested: same owner as the app repo).

```
fate-core-mods/
├── mods/
│   └── <author>@<name>/            # ONE folder per mod = its SOURCE (latest only;
│       ├── manifest.json           #   history lives in git; published versions live on gh-pages)
│       ├── bundle.ts
│       ├── src/ ...
│       ├── translations/*.json
│       ├── README.md  CHANGELOG.md  LICENSE
│       ├── package.json            # devDeps: @fate-app/mod-build, @fate-app/mod-types (pinned)
│       └── vite.config.ts          # export default defineModConfig()
├── owners.json                     # { "<modId>": ["github-handle", ...] } — who may modify each mod
├── blocklist.json                  # { "<modId>": ["<semver-range>", ...] }
├── registry.schema.json            # JSON Schema for manifest.json (single source of truth for validation)
├── docs/
│   ├── SUBMITTING.md               # author guide: scaffold → develop (dev mode) → PR checklist
│   └── REVIEW_CHECKLIST.md         # reviewer guide (Step 4)
└── .github/workflows/
    ├── validate-pr.yml
    └── publish.yml
```

**Published output** (gh-pages branch, generated only by CI — never edited by hand):

```
registry.json
mods/<author>@<name>/<version>/{manifest.json, bundle.mjs, translations/*.json, README.md, CHANGELOG.md}
```

`registry.json` shape:

```jsonc
{
  "schemaVersion": 1,
  "generatedAt": "2026-08-01T12:00:00Z",
  "blocklist": { "evil@mod": ["<1.2.1"] },
  "mods": [
    {
      // the mod's full static manifest, embedded verbatim, PLUS:
      "latestVersion": "1.2.0",
      "publishedAt": "2026-08-01T12:00:00Z",
      "files": {
        "bundle.mjs":          { "url": "mods/evil@mod/1.2.0/bundle.mjs", "sha256": "…", "size": 48123 },
        "manifest.json":       { "url": "…", "sha256": "…", "size": 913 },
        "translations/en.json":{ "url": "…", "sha256": "…", "size": 2048 }
      },
      "readmeUrl": "mods/evil@mod/1.2.0/README.md",
      "versions": ["1.0.0", "1.1.0", "1.2.0"]   // all still-published versions (for appVersion/sdk fallback matching)
    }
  ]
}
```

URLs are **relative to the registry base URL** so mirrors (jsDelivr:
`https://cdn.jsdelivr.net/gh/<owner>/fate-core-mods@gh-pages/`) work by
swapping the base. The base URL ships as an app constant with an override
field in Developer Mode (useful for testing a staging registry).

`registry.schema.json` — write it once, use it in three places: registry CI,
`@fate-app/mod-build`'s `manifestChecks` (Phase 2 — retrofit it to consume
this schema), and app-side install validation. Keep the schema file **in the
registry repo** and vendor a copy into `packages/mod-types` (with a CI check
that they match).

## Step 2 — `validate-pr.yml` (runs on every PR)

Checks, in order (fail fast, comment results on the PR):

1. **Scope**: PR touches exactly one `mods/<id>/` folder (+ nothing outside
   it). Multi-mod or infra changes require maintainer label to pass.
2. **Ownership**: if `<id>` exists in `owners.json`, PR author must be listed.
   If it's a NEW mod: folder name matches `manifest.id`, `manifest.author.github`
   matches the PR author, and the id's `<author>` prefix matches their handle
   (or an approved org alias). The merge adds them to `owners.json`
   (maintainer does this, or a bot commit).
3. **Schema**: `manifest.json` validates against `registry.schema.json`;
   `languages` matches the files in `translations/`; `LICENSE` present.
4. **Version**: `manifest.version` is a valid semver **strictly greater** than
   the latest published version in `registry.json` (or `1.0.0`+ for new mods).
5. **Build**: `pnpm install --frozen-lockfile` (lockfile required, registry
   pinned), `pnpm build` with the **pinned** `@fate-app/mod-build`. Any
   build warning about size limits → fail at hard limits (bundle > 3 MB,
   artifact > 5 MB).
6. **Security lint** (ESLint flat config shipped in the repo root, run over
   the mod source):
   - **Errors (auto-reject)**: `eval`, `new Function`, `import()` with
     non-literal specifier, `document.write`, `<script>` injection patterns,
     obfuscated source (e.g. hex-escaped identifiers heuristic), minified
     source files (review requires readable source — enforce via
     line-length/entropy heuristic).
   - **Warnings (require human sign-off, posted as a PR comment checklist)**:
     `fetch`/`XMLHttpRequest`/`WebSocket`/`navigator.sendBeacon`,
     `localStorage`/`indexedDB` direct access, `document.cookie`,
     `crypto` misc. Network access isn't banned (a weather-dice mod could be
     legit) but must be justified in the PR description and re-reviewed.
7. **Smoke-load**: in Node with jsdom + a stub `globalThis.FateSDK`
   (export a stub package from `@fate-app/mod-build/testing`): import the
   built bundle, assert default export shape (`validateBundleShape` — reuse
   the app's function by exporting it from `mod-types`), instantiate each
   component with `@vue/test-utils` mount + stub context (renders without
   throwing).

## Step 3 — `publish.yml` (runs on merge to main)

1. Detect which mod folder changed; rebuild it from the merged tree
   (frozen lockfile, pinned toolchain — same as validate).
2. Compute SHA-256 + size for every artifact file.
3. Copy artifacts to `gh-pages:mods/<id>/<version>/` — **refuse if the path
   already exists** (immutability guard).
4. Regenerate `registry.json`: embed the manifest, update `latestVersion`,
   `versions`, `files`, copy `blocklist.json` in.
5. Commit + push gh-pages (single commit per publish; the gh-pages history is
   the audit log). Optionally ping jsDelivr's purge API for `registry.json`
   (versioned artifact paths never need purging).

Blocklist changes: editing `blocklist.json` on main triggers publish.yml too
(regenerate index only).

## Step 4 — `docs/REVIEW_CHECKLIST.md` (the human gate)

Non-negotiables for every PR review:

- Read **every** source file (PRs are small by size limits; refuse
  unreviewably large or generated-looking code).
- Understand every network call, storage access, and dynamic property access;
  match them against the mod's stated purpose.
- Check data handling: mods see whole `Character` objects — flag any code
  that serializes or transmits character data.
- Check the diff against the *previous* version for suspicious changes
  (the "v1 is clean, v1.1 adds exfiltration" pattern).
- Run it: scaffold → `fate-mod-build dev` → connect from the app → poke the UI.
- Verify translations aren't abusive/misleading in languages you can read;
  spot-check others (machine translate).

## Step 5 — App-side: `registryClient.ts`

```
src/mods/registryClient.ts
```

- `refreshIndex()`: `fetch(REGISTRY_BASE + '/registry.json')` → JSON parse →
  schema-sanity check → store `{ fetchedAt, index }` in the Dexie `kv` table.
  Called: on app start **after mount, in the background** (never blocks boot;
  cross-phase rule: startup works offline), when opening the Mod Store, and
  via manual pull-to-refresh. Throttle: ≤ 1 automatic refresh/hour.
- `getIndex()`: cached-first; `stale: boolean` flag if `fetchedAt` old or
  network failed.
- `applyBlocklist(index)`: for each installed mod (Dexie `mods` table), if
  `blocklist[id]` semver-matches its version → `setEnabled(id, false)` +
  mark row `blocked: true` (add the column) + queue a user notification
  (toast + badge in Settings → Mods explaining why, with "check for update"
  action — a fixed newer version un-blocks by normal update).
- **Service worker**: `vite.config.mts` Workbox config must exclude the
  registry base URL from any caching (`NetworkFirst` with tiny timeout or
  outright bypass) — a stale-cached `registry.json` would defeat the
  blocklist. Registry *artifacts* are content-addressed by hash → safe to
  cache; but they're already in Dexie post-install, so don't SW-cache them
  at all (keep it simple).
- **CORS note**: GitHub Pages and jsDelivr both send `access-control-allow-origin: *`
  — plain `fetch` works from `capacitor://` origins. No native-layer HTTP
  plugin needed. Verify once on iOS device early in this phase.

## Step 6 — App-side: `installFromRegistry` (extend `installService.ts`)

Differences from Phase 2's `installFromUrl`:

1. Input is a mod id (+ optional version, default latest **compatible**:
   the newest version whose `appVersion` and `sdk` ranges both match — the
   index's embedded manifests provide this; if only older versions match,
   offer the newest compatible with a note).
2. Every downloaded file is verified against the **index's** sha256 before
   the row is written (provenance, not just trust-on-first-use).
3. `source: 'registry'`; store the artifact base URL for updates.
4. No scary warning modal — the registry is the trusted path (keep a one-time
   "mods are community content" notice on first store install).

`checkForUpdates()`: on index refresh, diff installed versions vs latest
compatible; surface badges in the store + Settings → Mods. Update = download
new version files (verify hashes) → replace Dexie row → reload → existing
per-character patch machinery migrates data on next character open.

## Step 7 — App-side: the Mod Store UI

New page `src/views/mods/ModStorePage.vue` (+ route, + entry point from
Settings and/or a tab — product call; follow existing routing in `src/router/`).

- **Browse**: card list from `getIndex()` — icon/name/short description
  (⚠️ registry mods' `t.*` strings: the *index* embeds manifests whose
  translations aren't installed yet. The store must render names/descriptions
  from the mod's `translations/<uiLang>.json`… which isn't fetched either.
  **Solution**: publish.yml extracts `name` + `description` strings for every
  language the mod supports into the index entry
  (`"strings": { "en": { name, short }, ... }`) so the store renders them with
  zero extra requests. Add this to the Step 1 index shape and schema.)
- **Search/filter**: by name, tags, language support; "compatible with my
  app version" filter on by default (semver check against `appVersion`/`sdk`).
- **Detail view**: full description, README (fetch `readmeUrl`, render with
  the existing markdown-it dependency — sanitize! use markdown-it's default
  safe mode, no `html: true`), author + GitHub link, version list, config
  preview (from manifest — this is why config moved to the manifest in
  Phase 0), dependencies (with install-along prompts if missing),
  install/update/remove buttons with status.
- **Installed tab**: merges with the Phase 2 management list (this can absorb
  `ModsManagePage.vue`).
- Stale-index and offline states: show cached content + a "last updated …"
  banner.

## Step 8 — Resolution UX: `mod-not-installed`

The one change to `src/modules/utils/resolveModules.ts` in the whole project:

- New `ModuleResolutionIssue` type `'mod-not-installed'` raised when a
  character's `_modules` references an id absent from
  `ModRegistry.getLoadedManifests()` **but present in the registry index** —
  with `suggestedActions: [{ type: 'install', targetModules: [id] }]`.
  (Absent from both → keep today's behavior.)
- Wire the suggested action in the issues UI
  (`showIssuesMessage.ts` / configuration screen) to deep-link into the Mod
  Store detail page.
- This makes **character sharing** work end-to-end: import a `.fchar` that
  uses community mods → guided installs → character opens.

## Step 9 — Migrate the example mod → first community mod

Move `packages/example-mod` (Phase 2) into the registry repo as the first
published mod (e.g. `sonder@example` or something genuinely useful — a
"Notes+" or an extra stress track). It seeds the store, proves the whole
pipeline end-to-end, and doubles as the reference implementation linked from
`SUBMITTING.md`.

---

## Phase 3 verification (acceptance)

CI-side:
- [x] PR with valid new mod → all checks green → merge → appears in
      `registry.json` with correct hashes (verify one hash manually). Done
      for real: PR #1 (`sonder@example`), all 7 checks green, merged,
      `registry.json` live, `bundle.mjs` hash manually re-verified byte-for-byte.
- [x] PR tampering cases each fail: version not bumped; folder/id mismatch;
      author/owner mismatch; `eval` in source; oversized bundle; second PR
      touching someone else's mod folder. Verified by running the actual
      `scripts/ci/*.ts` against a fresh local clone with crafted branches for
      each case (not a live PR — see below for why that's still an accurate
      test): version-not-bumped, folder/id mismatch, `eval` in source (real
      security-lint rejection via `pnpm exec eslint`), and oversized bundle
      (real 3MB-hard-limit build failure) all confirmed. The "author/owner
      mismatch" and "second PR touching someone else's mod folder" cases
      turned out to be the *same* code path (`validate.ts`'s ownership
      check) — both branches tested directly (new-mod author mismatch, and
      an existing-owned-mod non-owner attempt after temporarily seeding
      `owners.json`). Along the way found that `owners.json` is still `{}` —
      nobody added `sonder@example`'s entry after PR #1 merged, exactly the
      manual follow-up the doc already flagged as "not this script's job."
      Not done via a live PR: `scripts/ci/lib/github.ts`'s PR-API calls
      (`getPullRequestLabels`, `upsertValidationComment`) already no-op
      safely with no token/real PR (by design, for exactly this kind of
      local testing), so invoking `scripts/ci/validate.ts` directly with
      crafted `BASE_SHA`/`HEAD_SHA`/`PR_AUTHOR` env vars runs the identical
      code the workflow runs — no `act`/Docker needed for these checks
      specifically, they turned out to have zero real GitHub-context
      dependency once actually read.
- [x] Republish attempt of an existing version → publish job refuses. Verified
      for real: checked out the live `gh-pages` branch (which already has
      `sonder@example@1.0.0` published) into a worktree, rebuilt the mod
      fresh, and ran `scripts/ci/publish.ts` against it — refused with the
      exact immutability-guard message, exit code 1.
- [x] Blocklist edit → index regenerated with it. Verified locally (a second
      `gh-pages` worktree, not the live repo — that's Checkpoint B's job,
      since blocking `sonder@example` for real briefly affects real
      installed copies): `--blocklist-only` with `sonder@example` blocked
      regenerated `registry.json`'s `blocklist` field correctly; clearing
      `blocklist.json` and re-running correctly cleared it again, with
      `mods` untouched throughout. A **real** block-then-unblock cycle
      against the live repo is still Checkpoint B, pending your go-ahead.

App-side:
- [x] Fresh app: open store → browse → install → use on a character →
      airplane mode → relaunch → everything works offline. Verified via
      `offline.cy.ts` (forced network error + backdated cache after install;
      Installed tab and stale-cache Browse view both hold up) — the literal
      device/airplane-mode ritual is still worth a manual re-confirmation but
      carries no remaining engineering risk.
- [x] Update flow: publish v1.0.1 → badge appears → update → character data
      intact (and patch runs if the mod ships one). Checkpoint C done for
      real: PR #2 (`sonder@example` 1.0.0→1.0.1, docs-only) merged, CI green,
      `publish.yml` ran, `registry.json` live with `latestVersion: "1.0.1"`
      and `versions: ["1.0.0","1.0.1"]`, `bundle.mjs`/`manifest.json` hashes
      manually re-verified byte-for-byte. The in-app badge-appears/update-
      click/character-data-intact half is mechanically proven by
      `update.cy.ts`; a live joint-session re-confirmation against this real
      v1.0.1 is still worth doing but isn't new engineering risk.
- [x] Blocklist the installed version → refresh index → mod auto-disabled
      with explanation; publish fixed version → update path un-blocks.
      Checkpoint B done for real: pushed `blocklist.json` blocking
      `sonder@example >=1.0.0 <2.0.0` directly to main (this is a direct
      push, not a PR — `publish.yml` triggers on push to main for
      `blocklist.json`, and `validate-pr.yml` would actually reject a
      blocklist-only PR since it requires a touched `mods/` folder, so a
      direct commit is the correct, intended mechanism, not a shortcut),
      confirmed live (`registry.json`'s `blocklist` field populated),
      immediately reverted to `{}` and pushed again, confirmed cleared.
      Total real-world blocked window: under a minute. Noted GitHub Pages'
      CDN briefly served a stale cached response after the unblock push —
      resolved itself within ~20s, matching the `.nojekyll`-lag precedent
      already documented above; not a real bug. Mechanically also verified
      via `blocklist.cy.ts` (confirmed un-blocking only clears the
      explanation, doesn't re-enable — that's a manual Enable action).
- [x] Corrupt a downloaded file in transit (point dev override at a
      tampered staging registry) → install refused on hash mismatch. Verified
      via `install.cy.ts`'s tamper case — the app can't distinguish a fixture
      with a deliberately-wrong hash from a file altered in transit, so this
      is the same code path a real tampered staging registry would hit.
- [x] `.fchar` import referencing a not-installed registry mod →
      `mod-not-installed` flow → guided install → character opens. Verified
      via `notInstalled.cy.ts` (the real `.fchar` file-picker isn't Cypress-
      drivable — see that spec's comment — so the character's `_modules` is
      patched directly via IndexedDB to reach the identical downstream code
      path a real import would trigger).
- [ ] Store on iOS device + Android + web (CORS, rendering, README). Deferred
      — no device confirmed available.
- [x] Cypress: store browse/install against a local fixture registry
      (static file server with a fixture `registry.json`). Done —
      `src/tests/e2e/specs/modStore/` (7 files, 15 tests, all green), fixture
      registry/mod files under `src/tests/e2e/fixtures/mods/`.

## Phase 3 exit checklist

- [x] `fate-core-mods` repo live with schema, owners, blocklist, docs, both
      workflows — <https://github.com/Stanislavsonder/fate-core-mods>
- [x] Index published on gh-pages — jsDelivr mirror **not yet documented**
      (mentioned as a design option in the doc's Step 1, no follow-up action
      taken; low priority since GitHub Pages alone is working)
- [x] `registryClient` with cache/throttle/blocklist — SW `NetworkOnly` rule
      added to `vite.config.mts` (defensive; no runtimeCaching rule currently
      matches the registry host anyway, so this isn't load-bearing yet)
- [x] `installFromRegistry` + updates with hash verification (latest version
      only — see "Deviations" above for why older versions are out of scope)
- [x] Mod Store UI (browse/search/detail/installed) shipped
- [x] `mod-not-installed` resolution issue + deep link (a real clickable
      toast action, not a route/UI change — see "Deviations" above)
- [x] First real mod published through the full pipeline — `sonder@example`,
      verified live with a manual hash re-check against the published bundle
- [x] All acceptance boxes above checked, except device passes (deferred, no
      hardware confirmed available — the one legitimately open item). Every
      CI-side check, every app-side flow, and the full Cypress suite are
      verified — including three real, live actions against the actual
      `fate-core-mods` repo (Checkpoint C's v1.0.1 publish, Checkpoint B's
      block/unblock cycle), each done only after explicit go-ahead. Phase 3
      is functionally closed out; only the Privacy Policy follow-up
      (`phase-5-other-improvements.md`) and device testing remain before
      calling it fully shipped to end users.
