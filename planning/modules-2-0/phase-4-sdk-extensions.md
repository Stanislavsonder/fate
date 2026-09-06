# Phase 4 â Public SDK Release & Capability Extensions (Dice, Themes, Localization)

> **Status: app-side implementation done and verified locally.** What's left
> is entirely on the separate `fate-core-mods` repo (accepting `dice`/`theme`
> capability submissions, publishing a real dice mod end-to-end) plus author
> docs there â see `planning/modules-2-0/phase-5-other-improvements.md` for
> the itemized backlog. `pnpm build && pnpm lint && pnpm test` all green.
>
> **Prerequisites:** Phase 3 complete (registry live, store shipped, first mod
> published).
>
> **Outcome:** the authoring toolchain is published to npm with real docs, a
> one-command scaffolder exists (`pnpm create fate-mod`), and the capability
> system gains its first non-sheet capability: **custom dice**. Theme (skins)
> and pure-localization capabilities are designed and stubbed so their later
> implementation is additive.
>
> After this phase the project is "open for business": a stranger can go from
> zero to a published mod using only public packages and docs.

## Update (implementation session)

- `@fate-app/mod-types`/`@fate-app/mod-build` were already live on npm
  before this session (published manually as a Phase 3 prerequisite, at
  `0.1.x`) â this session added the real `publish-sdk.yml` GitHub Actions
  workflow (tag `mod-sdk-v*`, provenance, dry-run support) and aligned both
  packages' versions to `1.0.0` to match `SDK_VERSION`'s scheme going
  forward. **The `NPM_TOKEN` repo secret still needs to be added manually**
  before the workflow can actually publish â untested end-to-end.
- `create-fate-mod` was built and verified for real: packed both SDK
  packages with `pnpm pack`, `npm install`'d them into a scaffolded project
  exactly like an external consumer would, and ran `npm run build` â it
  produced a correct `bundle.mjs` with `vue` externalized to `FateSDK.vue`.
  `packages/mod-build` gained a real `fate-mod-build` CLI (`dev`/`build`
  bin) it didn't have before â the scaffolder depends on this existing.
- **Design deviation from this doc's original sketch**: `Dice`/`DiceMaterial`
  are NOT exposed via `FateSDK.dice` as originally planned. They're tiny
  classes with no three/cannon-es logic of their own (only type
  annotations), so they're real runtime exports of `@fate-app/mod-types`
  instead â bundled directly into each mod (negligible size), imported
  normally (`import { Dice, DiceMaterial } from '@fate-app/mod-types'`).
  Only the two actual heavy libraries, `three` and `cannon-es` themselves,
  go through `FateSDK.dice` (lazy-loaded, mirroring the existing `ionicons`
  pattern). This also makes the app's own built-in dice
  (`src/dice/shapes|materials/index.ts`) a thin re-export from
  `@fate-app/mod-types` â single source of truth (decision D7), zero
  behavior change for existing built-ins.
- Namespacing decision: built-in dice (Fudge/D20) keep unnamespaced
  `DICE_SHAPES`/`DICE_MATERIALS` keys for backward-compat with persisted
  `localStorage['dice-roll-config']`; external mods' shapes/materials
  register under `${modId}:${name}`. `registerBuiltinDice()` was
  generalized into a capability-sync that rebuilds the external portion
  authoritatively on every Roll Dice page visit (not kept-alive, so this
  naturally handles install/uninstall without separate hooks scattered
  through `installService.ts`). Found and fixed a real bug while wiring
  this up: `DiceTypeSelect.vue` keyed dice selection by the bare class
  `name` (not the Map key), which would have silently collided once two
  mods shared a shape name â fixed to key by the namespaced Map key.
- `FateModDice.shapes`/`materials` are now properly typed
  (`DiceConstructor[]`/`DiceMaterial[]`, no longer `unknown[]`).
  `validateBundleShape` gained a `dice` branch (shape/material structural
  checks) and a 100KB size cap on `theme.css` (theme was otherwise already
  fully working for external mods via `useSkins.ts`'s generic
  `ModRegistry`-driven listing â no new mechanism needed there).
  `SDK_VERSION` bumped `1.0.0` â `1.1.0` (additive: `FateSDK.dice`).
