# Phase 0 — Groundwork & Feasibility Spike

> **Prerequisite reading:** [README.md](./README.md) in this folder — especially
> §1 (how the module system works today) and §3 (locked decisions).
>
> **Outcome:** internal refactors that unblock everything later, with **zero
> user-visible behavior change**, plus a hard go/no-go answer on the one real
> technical unknown (runtime `import()` of downloaded code on real devices).
>
> **You can ship this phase as a normal app release.** Nothing in it is risky
> to users.

## Goals

1. Remove `@vitejs/plugin-legacy` (it would break the runtime loader later). - DONE
2. Create the `packages/mod-types` workspace package — the single source of
  truth for all mod-related types (later published to npm for mod authors).
3. Introduce `ModRegistry` — a runtime registry object that wraps today's
  static module `Map`, so all consumers stop touching the `Map` directly.
4. Move each module's `config` out of code (`src/config.ts`) into its
  `manifest.json` (it is already pure data).
5. **Spike:** prove blob-URL `import()` + the FateSDK-shim pattern on a real
  iOS device and an Android emulator. This gates the whole project.

Recommended order: Step 5 (the spike) can run **in parallel** with everything
else — do it first if you want certainty before investing in the refactors.

---



## Step 1 — Remove `@vitejs/plugin-legacy`



### Why

`vite.config.mts` currently applies `legacy({ targets: ['defaults', 'ie >= 11'] })`.
The legacy plugin does two harmful things for this project:

- It transforms dynamic `import()` calls into **SystemJS** loader calls in the
legacy build. The Modules 2.0 loader (Phase 2) relies on *native* dynamic
`import()` of blob URLs — SystemJS cannot load those.
- It doubles build output (modern + legacy chunks + polyfills) to support
browsers (IE 11!) that cannot run this app anyway. Every Capacitor WebView
(iOS WKWebView, Android System WebView) is evergreen, and the PWA targets
modern browsers.



### How

1. In `vite.config.mts`: delete the `legacy(...)` entry from `plugins` and the
  `import legacy from '@vitejs/plugin-legacy'` line.
2. `pnpm remove @vitejs/plugin-legacy` (also removes `terser` if it was only
  there for legacy — check `pnpm why terser` first).
3. Verify: `pnpm build` — the `dist/` output should no longer contain
  `*-legacy-*.js` chunks or `polyfills-legacy`.
4. Smoke-test the built app: `pnpm build && npx vite preview`, open in a
  browser, create a character, roll dice. Then `pnpm build:ios` /
   `pnpm build:android` and launch on a simulator/emulator once.



### Definition of done

`dist/` has no legacy chunks; app works on web, iOS simulator, Android emulator.

---



## Step 2 — Create `packages/mod-types`



### Why

Today, mod-related types live in two places and are only usable from inside
this repo:

- `src/types.ts` — `Character`, `FateContext`, `FateConstants`, `FateShared`,
`FateTemplates`, `FatePatch`, `CharacterModules` …
- `src/modules/utils/types.ts` — `FateModuleManifest`, `FateModuleComponent`,
`FateModuleConfig` (+ option/group/field types), `ModuleResolutionResult`,
`ModuleResolutionIssue`, `ModulesUpdateInstruction` …

External mod authors (Phase 4) need these types from **npm**, and the app must
use the *same* types to guarantee zero drift (decision D7). A pnpm workspace
package inside this repo, later published as `@fate-app/mod-types`, gives both.

### How

1. `pnpm-workspace.yaml` already exists at the repo root. Add the packages dir
  to it if not already covered:
2. Create the package:
  ```
   packages/mod-types/
     package.json
     tsconfig.json
     src/
       index.ts          # re-exports everything below
       character.ts      # Character, CharacterModules, FatePatch
       context.ts        # FateContext, FateConstants, FateShared, FateTemplates
       manifest.ts       # FateModuleManifest, FateModuleComponent, config types
       bundle.ts         # NEW: FateModBundle, capability types, defineFateMod
       resolution.ts     # ModuleResolutionResult, ModuleResolutionIssue, ...
  ```
   `package.json` essentials:
   (Building `.d.ts` output for npm publishing is a Phase 4 concern; inside
   the workspace, TypeScript consumes the source directly.)
