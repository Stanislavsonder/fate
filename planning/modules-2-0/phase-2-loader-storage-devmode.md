# Phase 2 — Runtime Loader, Storage, FateSDK & Developer Mode

> **Prerequisites:** Phases 0–1 complete; **spike results from Phase 0 confirmed
> blob-URL `import()` works on iOS + Android** (or the fallback mechanism was
> adopted and D1 in README.md updated).
>
> **Outcome:** the app can install, persist, load, update, disable, and remove
> **external mod bundles at runtime**. There is no public registry yet (that's
> Phase 3) — installation happens via URL (behind Developer Mode) — but the
> entire loading machinery, the `FateSDK` host API, the storage layer, the
> quarantine system, and the author-side build preset (`@fate-app/mod-build`)
> are done and proven with a real external test mod.
>
> **This phase alone unlocks mod-author DX**: an author can build a mod and
> test it live in the real app.

## Architecture recap (what gets built here)

```
main.ts
 ├─ installFateSDK()                     // Step 1
 ├─ await initMods()                     // Step 3
 │    ├─ registerBuiltinMods()           // from Phase 1
 │    └─ for each enabled row in Dexie 'mods':
 │         sha256 check → blob import → shape validation
 │         → assembleMod(manifest, bundle) → registerModTranslations
 │         → ModRegistry.register({source, status:'loaded'})
 │         (throw anywhere → register {status:'errored', error} — quarantine)
 └─ app.mount('#app')
```

New files: `src/mods/sdk.ts`, `src/mods/loader.ts`, `src/mods/installService.ts`,
`src/mods/devMode.ts`, `src/db/tables/mods.ts`.
New repo (or folder, see Step 6): the `@fate-app/mod-build` Vite preset + test mod.

---

## Step 1 — `window.FateSDK` (the host API / ABI)

### Why

An external bundle must use the **host's** Vue instance — a second Vue copy
breaks reactivity, `provide/inject`, and component context. Decision D2: the
host exposes shared libraries on a global, and mod bundles are compiled so
their `import { ref } from 'vue'` statements resolve to shims reading that
global (Step 6). The same object carries curated app APIs, and its version is
the **ABI version** that manifests gate on via their `sdk` semver range.

### How

```ts
// src/mods/sdk.ts
import * as vue from 'vue'
import * as vueI18n from 'vue-i18n'
import * as ionicVue from '@ionic/vue'
import * as ionicons from 'ionicons/icons'
import { showErrorToast, showSuccessToast } from '@/utils/helpers/toast'
import { getModData } from '@fate-app/mod-types'

/** ABI version. Bump per docs/MOD_API.md rules (Step 8). */
export const SDK_VERSION = '1.0.0'

export function installFateSDK(): void {
  ;(globalThis as any).FateSDK = Object.freeze({
    version: SDK_VERSION,
    vue,
    vueI18n,
    ionicVue,
    ionicons,
    api: Object.freeze({
      toast: { error: showErrorToast, success: showSuccessToast },
      getModData,
      // deliberately small at v1 — extending is a minor bump; removing is major
    }),
  })
}
```

Call `installFateSDK()` first thing in `main.ts` (before `initMods()`).

**Scope discipline:** every property added here is frozen ABI you must support
for years. Start minimal. `three`/`cannon-es` are *not* exposed in v1 — they
join under the `dice` capability in Phase 4 (marked experimental).
Note that mods also implicitly depend on Ionic **CSS variables** and the
Ionic components' behavior — that's part of the contract documented in Step 8.

---

## Step 2 — Dexie schema v2 (storage)

### Why

Installed external mods must survive restarts and work offline. Decision D4:
bundle code lives in IndexedDB as text.

### Today

`src/db/tables/character.ts`: `Dexie('CharactersDatabase')`, **version 1**,
single table declared as
`characters: '++id, _modules, _version, name, race, avatar, tokens, description, aspects, skills, stunts, stress, consequences, inventory'`.
(Everything after `++id` is an *index* declaration — Dexie stores whole
objects regardless; indexing large sub-objects is wasteful.)

### How

1. Add version 2 with the new tables and a slimmed characters index
   (Dexie migrates indexes automatically; **never** remove version(1)):

   ```ts
   db.version(2).stores({
     characters: '++id, name, _version',   // whole object still stored; only useful indexes kept
     mods: 'id, source, enabled',          // primary key = mod id (one installed version per mod)
     kv: 'key',                            // registry index cache (Phase 3), misc metadata
   })
   ```