- **Not done this session, deferred to Phase 5's backlog** (all require
  touching the live `fate-core-mods` repo, gated on the standing
  per-action confirmation rule): `validate-pr.yml` still rejects `dice`/
  `theme` capability submissions; no real dice mod has been published
  through the full pipeline yet; `docs/GUIDE.md`/`SUBMITTING.md` polish in
  that repo; the `translationTargets` schema stub (touching the vendored
  `registry.schema.json` alone would fail `pnpm check-registry-schema`'s
  diff against the live canonical copy â this one's genuinely coupled to
  a live-repo change, not just optional polish).

## Step 1 â Publish the npm packages

Three packages, all under the `@fate-app` npm scope (register the scope/org
first; `@fate` was the original choice and turned out to be unavailable — see
`planning/branding-migration/` for the rename and its fallbacks):

| Package | Source location | Contents |
|---|---|---|
| `@fate-app/mod-types` | `packages/mod-types` (this repo) | All mod-facing types, `defineFateMod`, `getModData`, `validateBundleShape`, vendored `registry.schema.json` |
| `@fate-app/mod-build` | `packages/mod-build` (this repo) | `defineModConfig()` Vite preset, FateSDK shims, CSS injector, manifest checks, `fate-mod-build dev` server, `/testing` stub-FateSDK entry |
| `create-fate-mod` | new `packages/create-fate-mod` | Scaffolder, so `pnpm create fate-mod` works |

Publishing mechanics:

1. `packages/mod-types` gets a real build step (`tsc --emitDeclarationOnly` +
   ESM output, or `tsup`): published packages ship compiled `.d.ts` + JS, not
   raw TS. Inside the workspace the app keeps consuming source via the
   `exports` map's `development` condition or `workspace:*` resolution â
   verify `vue-tsc` still passes after adding the build.
2. **Version discipline**: `@fate-app/mod-types` and `@fate-app/mod-build`
   versions track `SDK_VERSION` (the FateSDK ABI, Phase 2 Step 1) â same
   major.minor, patch free. The manifest's `sdk` range is checked against the
   ABI at load; the packages are how authors compile against that ABI. Write
   this rule into both READMEs and `docs/MOD_API.md`.
3. Release automation: a GitHub Actions workflow in this repo publishing on
   tag (`mod-sdk-v*`) with `pnpm publish -r --filter './packages/*'`,
   provenance enabled (`--provenance`).
4. CI guard (this repo): if a PR changes anything exported by
   `packages/mod-types` or the `FateSDK` object without bumping
   `SDK_VERSION`, fail. (A simple exported-API snapshot test â e.g.
   `api-extractor` or a jest snapshot of `Object.keys` â is enough.)

## Step 2 â `create-fate-mod` (scaffolder)

Port of `scripts/module-generator/` (which scaffolds *internal* modules) to a
standalone `create-*` package producing an *external* mod project:

```
pnpm create fate-mod
# prompts: mod id (author@name â validate format), display name, author github,
#          capabilities (checkbox: sheetComponents/dice/theme/translations), languages
```

Output:

```
<author>@<name>/
  package.json          # devDeps: @fate-app/mod-build + mod-types (pinned to current SDK),
                        # scripts: { dev: "fate-mod-build dev", build: "fate-mod-build build" }
  manifest.json         # valid against registry.schema.json, sdk: "^<current>"
  bundle.ts             # defineFateMod stub per chosen capabilities
  src/ExampleSection.vue
  translations/en.json  README.md  CHANGELOG.md  LICENSE (MIT prompt)  .gitignore
  vite.config.ts        # export default defineModConfig()
  tsconfig.json
```

The generated README walks the author through: `pnpm dev` â app Developer
Mode â connect â live reload â submit to `fate-core-mods` (link
`SUBMITTING.md`). Keep `scripts/module-generator` for internal built-ins or
retire it in favor of the scaffolder + a `--builtin` flag â either way avoid
maintaining two divergent templates.

## Step 3 â Author documentation site (minimum viable)

Don't over-build; markdown in the registry repo's `docs/` is enough:

- `SUBMITTING.md` (exists from Phase 3) â polish with the scaffolder flow.
- `docs/GUIDE.md` â full walkthrough: concepts (manifest vs bundle,
  capabilities, lifecycle, context, config schema, translations/`t.` keys),
  the dev loop, testing, common pitfalls (Tailwind not available; CSS
  variables for theming; character data via `getModData`; no app-internal
  imports; single-file bundle implications).
- `docs/MOD_API.md` â copied/synced from this repo (Phase 2 Step 8) or linked.
- API reference: generate from `mod-types` (typedoc) into `docs/api/` â
  optional, nice-to-have.

## Step 4 â The `dice` capability (first non-sheet extension)

> **Update:** the built-in half of this capability landed early, in Phase 1
> Step 6 (`phase-1-builtins-migration.md`) â Fudge and D20 are already
> bundled as `sonder@dice-fudge`/`sonder@dice-d20` built-in mods with
> `capabilities: ["dice"]`, and `src/dice/registerBuiltinDice.ts` already
> populates `DICE_SHAPES` from `ModRegistry` at boot (namespacing/removal
> weren't needed yet since only built-ins exist and none are ever
> uninstalled). What's described below is the **remaining** work: exposing
> `three`/`cannon-es`/the `Dice` base class to *external* authors via
> `FateSDK.dice`, promoting `FateModDice.shapes`/`materials` from `unknown[]`
> to properly-typed `DiceConstructor[]`/`DiceMaterial[]` in `mod-types`,
> namespaced keys + clean removal (needed once dice can actually be
> uninstalled), CI validation, and proving it with a real *published* dice
> mod end-to-end.

### Context: how dice work today

`src/dice/` renders 3D dice with Three.js + cannon-es physics:

- `src/dice/shapes/index.ts` defines an abstract `Dice` base class and a
  `DiceConstructor` type â static `icon`/`name`, abstract methods
  `clone`, `getResult`, `formatResult`, `changeMaterial`, `createMesh`
  (Three.js), `createBody` (cannon-es). Still app-local (not in `mod-types`).
- Concrete dice: `sonder@dice-fudge` (4dF fate dice), `sonder@dice-d20` â
  built-in mods as of Phase 1, living under `src/modules/`.
- `DICE_SHAPES: Map<string, DiceConstructor>` (`src/dice/constants.ts`) is
  now populated at boot by `registerBuiltinDice()` from `dice`-capability
  mods in `ModRegistry`, rather than being a hardcoded literal.
  `DICE_MATERIALS: Map<string, DiceMaterial>` is still a hardcoded literal
  (white/black) â Phase 1 deliberately left materials un-modded.
- The roll screen builds its options from these Maps
  (`components/RollConfig/`), and the scene composables
  (`useDiceScene/Physics/Result/Motion`) consume instances.

The remaining extension is therefore: let *external* mod bundles contribute
to `DICE_SHAPES`/`DICE_MATERIALS` too (not just built-ins), with the
namespacing/removal/validation that only matters once dice can be installed,
disabled, and uninstalled at runtime.

### How

1. **Expose the contract**: move/mirror the `Dice` abstract class type,
   `DiceConstructor`, and `DiceMaterial` into `@fate-app/mod-types`
   (types only). Expose the *runtime* base class + three/cannon-es through
   FateSDK under a namespaced, explicitly-experimental key:

   ```ts
   // sdk.ts additions â SDK minor bump (e.g. 1.1.0)
   dice: Object.freeze({ three, cannonEs, Dice /* base class */ }),
   ```

   Mods compiled with `mod-build` get `three`/`cannon-es` added to the
   externals map (`'three': 'FateSDK.dice.three'`, `'cannon-es':
   'FateSDK.dice.cannonEs'`). Document as **experimental** in `MOD_API.md`:
   a Three.js major upgrade will be an SDK major.

2. **Bundle surface** (already typed as a stub in Phase 0):

   ```ts
   export default defineFateMod({
     dice: {
       shapes: [MyD12],            // DiceConstructor[]
       materials: [MyNeonMaterial] // DiceMaterial[]
     }
   })
   ```

