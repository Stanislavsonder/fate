# Branding migration: dropping `fate-core` from the mod SDK and registry

## Context

The app was renamed to **Assistant for Fate** for Evil Hat compliance in 1.5.0, and the GitHub
repo moved from `Stanislavsonder/fate-core` to `Stanislavsonder/fate`. Two `fate-core` identifiers
survived that pass because they belong to the unfinished Modules 2.0 work:

- the npm scope **`@fate-core/*`** (`mod-types`, `mod-build`) — 187 references across 86 files
- the mod registry repo **`Stanislavsonder/fate-core-mods`**, served over GitHub Pages — 29
  references across 21 files

Nothing depends on either yet, so this is the cheapest it will ever be. After 2.0.0 ships, every
published mod is built against the old scope and every installed app points at the old Pages URL.

**Target names:** `@fate-app/*` and `Stanislavsonder/fate-mods`.

Git links were already migrated in `12e1027`; this document covers only what is left.

### What makes this cheap

Four facts, each verified against the live state rather than assumed:

1. **Built mod bundles do not contain the scope name.** `packages/example-mod/dist/bundle.mjs` has
   zero `fate-core` hits — `mod-build` externalizes every host library into `FateSDK.*` reads, so
   the scope is a build-time dependency only. Renaming it is an **authoring-time** break, not a
   runtime ABI break. Already-built bundles keep loading.
2. **Registry file URLs are relative.** Live `registry.json` entries carry
   `"url": "mods/sonder@example/1.0.1/bundle.mjs"`, resolved against a single
   `DEFAULT_REGISTRY_BASE` constant. The app side of the registry rename is one line.
3. **No shipped client hits the registry.** The mod system exists only on 2.0.0, which is
   unreleased; the two mods in the live registry are both yours (`sonder@example`). GitHub Pages
   URLs do *not* redirect on repo rename, but there is no installed base to break.
4. **The published packages are unpublishable.** Past the 72-hour window (published 25–26 Jul
   2026), but they meet npm's post-72h criteria: 11 / 15 / 6 weekly downloads, all far under 300.

### One decision to confirm before starting

You chose "unpublish entirely" for all three published packages. `create-fate-mod` **has no
`core` in its name** and needs no rename — it was only in that list because it ships from the same
workflow. Unpublishing it would mean a 24-hour block on republishing the name, and `1.1.0` could
never be reused (npm permanently burns name+version pairs), so it would come back as
`create-fate-mod@1.2.0` for no benefit.

**Recommendation:** unpublish `@fate-core/mod-types` and `@fate-core/mod-build`; leave
`create-fate-mod` published and simply bump it. Step 5 assumes this. If you do want all three
gone, the only change is adding it to the unpublish list and republishing at `1.2.0`.

---

## Step 1 — Claim the `@fate-app` npm scope (blocking)

`@fate` was the first choice and is **not available**. `@fate-app` is the replacement, but its
availability has not been confirmed either — npm exposes no unauthenticated way to check whether a
scope is claimed (the `scope:` search qualifier is broken; it reports zero packages even for
`babel` and `angular`, and the org/user endpoints require auth). So this step is genuinely
blocking: do it before touching a single file, or you risk a second 86-file sweep.

```bash
npm login
npm org create fate-app
# or, if you would rather not create an org, claim it by publishing:
#   npm publish --access public   from a throwaway package named @fate-app/probe
```

If `@fate-app` is also taken, the fallbacks in descending order of certainty are:

1. **`fate-mod-types` / `fate-mod-build`, unscoped** — verified free at the time of writing, and no
   scope to claim, so this cannot fail the same way twice. Also matches what you already ship:
   `create-fate-mod`, and mod-build's bin is already `fate-mod-build`.
2. **`@<your-npm-username>/*`** — your own username scope is yours by definition; guaranteed to work.
3. `@sonder/*` — matches the `sonder@…` built-in module prefix, same unverifiable risk.

Substituting any of these changes nothing else in this plan except the string.