2. Row shape (add to types near db code):

   ```ts
   interface StoredMod {
     id: string                 // "author@name"
     version: string
     source: 'registry' | 'url' | 'dev'
     enabled: boolean           // user toggle — disabled mods are not loaded but keep their data
     manifestJson: string       // the static manifest exactly as fetched
     bundleCode: string         // full text of bundle.mjs
     translationsJson: string   // { [lang]: messages } as fetched
     sha256: string             // hash of bundleCode (pinned from registry in Phase 3; computed at install for 'url')
     sourceUrl: string          // where it came from (registry artifact URL or user URL)
     installedAt: number
     updatedAt: number
   }
   ```

3. Create `src/db/tables/mods.ts` following the existing
   `character.service.ts` / table pattern, with a small `ModsService`:
   `getAllEnabled()`, `get(id)`, `put(row)`, `delete(id)`, `setEnabled(id, v)`.

4. Migration safety: version(2) with no `upgrade()` callback is fine here
   (no data transforms — only new tables and index changes). Test: open the
   app with a pre-existing v1 database (create characters on the main branch
   first, then switch to this branch) — characters intact.

---

## Step 3 — The loader (`src/mods/loader.ts`)

The heart of the system. Requirements: **runs before mount, never throws
outward, quarantines every failure.**

```ts
import { ModRegistry } from './modRegistry'
import { assembleMod } from './assembleMod'
import { registerModTranslations } from './registerModTranslations'
import { registerBuiltinMods } from './builtins'
import { modsService } from '@/db/tables/mods'
import semverSatisfies from 'semver/functions/satisfies'
import { SDK_VERSION } from './sdk'

export async function initMods(): Promise<void> {
  registerBuiltinMods()                      // built-ins first: sheet can never be blank
  let rows = []
  try { rows = await modsService.getAllEnabled() } catch (e) { console.error('[mods] db read failed', e); return }
  for (const row of rows) {
    try {
      ModRegistry.register({ manifest: await loadExternalMod(row), source: row.source, status: 'loaded' })
    } catch (e) {
      console.error(`[mods] failed to load ${row.id}`, e)
      ModRegistry.register({
        manifest: safeManifest(row),         // parse manifestJson defensively; fall back to {id, version} stub
        source: row.source, status: 'errored', error: String(e),
      })
    }
  }
}

async function loadExternalMod(row: StoredMod) {
  const manifest = JSON.parse(row.manifestJson)

  // 1. ABI gate — refuse before executing anything
  if (manifest.sdk && !semverSatisfies(SDK_VERSION, manifest.sdk))
    throw new Error(`requires mod-API ${manifest.sdk}, app provides ${SDK_VERSION}`)

  // 2. Integrity — recompute hash of the code we are about to run
  if (row.source !== 'dev') {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(row.bundleCode))
    const hex = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
    if (hex !== row.sha256) throw new Error('bundle hash mismatch — possible tampering, refusing to load')
  }

  // 3. Import (decision D1)
  const url = URL.createObjectURL(new Blob([row.bundleCode], { type: 'text/javascript' }))
  let bundle
  try { bundle = (await import(/* @vite-ignore */ url)).default }
  finally { URL.revokeObjectURL(url) }

  // 4. Shape validation — cheap structural checks before anything trusts it
  validateBundleShape(bundle, manifest.capabilities)   // throws descriptive errors

  // 5. Assemble exactly like built-ins (Phase 1 shared code) + translations
  registerModTranslations(manifest.id, JSON.parse(row.translationsJson || '{}'))
  return assembleMod(manifest, bundle)
}
```

Notes:

- `validateBundleShape`: default export is an object; `components` (if
  declared capability `sheetComponents`) is an array of
  `{ id: string, component: object|function, order: number }`; lifecycle
  properties, if present, are functions; `patches` entries have semver
  `version` + function `action`. Wrap components in `markRaw` here (built-ins
  get that in `installModules`; doing it at load for externals too is harmless
  and defensive).
- **Sequential, not parallel** loading: ordering is deterministic and mods are
  few; parallelize later only if startup metrics demand it.
- `main.ts` change:

  ```ts
  installFateSDK()
  initMods().finally(() => router.isReady().then(() => app.mount('#app')))
  ```

  `.finally` — even a catastrophic loader failure still mounts the app with
  built-ins only (cross-phase rule 3).