3. **Registration**: dice are **app-level**, not per-character (the dice
   roller exists outside any character) â this part is already proven by
   Phase 1's `registerBuiltinDice()`. Extend it (or the Phase 2 `loader.ts`
   equivalent) to also run for `source !== 'builtin'` mods, switching to
   **namespaced keys** (`<modId>:<name>`) to prevent collisions now that
   collisions are possible; on mod remove/disable, delete those keys â Phase
   1's built-ins never needed this since nothing is ever removed. `RollConfig`
   UI shows them like built-ins (localized names via the mod's merged
   translations). Persisted roll-config referencing a since-removed die must
   fall back gracefully to fudge dice â check how the current config persists
   (localStorage) and guard it.
4. **Validation additions**: `validateBundleShape` checks `dice` entries
   (constructor is a function, static name/icon present); registry CI
   smoke-load instantiates each die headlessly (three runs fine in node with
   a stub canvas for constructor-level checks â keep it shallow, real
   rendering is reviewed by a human).
5. **Prove it**: build a real dice mod (e.g. `sonder@dice-d6` â a standard
   d6 with pips) through the full pipeline: scaffold â dev-mode on device
   (dice = the best live-reload demo there is) â publish to registry â
   install from store â roll it.

## Step 5 â `theme` (built-in half done; finish external) and `translations` design-stub

### `theme` (app skins)

> **Update:** the built-in half landed in Phase 1 Step 7 â one dummy
> `sonder@theme-pink` mod (`capabilities: ["theme"]`, `theme: { css }`), a
> skin concept in `useTheme.ts`/`useSkins.ts` (persisted selection,
> `<style data-skin-id>` injection covering both `:root` and
> `:root.ion-palette-dark`), and a picker in `ThemePage.vue`. What's left here
> is exactly the external-mod half: letting *downloaded* theme mods register
> the same way, plus store/registry integration.