3. **Move** (not copy) the type definitions from `src/types.ts` and
  `src/modules/utils/types.ts` into the package, then turn the old files into
   re-exports so nothing else in the app changes:
   ⚠️ **Careful with declaration merging.** All 9 modules currently do
   `declare module '@/types' { interface Character { ... } }`. Declaration
   merging targets a *module specifier as written*. Since modules augment
   `'@/types'`, and `src/types.ts` still exists and re-exports the interfaces,
   **the augmentations keep working only if the interfaces are re-exported,
   not re-declared** — TS merges onto the origin. Verify with `pnpm build`
   (which runs `vue-tsc`): if augmentation breaks, the pragmatic Phase-0 fix
   is to keep `Character`/`FateConstants`/`FateShared`/`FateTemplates`
   *defined* in `src/types.ts` and have `packages/mod-types` re-export *from
   the app* temporarily, inverting the direction in Phase 1 when the modules'
   `declare module` blocks are deleted anyway. Choose whichever direction
   compiles; the end state after Phase 1 is: types defined in the package,
   app re-exports.
   **Resolved (2026-07-24):** the package-first direction (`Character` etc.
   physically defined in `packages/mod-types`, `src/types.ts` doing
   `export * from '@fate-app/mod-types'`) compiled clean on the first try —
   `pnpm build` (vue-tsc + vite build) passed with zero errors, and all 9
   modules' `declare module '@/types'` augmentations kept merging correctly.
   No fallback needed; this is already the Phase-1 end state, so nothing to
   invert later. TypeScript 6.0.3 with `moduleResolution: "bundler"` handles
   `declare module` augmentation through an `export *` barrel without issue.
4. Add the app dependency: in root `package.json`
  `"@fate-app/mod-types": "workspace:*"`, then `pnpm install`.
5. Add the **new** types in `packages/mod-types/src/bundle.ts` (used from
  Phase 1 onward):
   Also add the typed accessor that replaces declaration-merged character
   fields for external mods (decision D8):
6. Extend the manifest type with the new 2.0 fields (all optional for now so
  1.x manifests still typecheck): `sdk?: string`, `entry?: string`,
   `capabilities?: FateModCapability[]`.



### Definition of done

`pnpm build` (vue-tsc) green; `pnpm test:unit` green; no runtime change.

---



## Step 3 — Introduce `ModRegistry`



### Why

`src/modules/index.ts` exports a bare `Map` that ~4 call sites read directly
(`getModules.ts`, `useModuleSelection.ts`, `CharacterConfiguration.vue`,
`updateModules.ts`). In 2.0, mods come from three sources (built-in,
downloaded, dev server) and have runtime **status** (loaded / errored /
disabled). Wrapping the Map now — while behavior is still identical — means
Phases 1–3 only touch the registry internals, not the call sites.

### How

1. Create `src/mods/modRegistry.ts`:
  ```ts
   import type { FateModuleManifest } from '@fate-app/mod-types'

   export type ModSource = 'builtin' | 'registry' | 'url' | 'dev'
   export type ModStatus = 'loaded' | 'errored' | 'disabled'

   export interface ModRecord {
     manifest: FateModuleManifest   // for built-ins this is the full merged module
     source: ModSource
     status: ModStatus
     error?: string                 // present when status === 'errored'
   }

   const records = new Map<string, ModRecord>()

   export const ModRegistry = {
     register(record: ModRecord): void { records.set(record.manifest.id, record) },
     get(id: string): ModRecord | undefined { return records.get(id) },
     /** Only mods usable for resolution/installation */
     getLoadedManifests(): Map<string, FateModuleManifest> {
       return new Map([...records].filter(([, r]) => r.status === 'loaded').map(([id, r]) => [id, r.manifest]))
     },
     getAll(): ModRecord[] { return [...records.values()] },
     remove(id: string): void { records.delete(id) },
   }
  ```
   Keep it a plain module-level singleton (like the current `Map`), **not** a
   Pinia store: it must be usable before the app mounts and from non-component
   code. (UI that needs reactivity over it can be layered in Phase 2/3.)
2. Change `src/modules/index.ts` to register the 9 static imports into
  `ModRegistry` with `source: 'builtin', status: 'loaded'`, and export
   `ModRegistry.getLoadedManifests()` under the old default export shape so
   existing imports keep compiling — or better, update the call sites now:
  - `src/modules/utils/getModules.ts` → look up via `ModRegistry`
  - `src/composables/useModuleSelection.ts` → iterate `ModRegistry.getAll()`
  - `src/modules/utils/updateModules.ts` → same lookup swap
  - `src/components/CharacterCreate/CharacterConfiguration.vue` → via the composable
   **Done (2026-07-24):** implemented as "update the call sites now" — chose
   this over the shim-export option since the DoD requires zero direct `Map`
   consumers anyway. Also updated `src/utils/helpers/getCoreModulesConfig.ts`,
   a direct `Modules.values()` consumer not listed above but caught by grep.
   `useModuleSelection.ts` kept its existing `Map<string, FateModuleManifest>`
   parameter signature unchanged (still dependency-injected, just now fed
   `ModRegistry.getLoadedManifests()` by its one caller) rather than reaching
   into the registry itself — smaller diff, same effect. Registration-trigger
   choice: a single side-effect `import '@/modules'` was added to the top of
   `src/main.ts` (not repeated per call site, not inside `modRegistry.ts`
   itself) — smallest step toward the Phase-2 `initMods()` shape and keeps
   the registry generic.