### Quarantine UX

`resolveModules`/`useModuleSelection` only ever see
`ModRegistry.getLoadedManifests()`, so errored mods are invisible to
resolution automatically. Surface them to the user:

- The mod management UI (Step 5) lists errored mods with the stored `error`
  string and actions: **Retry** (re-run `loadExternalMod`), **Disable**,
  **Remove**.
- If a character references an errored/disabled mod id, `resolveModules`
  reports it as `missing-dependency` today — acceptable for this phase;
  Phase 3 adds the friendlier `mod-not-installed` issue + store link.

---

## Step 4 — Install service (`src/mods/installService.ts`)

Operations (all return typed results, never throw to UI):

- **`installFromUrl(baseUrl)`** — this phase's only entry point (Phase 3 adds
  `installFromRegistry`). Flow:
  1. Fetch `${baseUrl}/manifest.json`; JSON-parse; validate against the
     manifest schema (schema file created in Phase 3 — for now, structural
     TS-side checks).
  2. Fetch `${baseUrl}/${manifest.entry}` (bundle text) and
     `${baseUrl}/translations/<lang>.json` for each `manifest.languages`
     (missing files tolerated).
  3. Compute sha256 of bundle text (WebCrypto — see the secure-context caveat
     in Step 7) — for `url` installs this is *trust-on-first-use* tamper
     detection, not provenance.
  4. Duplicate id check: refuse if id is a built-in or already installed
     (offer update instead).
  5. `modsService.put(row)` → `loadExternalMod(row)` → register. If load
     fails, delete the row and report the error (never persist an
     unloadable install).
- **`update(id, baseUrl?)`** — refetch, replace row, reload. If the mod is in
  use by characters, the existing per-character `updateModules`/patches
  machinery handles data migration on next character open — that's already
  built (Phase 1 verified it).
- **`remove(id)`** — guard: query all characters (`character.service.ts`) for
  `_modules[id]`; if referenced, list affected character names and require
  the user to uninstall it from them first (per-character uninstall = existing
  `changeCharacterModules` flow), or offer "uninstall everywhere then remove"
  which loops that flow. Then delete the Dexie row + `ModRegistry.remove(id)`.
- **`setEnabled(id, enabled)`** — flips the row; takes effect next launch
  (offer in-place load on enable — it's just `loadExternalMod` + register).

**Install-from-URL warning UX** (decision D10): before step 1 runs, a modal
must state: *"You are installing code from outside the reviewed registry. It
will run with full access to the app and your character data. Only proceed if
you trust the source."* with a typed confirmation (user types the mod id or
"install"). Gate the whole feature behind **Developer Mode** in Settings for
this phase; Phase 3 may relax it to a power-user setting.

---

## Step 5 — Minimal management UI

Not the Mod Store (Phase 3) — just enough to operate what Steps 3–4 built.
Follow existing app patterns (Ionic pages under `src/views/settings/`,
routed from the Settings page):