- Bundle surface: `theme: { css: string }` (Phase 0 type, already used by
  `sonder@theme-pink`). The CSS is a set of overrides for the **documented**
  CSS variable surface: Ionic palette vars + the app's own vars in
  `src/styles/variables.css` (audit which are stable enough to document; that
  list becomes part of `MOD_API.md` â `sonder@theme-pink`'s CSS is the first
  real example of what's safe to override).
- Runtime model: already implemented for built-ins by Phase 1 (see above) â
  extend the same `useSkins.ts` listing to include non-`builtin`-source mods
  once Phase 2's loader can install/remove them, and wire the store UI
  (browse/install/select a skin) once Phase 3 exists.
- Store integration: once the Mod Store (Phase 3) exists, theme mods should
  be installable/selectable from it like any other mod â no more
  "coming soon" stub needed, since the runtime model is proven.

### `translations` (localization packs) â design

- Purpose: community-provided translations **for the app or for other mods**,
  shipped as data-only mods (no bundle code at all â `entry` optional when
  capabilities is exactly `["translations"]`).
- Manifest addition (schema now, implementation later):
  `"translationTargets": ["app"]` or `["some@mod"]`.
- Runtime model (later): merge via `mergeLocaleMessage` into the target
  namespace (app strings = root namespace â needs a collision policy:
  community pack loses to shipped strings unless key is missingâ¦ decide when
  implementing).
- CI: translation-only PRs skip build/security-lint steps (nothing
  executable) â much lighter review; likely the highest-volume contribution
  type, which is exactly why the capability model pays off.

## Step 6 â Project close-out

- [ ] Sweep all `docs/modules-2.0/` files: correct anything that drifted;
      mark each phase's exit checklist as historically complete.
- [ ] Update the app repo's `CLAUDE.md` / `README.md`: module system section
      now describes 2.0 (registry, loader, SDK) and links here.
- [ ] Announce: registry repo README badge in the app, release notes,
      wherever the app's community lives.
- [ ] Define the maintenance cadence: dependency upgrades that touch the ABI
      (Vue/Ionic majors) get an RFC issue in the registry repo before the
      SDK major ships; blocklist response target (e.g. same-day) written into
      the registry README.

## Phase 4 verification (acceptance)

- [~] On a machine with no repo checkout: `pnpm create fate-mod` â `pnpm dev`
      â connect from a store-installed app build â live reload works â the
      complete stranger-to-running-mod loop, using only published packages.
      **Verified: scaffold â `npm install` (real packed tarballs, not
      workspace links) â `npm run build`** produces a correct `bundle.mjs`
      with `vue` externalized. **Not verified: live dev-mode connect against
      a running app** (needs a manual/device session) â packages also aren't
      published yet (`NPM_TOKEN` secret pending).
- [~] The dice mod: rolls correctly on web + iOS + Android, physics sane,
      result formatting correct, uninstalls cleanly (die disappears from
      RollConfig, persisted roll config falls back). **Phase 5 session:**
      `sonder@dice-d6@1.0.0` published to the live registry through real CI;
      the uninstall/fallback path is covered by `dice/externalDice.cy.ts` in
      a real browser (WebGL scene included). Still user-verified-only:
      installing from the live Mod Store in-app, physics feel, and
      iOS/Android device passes.
- [x] SDK version guard CI: a PR adding a FateSDK key without bumping
      `SDK_VERSION` fails. Verified via `src/tests/unit/mods/sdkSurface.test.ts`
      â it genuinely failed when `Dice`/`DiceMaterial`/`dice` were added
      without updating the expected list, confirming the guard works before
      the list was updated alongside the real `SDK_VERSION` bump.
- [x] A mod compiled against SDK 1.0.0 (Phase 3's published mod) still loads
      on the app with SDK 1.1.0 (backward-compat proof). Confirmed:
      `semver.satisfies('1.1.0', '^1.0.0') === true` â `sonder@example`'s
      manifest declares `"sdk": "^1.0.0"`.
- [x] Schema accepts `theme`/`translations` capabilities; store handles them
      per the chosen policy without errors. **Phase 5 session:** the registry
      CI gap is closed (`fate-core-mods` PR #3 â smoke-load at mod-build
      1.1.0 handles every capability; the stale "rejected for now" schema
      comment removed; `translationTargets` added to schema + manifest type).
- [~] An externally-published theme mod installs, selects, and applies the
      same way `sonder@theme-pink` does today. **The app-side mechanism is
      confirmed already generic** (`useSkins.ts` derives its list from
      `ModRegistry.getAll()` regardless of `source` â no code change was
      even needed here) â the registry now accepts theme submissions; what's
      still missing is simply someone publishing a real theme mod (no
      first-party one planned; community-driven from here).

## Phase 4 exit checklist

> **All items below closed in the Phase 5 session (2026-07-26)** â the tag
> `mod-sdk-v1.1.0` published all three packages (create-fate-mod's first
> release), `fate-core-mods` PRs #3â#6 landed the registry-side changes, and
> `sonder@dice-d6@1.0.0` is live in the public registry, submitted through
> the real CI pipeline (build + security lint + dice smoke-load).

- [x] Three packages published to npm â `mod-types`/`mod-build`/
      `create-fate-mod` all at `1.1.0`, published via `publish-sdk.yml` on
      the `mod-sdk-v1.1.0` tag. (Provenance caveat: published with a
      short-lived granular token; switch to npm Trusted Publishing â see
      the Phase 5 backlog.)
- [x] `SDK_VERSION` guard CI in place.
- [x] Scaffolder end-to-end verified against the *published* npm packages â
      `create-fate-mod@1.1.0` installed from the registry generated
      `sonder@dice-d6`, which built and passed CI with real npm deps.
      (Live dev-mode connect remains user-verified-only.)
- [x] Author guide + API docs published in the registry repo â
      `docs/GUIDE.md` (new), `SUBMITTING.md` scaffolder-first update, and a
      root `README.md` with the trust model + maintenance policy.
- [x] `dice` capability shipped with a real published dice mod:
      `sonder@dice-d6@1.0.0` (D6 + gold material) live in `registry.json`.
      Also fixed en route: the loader never called `loadDiceLibs()` (Phase 4
      shipped the function with no call site â every external dice mod would
      have failed to import), caught by the new Cypress dice spec.
- [x] `theme` capability accepted by the registry (schema description fixed,
      smoke-load tooling at 1.1.0); `translationTargets` now in the
      canonical + vendored schema and the manifest type (declarative stub,
      runtime merge still future work).
- [x] Close-out list done â `CLAUDE.md`/root `README.md` describe
      Modules 2.0; registry repo README carries the maintenance cadence and
      blocklist response target.

Remaining follow-ups all live in `phase-5-other-improvements.md` (trusted
publishing, mod-build 1.1.1 robustness fixes, in-app install verification).