Confirm the `NPM_TOKEN` repo secret has publish rights on whatever you claim. The existing token is
scoped to `@fate-core` and **will not work** — `.github/workflows/publish-sdk.yml` says so in its
header comment, which also needs updating.

## Step 2 — Rename the scope in this repo

Mechanical, but do it as one commit so `pnpm install` never sees a half-renamed workspace.

```bash
# Every reference except the lockfile, which pnpm regenerates
git grep -Il '@fate-core/' -- . ':!pnpm-lock.yaml' ':!.idea' \
  | xargs perl -pi -e 's{\@fate-core/}{\@fate-app/}g'

rm -rf node_modules packages/*/node_modules
pnpm install          # rewrites pnpm-lock.yaml, relinks workspace:* deps
```

Reference distribution, so you know what to expect: `src/` 44 files (mostly
`import type { … } from '@fate-core/mod-types'`), `packages/` 26, root config 25, `planning/` 7,
`scripts/` 2, `docs/MOD_API.md` (10 hits alone), `.github/` 1.

Points worth checking by hand after the sweep:

| File | Why |
| --- | --- |
| `packages/mod-types/package.json`, `packages/mod-build/package.json` | the `name` fields themselves |
| `packages/mod-build/package.json:49` | `"@fate-app/mod-types": "workspace:^1.1.0"` — the pinned range, not `workspace:*` |
| `package.json:64`, `packages/example-{mod,dice-mod}/package.json` | `workspace:*` consumers |
| `.github/workflows/publish-sdk.yml` | header comment naming the `@fate-core` org, and the `--filter` paths (path-based, so they survive) |
| `src/tests/unit/mods/sdkSurface.test.ts` | imports the scope *and* its docstring names it twice |
| `packages/create-fate-mod/src/generate.ts` | 7 hits — templates the dependency into every scaffolded mod |
| `packages/example-*/tsconfig.json` | comments explaining the `vite.config.ts` import |
| `scripts/module-generator/index.ts` | 3 hits in the built-in module template |

## Step 3 — Bump SDK package versions to 2.0.0

The ABI is unchanged (see fact 1), so this bump is about **package identity**, not compatibility.
Publishing a renamed package at `1.1.0` would imply continuity with `@fate-core/mod-types@1.1.0`
that does not exist.

`src/tests/unit/mods/sdkSurface.test.ts` documents the rule: `SDK_VERSION` (`src/mods/sdk.ts:11`)
and both package versions move in lockstep.

- `packages/mod-types/package.json` → `2.0.0`
- `packages/mod-build/package.json` → `2.0.0`, and its `@fate-app/mod-types` range → `workspace:^2.0.0`
- `src/mods/sdk.ts` `SDK_VERSION` → `'2.0.0'`
- `packages/create-fate-mod/package.json` → `1.2.0` (name unchanged; it just templates the new scope)

Then check what this does to mod resolution: registry entries carry `"sdk": "^1.0.0"`, and the
loader gates on it. Bumping `SDK_VERSION` to `2.0.0` makes every existing registry entry fail that
check — which is correct and intended here, but means the two mods in the live registry must be
republished (Step 6) or they will show as incompatible.

## Step 4 — Rename the registry repo

Two repos, and the schema is byte-matched between them, so order matters.

**In `Stanislavsonder/fate-core-mods`:**

1. Rename the repo to `fate-mods` (GitHub Settings → General). Confirm Pages redeploys at
   `https://stanislavsonder.github.io/fate-mods/`.
2. Update `registry.schema.json` — `$id` (`…/fate-core-mods/registry.schema.json`) and the
   `description`, which reads "submitted to fate-core-mods". This is also where the **last
   remaining `FATE: Core` string in this repo** lives, in the schema `title`.
3. Update that repo's own workflows (`validate-pr.yml`, `publish.yml`) and README.

**Then in this repo**, in the same PR as the re-vendored schema:

| File | Change |
| --- | --- |
| `src/composables/useRegistryBase.ts` | `DEFAULT_REGISTRY_BASE` — the one line that matters at runtime |
| `vite.config.mts` | the `NetworkOnly` workbox `urlPattern` regex |
| `scripts/check-registry-schema/index.ts` | `CANONICAL_URL` (raw.githubusercontent) |
| `packages/mod-types/registry.schema.json` | re-vendor byte-for-byte from the renamed repo |
| `src/tests/e2e/support/modStore.ts` | intercept URLs |
| `src/mods/installService.ts`, `src/mods/registryClient.ts` | comments only |
| `privacy-policy/languages/en.md` §5 | **user-visible** — names the host to users |
| `.prettierignore`, `CLAUDE.md`, `README.md`, `docs/MOD_API.md`, `planning/modules-2-0/*` | prose |

`pnpm check-registry-schema` fails loudly if the vendored copy and the canonical one disagree, so
it will catch a half-done rename. Run it before pushing.

Leave the old Pages URL dead — no shipped client uses it (fact 3). If you would rather not rely on
that, keep a `fate-core-mods` repo publishing a redirect stub, but it is not needed.

## Step 5 — Publish and unpublish

Publish first, so there is never a window with no SDK on npm:

```bash
git tag mod-sdk-v2.0.0 && git push origin mod-sdk-v2.0.0
```

Verify `@fate-app/mod-types@2.0.0`, `@fate-app/mod-build@2.0.0`, `create-fate-mod@1.2.0` all resolve, and
that a scaffolded mod builds against them end to end (Step 7).

Only then remove the old ones:

```bash
npm unpublish @fate-core/mod-types --force
npm unpublish @fate-core/mod-build --force
```

If npm refuses (its post-72h check is enforced server-side and the criteria can be evaluated
differently than the public download numbers suggest), fall back to deprecation, which always
works and leaves a better breadcrumb anyway:

```bash
npm deprecate @fate-core/mod-types "Renamed to @fate-app/mod-types"
npm deprecate @fate-core/mod-build "Renamed to @fate-app/mod-build"
```

## Step 6 — Rebuild fixtures and republish the two live mods

The Cypress fixtures are committed snapshots of real build output and drift when `SDK_VERSION` or
mod-build's shims change — both happen here:

```bash
pnpm fixtures:mods    # rebuilds src/tests/e2e/fixtures/mods/, commit the diff
```

Then rebuild and republish `sonder@example` and the dice example into the renamed registry so
their `sdk` ranges match the new `SDK_VERSION`, and regenerate `registry.json` (its `files[].sha256`
hashes change with the rebuilt bundles).

## Step 7 — Verify

```bash
pnpm install
pnpm exec vue-tsc --noEmit        # catches any missed import of the old scope
pnpm lint
pnpm check-registry-schema        # proves both repos agree on the schema
pnpm test:unit                    # sdkSurface.test.ts guards the renamed ABI surface
pnpm test:e2e                     # modStore specs exercise the renamed registry base
pnpm build
```

Then the checks a green suite will not catch:

```bash
git grep -In 'fate-core' -- . ':!.idea'      # expect zero hits
```

- Scaffold a mod end to end in a temp dir: `pnpm create fate-mod`, then build it — proves
  `generate.ts`'s templated dependency resolves against the real published `@fate-app/*`.
- In `pnpm dev`, open Settings → Mods and confirm the store lists both mods from the renamed
  registry, and that installing one still passes hash verification.
- Confirm Developer Mode's registry-base override still works (`registryBaseOverride` in
  localStorage) — it is the escape hatch if the Pages URL misbehaves.

> Known pre-existing failure, unrelated to this work: `src/tests/e2e/specs/modStore/blocklist.cy.ts`
> fails on 2.0.0 as well (verified against a pristine worktree). Do not treat it as migration
> fallout.

## Ordering summary

Steps 1→3 (npm scope) and Step 4 (registry) are independent and can land as separate PRs. If you
want to reduce risk, do the registry rename first — it is one runtime constant and reversible,
whereas the scope rename touches 86 files and burns npm names permanently once published.