- **Settings → Mods** (`ModsManagePage.vue`): list of external mods from
  `ModRegistry.getAll()` filtered to non-builtin — name (i18n), version,
  source badge (`url`/`dev`), status badge (loaded/errored/disabled), error
  text when errored; actions per row: enable/disable, retry, remove, update.
  **Always visible from Settings, not gated behind Developer Mode** —
  installed mods are app-wide state a user should be able to manage
  regardless of how they got there (a first pass nested this under
  Settings → Developer Mode with a link; corrected to a top-level Settings
  entry, matching what this step originally specified, once it was pointed
  out that the Developer Mode gate should only cover pulling in *new* code,
  not managing what's already installed).
- **Settings → Developer Mode** toggle (persist in `localStorage`, pattern:
  `useTheme.ts`), revealing: "Install from URL" and "Connect dev mod" (Step 7).
- `CharacterConfiguration.vue`: external loaded mods appear automatically
  (they're in the registry) — verify, and add a small "external" badge.

---

## Step 6 — `@fate-app/mod-build` (author-side build preset) + test mod

### Why

Authors write normal Vue SFC + TS projects; this package compiles them into
the single-file `bundle.mjs` the loader expects — with the host's libraries
externalized to `FateSDK` shims (decision D2), CSS inlined (D9), and the same
Vue compile-time flags as the host.

### Where

Decision: develop it inside this repo as `packages/mod-build/` (workspace),
publish to npm in Phase 4. Same for the test mod: `packages/example-mod/`
(never published; it's the integration fixture).

### How it works

`defineModConfig()` returns a Vite config:

```ts
// packages/mod-build/src/index.ts — the essence
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

const EXTERNALS: Record<string, string> = {
  'vue': 'FateSDK.vue',
  'vue-i18n': 'FateSDK.vueI18n',
  '@ionic/vue': 'FateSDK.ionicVue',
  'ionicons/icons': 'FateSDK.ionicons',
}

export function defineModConfig() {
  return defineConfig({
    plugins: [vue(), fateSdkShims(EXTERNALS), cssInjectPlugin(), manifestChecks()],
    define: {
      'process.env.NODE_ENV': '"production"',
      __VUE_OPTIONS_API__: 'true',            // must match the HOST build's flags
      __VUE_PROD_DEVTOOLS__: 'false',
      __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false',
    },
    build: {
      lib: { entry: 'bundle.ts', formats: ['es'], fileName: () => 'bundle.mjs' },
      rollupOptions: {
        external: Object.keys(EXTERNALS),
        output: { inlineDynamicImports: true },   // single file, always
      },
      cssCodeSplit: false,
      assetsInlineLimit: 1024 * 1024,             // small assets → base64 data URIs
    },
  })
}
```

- **`fateSdkShims`**: a resolve plugin mapping each external id to a virtual
  module like `const m = globalThis.FateSDK.vue; export const ref = m.ref;
  export const computed = m.computed; ...` — **explicit named re-exports**
  (`export default globalThis.FateSDK.vue` alone breaks named imports).
  Generate the export lists from the host's actual dependency
  (`Object.keys(await import('vue'))` at preset build time) and pin them per
  SDK version. Alternative: rollup `output.globals` + `format:'iife'` — but
  ESM + shims keeps native `import()` loading; stick with shims.
- **`cssInjectPlugin`**: takes the emitted CSS chunk and prepends to the JS:
  `(d=>{const s=d.createElement('style');s.dataset.modId=ID;s.textContent=CSS;d.head.append(s)})(document)`.
  (Prior art exists — `vite-plugin-css-injected-by-js`; using it as a
  dependency is fine.)
- **`manifestChecks`**: validates `manifest.json` presence/shape and bundle
  size (warn > 1 MB, error > 3 MB) at build end.
- **Dev server for live reload**: `fate-mod-build dev` = `vite build --watch`
  + a tiny static server (e.g. port 5199) serving the output dir with CORS
  `*` and an SSE endpoint `/events` that pings on every rebuild.

### The test mod (`packages/example-mod/`)

A real, non-trivial fixture — this is the acceptance test for the whole phase:

```
packages/example-mod/
  manifest.json        # id "sonder@example", capabilities ["sheetComponents"],
                       # sdk "^1.0.0", a config option or two, dependencies: {} 
  bundle.ts            # defineFateMod({ components, onInstall, onUninstall, ... })
  src/ExampleSection.vue   # uses: v-model character, inject('context'),
                           # an Ionic component, its own scoped CSS, an i18n key
  translations/en.json
  vite.config.ts       # export default defineModConfig()
```

It must exercise: reading/writing its own character data via `getModData`,
translations, config rendering, install/uninstall symmetry, and CSS injection.

---

## Step 7 — Developer Mode live reload (`src/mods/devMode.ts`)

The author loop: `fate-mod-build dev` on the laptop → app (device or browser)
connects → edit code → mod reloads in the open character sheet in ~1s.

Flow:

1. Settings → Developer Mode → "Connect dev mod": input URL
   (e.g. `http://192.168.1.20:5199`).
2. App fetches manifest+bundle+translations from it (same code path as
   `installFromUrl` but `source:'dev'`, **no hash check** — see below), loads
   and registers it.
3. App opens an `EventSource` to `<url>/events`; on each rebuild ping:
   - if a character using the mod is open: run the existing per-character
     uninstall (`changeCharacterModules` remove) → refetch → reload bundle
     via a **fresh blob URL** → reinstall → the sheet re-renders.
     (Hot-reimport, not HMR — old module objects are simply abandoned; a small
     memory leak per reload is acceptable in dev.)
   - i18n: `mergeLocaleMessage` merges over the old keys — stale deleted keys
     linger until app restart; acceptable, note it in author docs.
4. Dev rows are not persisted as enabled across restarts (or are auto-retried
   silently and dropped if unreachable) — a dead dev server must not produce
   scary quarantine errors a week later.

**Platform caveats (write these into the author docs):**

- WebCrypto (`crypto.subtle`) is unavailable on insecure origins; dev-mode
  URLs are plain `http://` LAN — hence hash-skip for `source:'dev'`.
- iOS device → laptop LAN http: needs an ATS exception
  (`NSAllowsLocalNetworking` — check `ios/App/App/Info.plist`) — document,
  don't hardcode into the shipped plist beyond what local networking needs.
- Android device: `adb reverse tcp:5199 tcp:5199` avoids cleartext/IP issues
  by making it `http://localhost:5199`; Android may still need
  `android:usesCleartextTraffic` for LAN IPs — prefer `adb reverse`.
- Web dev/preview: plain fetch — CORS `*` on the dev server covers it.

---

## Step 8 — The ABI contract document (`docs/MOD_API.md`)

Write it now, while surface area is small. Contents:

1. **What a mod may rely on**: everything on `window.FateSDK` (enumerate),
   all types in `@fate-app/mod-types`, the `FateContext` provide/inject
   contract, Ionic components (via `FateSDK.ionicVue`) and Ionic CSS
   variables, the lifecycle guarantees (when onInstall/onUninstall/
   onReconfigure/patches run — describe the existing 1.x semantics).
2. **What a mod must NOT rely on**: Tailwind classes (D9 — the app's JIT
   never sees mod source; mods ship their own CSS), app-internal imports
   (nothing under `@/` exists at runtime for a mod), DOM structure outside
   the mod's own components, network availability.
3. **Versioning rules**: `SDK_VERSION` major = anything removed/changed
   incompatibly (incl. Vue/Ionic major upgrades); minor = additions.
   Manifests declare `sdk: "^1.0.0"`; the loader refuses on mismatch
   (Step 3.1) with an "update the app / check for mod update" message.
4. **Manifest reference** — every field, with the browsable-vs-executable
   split explained.

---

## Phase 2 verification (acceptance)

Unit tests (`src/tests/unit/mods/`):
- loader: hash mismatch → quarantined; bad export shape → quarantined with
  descriptive error; sdk-range mismatch → quarantined **without** executing
  the bundle; happy path registers and merges translations.
- installService: duplicate id refusal; failed load rolls back the Dexie row;
  remove-guard when a character references the mod.
- Dexie v1→v2 upgrade (dexie can run in tests via fake-indexeddb).

Integration (the real proof):
1. `pnpm --filter example-mod build` → serve `dist/` locally → in-app
   install-from-URL → mod appears in `CharacterConfiguration.vue` → add to a
   character → section renders, config works, data persists, translations
   resolve, CSS applies, dark/light theme respected.
2. Kill the network → relaunch app → mod still loads from Dexie (offline).
3. Corrupt `bundleCode` in IndexedDB manually (devtools) → relaunch →
   quarantined with hash error; app + built-ins unaffected; Retry after fixing.
4. Dev mode loop on: web, Android emulator (`adb reverse`), iOS device —
   edit `ExampleSection.vue`, see it live-reload.
5. Uninstall mod from character → remove mod → character opens with a clean
   resolution issue, no crash.
6. Cypress: script flow 1 headlessly against a static fixture server.

## Phase 2 exit checklist

- [x] `FateSDK` installed & frozen; `SDK_VERSION = 1.0.0`; `docs/MOD_API.md` written
- [x] Dexie v2 migration safe on existing installs — verified via a `fake-indexeddb`
      test that writes a real v1-only database first, then opens the app's actual
      (v1+v2) `db` against it and confirms existing character data survives untouched
      and the new `mods`/`kv` tables exist (`src/tests/unit/db/database.test.ts`)
- [x] `initMods()` in `main.ts`; failure of any/every external mod still mounts the app
- [x] Quarantine visible & actionable in Settings → Mods (`ModsManagePage.vue`:
      enable/disable/retry/update/remove per row, error text shown for `errored` mods)
- [x] Install-from-URL behind Developer Mode with typed-confirmation warning
      (`alertController`-based — `confirmInstallFromUrl` in
      `src/utils/helpers/dialog.ts`; `@capacitor/dialog`'s `Dialog.confirm`,
      used for other confirms, has no text-input support)
- [x] `packages/mod-build` preset produces working single-file bundles — verified by
      inspecting the real emitted `dist/bundle.mjs` byte-for-byte, not just a
      successful exit code
- [ ] `packages/example-mod` passes the full integration list above on web + iOS + Android.
      **What was verified**: the built bundle loads correctly through the REAL
      (unmocked) loader pipeline — ABI gate, shape validation, `assembleMod`,
      translation merging, `onInstall`/`onUninstall` touching real character/context
      objects — via `src/tests/unit/mods/integration.exampleMod.test.ts`, which reads
      `packages/example-mod`'s actual `manifest.json`/`dist/bundle.mjs`/`translations/en.json`
      off disk. **What could not be verified in this session**: blob-URL `import()`
      itself (Node's module loader does not support importing `blob:` URLs — confirmed
      directly; the integration test substitutes a `data:` URL, which Node does
      support, for that one step) and the full in-app UI flow (install-from-URL through
      the running app, offline reload, corrupted-bundle quarantine via devtools) — no
      Chrome browser extension connection was available in this environment. Blob-URL
      import + shared-Vue reactivity across the mod boundary is exactly what Phase 0's
      spike already proved on web, iOS, and Android
      (`planning/modules-2-0/phase-0-spike-results.md`) — Phase 2 doesn't introduce
      that primitive, only the fetch/storage/registry machinery around it. Manual
      follow-up: run the numbered integration list above for real, on-device.
- [x] Dev-mode live reload works on web — verified end-to-end for real: a spawned
      `vite build --watch` child process, `manifest.json`/`bundle.mjs`/`translations/en.json`
      served with correct `Content-Type`/CORS headers (byte-identical to the built
      files), and a live SSE `/events` subscriber (via `curl`) receiving a
      `data: rebuild` message after editing and saving the mod's source. Two real bugs
      were found and fixed doing this: (1) Vite 8/rolldown-vite's programmatic
      `build({ watch: {} })` API silently corrupted the build (dropped modules, SFC
      parse errors) in a way its own CLI `vite build --watch` does not — fixed by
      spawning the CLI as a child process instead of using the JS API; (2) the
      rebuild-notification `fs.watch` was scoped to `dist/`, which doesn't exist yet
      immediately after a clean checkout/`rm -rf dist` — `fs.watch` on a not-yet-existing
      path never fires for anything created later, so the SSE endpoint went
      permanently silent for the whole session. Fixed by watching the project root
      instead (always exists) and filtering to changes under `dist/`.
      **Not verified**: iOS/Android device caveats (ATS local-networking exception,
      `adb reverse`) — documented in `docs/MOD_API.md` §5 but require physical devices.
- [x] `pnpm build && pnpm lint && pnpm test` green

**Other deviations/fixes found during implementation, beyond the checklist above:**

- `FateSDK.ionicons` (`src/mods/sdk.ts`) is populated **lazily** — `import * as ionicons from 'ionicons/icons'`
  eagerly pulled the full ~800KB icon set into every app boot (confirmed via
  `pnpm build` chunk-size comparison: the eager `router` chunk dropped from
  ~1.99MB to ~1.18MB after the fix), even though almost no user has an external
  mod installed. `loadFullIconset()` dynamically imports it once, only when
  `loadExternalMod` is actually about to run external code — same "don't
  eagerly bundle what nobody's using" reasoning as the Phase 1 dice-mod fix.
- `fateSdkShims` (`packages/mod-build/src/fateSdkShims.ts`) does **not** compute
  export lists via a live `await import('vue')` at build time as originally
  sketched — that resolves Node's `"node"`/CJS-interop condition (a synthetic
  namespace polluted with junk keys like `module.exports`), not the browser ESM
  build the app actually uses. Export lists are pinned as static data
  (`src/sdkExports.ts`, regenerated via `pnpm --filter @fate-app/mod-build
  generate-sdk-exports` — statically parses the real browser ESM entries with
  `es-module-lexer`, following `export * from` re-export chains). Also fixed:
  an earlier version of the shim plugin combined with `rollupOptions.external`
  for the same specifiers — the two are mutually exclusive (`external` leaves a
  literal unresolvable `import ... from "vue"` in the output; the shim plugin
  needs those specifiers *not* external so its virtual modules get bundled
  normally). Confirmed by inspecting the real emitted bundle before and after.