3. Make sure registration happens on import (module side-effect) so ordering
  stays identical to today. In Phase 2, `initMods()` takes over explicit
   ordering in `main.ts`.



### Definition of done

All call sites go through `ModRegistry`; `src/modules/index.ts` no longer
exports a raw `Map`; app behaves identically (run the Cypress suite:
`pnpm test:e2e`).

---



## Step 4 — Move `config` into `manifest.json`



### Why

A module's settings schema (`FateModuleConfig` — groups + options of type
`number | string | boolean | select | range | custom-list`) is **pure data**,
but currently lives in code (`src/modules/<id>/src/config.ts`) and is merged
in `index.ts`. In 2.0, the Mod Store must show and validate a mod's config
**without executing its bundle** — so config belongs in `manifest.json`
(the never-executed half).

### How

For each of the 9 modules (`sonder@core-identity`, `sonder@core-aspects`,
`sonder@core-skills`, `sonder@core-stunts`, `sonder@core-stress`,
`sonder@core-consequences`, `sonder@core-tokens`, `sonder@notebook`,
`sonder@inventory`):

1. Serialize the object from `src/config.ts` into a `"config"` key in the
  module's `manifest.json`. Most are empty (`{ "groups": [], "options": [] }`);
   `sonder@core-skills` is the big one (custom-list + per-skill booleans) —
   translate it carefully, keeping the `t.`-prefixed strings exactly as they
   are (`signRecord` already walks nested objects/arrays and signs any string
   starting with `t.`, so config strings namespace correctly with no extra work).
2. Delete `src/config.ts` and its import/spread in the module's `index.ts`
  (the manifest spread now carries `config`).
3. Watch for non-JSON values in configs (functions, `undefined`, imported
  icons). If any exist, they must move to the bundle side or be re-expressed
   as data (e.g. icon *names* resolved by the app). Record any such change in
   this file.



### Definition of done

No module has `src/config.ts`; character creation/configuration UI shows
identical options (manually verify `sonder@core-skills` config UI end-to-end:
create → configure → reconfigure); `pnpm test` green.

**Done (2026-07-24):** every module's `config.ts` already called `signRecord`
before exporting, so the final signed object was baked into `manifest.json`
verbatim (generated via a throwaway vitest dump, not hand-transcribed, to
avoid errors in `sonder@core-skills`'s 19 groups / 91 options). The existing
`...signRecord(manifest, manifest.id)` spread in `index.ts` re-signs the new
`config` subtree at runtime as a guaranteed no-op (already-signed strings
don't start with `t.`). One additional fix was needed beyond the doc: TS's
`resolveJsonModule` widens `"type": "boolean"` in JSON to plain `string`,
which fails structural assignment against `FateModuleConfigOption`'s literal
union when a manifest is declared as `const x: FateModuleManifest = {...}`.
The 7 modules already using the `export default {...} as FateModuleManifest`
assertion pattern were unaffected (assertions are laxer than declared-type
assignment); `sonder@core-skills` and `sonder@core-stress` were the two
modules using the stricter `const MODULE: FateModuleManifest = {...}` form
and were switched to the same `as FateModuleManifest` pattern as the rest.
Manually verified in-browser: `sonder@core-stress` (2 toggles),
`sonder@core-tokens` (max-tokens default 9), and `sonder@core-skills`
(19 groups, Athletics sub-options matching `skills.ts` usage data exactly)
all render identically to before; full character creation + skill list also
verified with zero console errors. Cypress suite (14/14) green throughout.

---



## Step 5 — THE SPIKE: runtime import of downloaded code on-device



### Why

Decisions D1 and D2 assume: *a JS string can be imported as an ESM module via
a blob URL inside iOS WKWebView (under the* `capacitor://` *custom scheme) and
Android WebView, and that module can render a Vue component using the host's
Vue via a* `globalThis.FateSDK` *shim.* This is very likely true — but **the
whole project stands on it**, so prove it before Phase 2.

### How

1. Build a throwaway test surface (e.g. a hidden route `/dev/spike` or a
  temporary button on the settings page — don't merge it to main, keep it on
   a branch).
2. Host-side setup in the spike page:
  ```ts
   import * as vue from 'vue'
   ;(globalThis as any).FateSDK = { vue }
  ```
3. Simulate a "downloaded" mod — a precompiled component as a plain string.
  For the spike, hand-write it in compiled form (this is what the SDK build
   preset will emit in Phase 2):
   Render it with `<component :is="spikeComponent" />` and click the button —
   the counter incrementing proves both the import **and** shared-Vue
   reactivity across the boundary.

Test matrix — record results in the table below:


| Environment                             | import() of blob URL works | Component reactive | Notes                                                |
| --------------------------------------- | -------------------------- | ------------------ | ---------------------------------------------------- |
| Web dev server (Chrome)                 |                            |                    |                                                      |
| Web prod build (`vite preview`)         |                            |                    | check PWA service worker doesn't interfere           |
| Android emulator (`pnpm build:android`) |                            |                    |                                                      |
| **iOS real device** (`pnpm build:ios`)  |                            |                    | the critical one — `capacitor://` scheme + WKWebView |
| iOS simulator                           |                            |                    |                                                      |


1. Additional checks while you're in there:
  - `await import()` of a **second** blob module that itself `import`s… — not
   needed: the SDK preset produces *single-file* bundles precisely so
   cross-module ESM resolution never happens at runtime. Confirm the
   single-file assumption is written into Phase 2.
  - Verify `crypto.subtle.digest('SHA-256', ...)` works in all environments
  (WebCrypto requires a secure context; `capacitor://` and `https://` are
  secure, plain `http://` dev URLs on LAN are **not** — note for Phase 2
  dev mode: hash verification is skipped for dev-mode mods).
  - Measure: time to import a ~500 KB string on the oldest device you support.
2. **If iOS fails** (blob import blocked): fallback = write the code to a file
  with `@capacitor/filesystem`, convert with
   `Capacitor.convertFileSrc(fileUri)`, and `import(/* @vite-ignore */ src)`
   that URL (it is served by Capacitor's internal scheme handler with a JS
   MIME type). Test the same matrix. If *that* also fails, last resort is
   `new Function` over an IIFE-format bundle (change the SDK preset output
   format) — works everywhere but loses native ESM semantics. Update decision
   D1 in README.md with whichever mechanism won, and why.



### Definition of done

The matrix above is filled in with evidence (screenshots/notes committed to
this folder as `phase-0-spike-results.md`), and D1/D2 in README.md are either
confirmed or amended. **Do not start Phase 2 without this.**

---



## Phase 0 exit checklist

- [x] `@vitejs/plugin-legacy` removed; no legacy chunks in `dist/`
- [x] `packages/mod-types` exists; app compiles against it
- [x] `FateModBundle`, `defineFateMod`, `getModData`, capability types defined
- [x] Manifest type has optional `sdk`, `entry`, `capabilities`
- [x] `ModRegistry` in place; no direct consumers of the old static `Map`
- [x] All 9 modules: `config` lives in `manifest.json`, `src/config.ts` deleted
- [x] Spike results recorded; go/no-go decision documented — **Go for Phase 2**.
      Blob-URL `import()` and shared-Vue reactivity via `globalThis.FateSDK`
      confirmed working on web (dev server + prod build), iOS simulator, a
      real iOS device, and Android emulator (2026-07-25, see
      `phase-0-spike-results.md`). The spike shipped in-app temporarily,
      gated behind debug mode (`src/views/dev/SpikePage.vue`, Settings →
      tap version 5x), rather than living only on a throwaway branch — then
      **removed once Phase 2 shipped the real loader** (`src/mods/loader.ts`,
      `importBlobModule.ts`), which supersedes what the spike proved by hand.
      Debug mode itself stayed (now a persistent Settings → Developer →
      "Show debug information" toggle, not the tap-version-5x gesture) since
      it gates unrelated features (the dice physics debug renderer).
- [x] `pnpm build && pnpm lint && pnpm test` green (2026-07-24, branch
      `2.0.0`, commits `a5494cd`/`83933cf`/`29aae72`: 109 unit tests + 14
      Cypress specs)
- [x] App manually smoke-tested on web + native platforms — web
      (`vite preview` + live browser walkthrough of character creation, all
      9 modules' config UIs) and, via the spike, iOS simulator/real device
      and Android emulator

