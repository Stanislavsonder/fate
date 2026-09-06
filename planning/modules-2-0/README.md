# Modules 2.0 — Implementation Guide (Overview)

> **This folder is the master implementation guide for the Modules 2.0 project.**
> Read this file first, then work through the phases in order. Each phase is a
> separate file and each phase is independently shippable — you can pause the
> project after any phase and the app stays fully working.

| Phase | File | Outcome when done |
|---|---|---|
| 0 | [phase-0-groundwork.md](./phase-0-groundwork.md) | Internal refactors + feasibility spike. No user-visible change. |
| 1 | [phase-1-builtins-migration.md](./phase-1-builtins-migration.md) | All 9 built-in modules run through the new 2.0 pipeline. No user-visible change. |
| 2 | [phase-2-loader-storage-devmode.md](./phase-2-loader-storage-devmode.md) | The app can load external mod bundles at runtime (install-from-URL, dev mode, local caching). |
| 3 | [phase-3-registry-store.md](./phase-3-registry-store.md) | Public curated mod registry (GitHub repo + CI) and an in-app Mod Store. **Closed out** — full Cypress coverage, all CI checks, and live-repo verification (a real publish, a real blocklist cycle) done. Only device passes remain (no hardware available). |
| 4 | [phase-4-sdk-extensions.md](./phase-4-sdk-extensions.md) | Published author SDK (scaffolder, build preset, types) + custom dice capability. **Done** — `@fate-core/mod-types`/`mod-build`/`create-fate-mod` all published to npm at `1.1.0`; `fate-core-mods` accepts `dice`/`theme` submissions; `sonder@dice-d6` is a real, live, published dice mod; author docs (`docs/GUIDE.md`) live in the registry repo. |
| 5 | [phase-5-other-improvements.md](./phase-5-other-improvements.md) | Backlog of follow-ups identified along the way (not strictly ordered after Phase 4). Phase 4's registry close-out, the Cypress e2e gap, and the privacy policy accuracy fix are done; open items include npm Trusted Publishing, translating the Modules 2.0 UI strings, and the character list card / identity module redesign now that `avatar` is a core field. |

---

## 1. What this app is (context for someone who has never seen it)

**Assistant for Fate** is a digital character sheet for the Fate tabletop RPG.
It is a single codebase that ships to three targets:

- **Web** (PWA, built with Vite, served statically)
- **iOS** and **Android** — the same web build wrapped in a native shell by
  **Capacitor** (the app runs inside a WebView; `capacitor.config.ts` has
  `webDir: 'dist'`, i.e. the compiled web app is bundled into the native app)

Tech stack (versions as of app v1.3.3):

| Concern | Library |
|---|---|
| UI framework | Vue 3.5 (Composition API, `<script setup>`) |
| UI components | Ionic 8 (`@ionic/vue`) |
| Native wrapper | Capacitor 8 |
| Build | Vite 7 (`vite.config.mts`), TypeScript 5.9, pnpm |
| State | Pinia 3 (`src/store/`) |
| Persistence | Dexie 4 — an IndexedDB wrapper (`src/db/`) |
| i18n | vue-i18n 11, 30 locales (`src/i18n/`) |
| 3D dice | Three.js (render) + cannon-es (physics) (`src/dice/`) |
| Styling | Tailwind 4 + Ionic CSS variables (`src/styles/`) |

The app is **fully offline / local-first**: every character is stored in the
browser's IndexedDB via Dexie; there are **no network calls anywhere in the
app today**. This matters: Modules 2.0 introduces the app's *first* network
subsystem, and everything must keep working offline.

### The module system today (1.x)

The character sheet is not hardcoded — it is assembled from **modules**.
A module contributes a section of the sheet (Aspects, Skills, Stress, an
Inventory, a Notebook…). There are 9 modules, all first-party, in
`src/modules/<author>@<name>/` (e.g. `src/modules/sonder@core-aspects/`).

Each module's `index.ts` exports a `FateModuleManifest`
(type in `src/modules/utils/types.ts`):

```ts
interface FateModuleManifest {
  id: string                       // "sonder@core-aspects"
  name: string                     // i18n key
  version: string                  // semver
  author: { name: string; email?: string; url?: string }
  description: { short: string; full?: string }
  languages: string[]
  tags: string[]
  dependencies?: Record<string, string>  // { moduleId: semverRange }
  incompatibleWith?: string[]
  appVersion?: string              // semver range checked against app version
  loadPriority: number
  components?: FateModuleComponent[]     // { id, component: VueComponent, order }
  constants?: Partial<FateConstants>     // merged into shared context
  templates?: Partial<FateTemplates>
  shared?: Partial<FateShared>
  onInstall(context, character): Promise<void> | void
  onUninstall(context, character): Promise<void> | void
  onReconfigure(context, character): Promise<void> | void
  patches?: FatePatch[]            // versioned character-data migrations
  config?: FateModuleConfig        // declarative settings schema (rendered by app UI)
}
```

Key machinery (all of this is **reused, not rewritten**, in 2.0):

- **Registry (the part 2.0 replaces):** `src/modules/index.ts` statically
  imports all 9 modules into a `Map<string, FateModuleManifest>`. Adding a
  module means editing this file and rebuilding the app. This is the core
  limitation Modules 2.0 removes.
- **Resolution:** `src/modules/utils/resolveModules.ts` — a pure function that
  takes manifests and returns `{ resolvedModules, issues, disabledModules }`.
  It deduplicates, checks `appVersion` (semver), checks `incompatibleWith`,
  validates dependencies + version ranges, topologically sorts (Kahn's
  algorithm, `loadPriority` tiebreak), detects cycles. It never throws.
- **Install:** `src/modules/utils/installModules.ts` — for each resolved
  module: merges `shared` (namespaced by module id), `constants` and
  `templates` (flat merge), pushes `components` (wrapped in `markRaw`) into
  the context, runs pending `patches` (semver-gated via
  `src/utils/helpers/getPatches.ts`), then calls `onInstall(context, character)`.
  `uninstallModules.ts` reverses all of it. `modulesDiff.ts` computes
  install/reconfigure/uninstall sets when the user changes a character's modules.
- **Runtime context:** `FateContext` (`src/types.ts`) =
  `{ modules, constants, components, templates, shared }`, held reactively in
  the Pinia store `src/store/useFate.ts`.
- **Rendering:** `src/components/CharacterSheet/CharacterSheet.vue` iterates
  the context's components (sorted by `order` via
  `src/utils/helpers/mergeComponents.ts`) and renders each with Vue's dynamic
  `<component :is="c.component" v-model="character" />`, and
  `provide('context', context)` so module components can `inject('context')`.
  **This render path already supports arbitrary runtime components — nothing
  to change here.**
- **Per-character install state:** each character object stores
  `character._modules = { [moduleId]: { version, config? } }`. This is
  persisted with the character in Dexie (`CharactersDatabase`, table
  `characters`, schema **version 1**, `src/db/tables/character.ts`).
- **Translations:** each module has `translations/<lang>.json`. A build script
  (`scripts/translation-compiler/index.ts`, run by `pnpm compile-translation`
  before dev/build) merges all module translations into one 552 KB file
  `src/i18n/languages.json`, namespaced per module id. Module manifests write
  keys as `"t.name"` and `signRecord()`
  (`src/modules/utils/localizationSigners.ts`) rewrites them to
  `"<moduleId>.name"` at load so they resolve in the merged bundle.
- **Type extension:** each module has a `src/types.ts` using TypeScript
  **declaration merging** (`declare module '@/types' { interface Character
  { aspects?: ... } }`). This is compile-time only. It is the one pattern that
  **cannot survive** in 2.0 (an externally-compiled mod can't merge into the
  app's compilation) and is replaced by generics in Phase 0.

### The three build-time couplings 2.0 must break

1. **Static import registry** (`src/modules/index.ts`) → becomes a runtime
   `ModRegistry` fed by both bundled built-ins and downloaded mods.
2. **Build-time translation flattening** → becomes runtime
   `i18n.global.mergeLocaleMessage()` per mod.
3. **Vue SFCs compiled by the app's Vite** → mods ship **precompiled ESM
   bundles** built by an SDK toolchain; the app `import()`s them at runtime.

---

## 2. The 2.0 vision

- A separate public GitHub repo, **`fate-core-mods`**, holds the **source code**
  of every community mod. Authors submit mods by pull request. Review of the
  PR is the trust gate (there is **no sandbox** — mods run with full app
  privileges, like Obsidian or VS Code plugins).
- CI (GitHub Actions) validates each PR (schema, lint, security lint, size,
  reproducible build) and, on merge, **builds the bundle itself** and publishes
  it — so the published bundle provably corresponds to the reviewed source.
- CI publishes to the repo's **GitHub Pages**: a `registry.json` index
  (aggregated static manifests + download URLs + SHA-256 hashes + a blocklist)
  and immutable versioned artifacts `mods/<id>/<version>/…`.
- The app fetches `registry.json`, shows a **Mod Store** page, downloads a
  chosen mod's bundle, **verifies its SHA-256**, caches everything in
  IndexedDB, and loads it — **fully offline afterwards**.
- Power users / mod developers get an **"install from URL"** escape hatch
  (behind a warning) and a **Developer Mode** with live reload against a local
  dev server.
- All 9 built-in modules are migrated to the exact same package format and
  loader API (they stay compiled into the app for startup speed and
  reliability, but are registered through the same code path).
- The manifest declares **capabilities** (`sheetComponents`, `dice`, `theme`,
  `translations`) so future mod types — custom dice, app skins, pure
  localization packs — plug into the same system.

### Feasibility (why this works on this stack)

- **Runtime code loading:** the app runs in a WebView/browser. A downloaded
  JS string can be turned into a module via
  `URL.createObjectURL(new Blob([code], { type: 'text/javascript' }))` +
  `await import(blobUrl)`. This works in Chrome (Android WebView), Firefox,
  and **WKWebView on iOS** (Safari 15+; Capacitor 8's minimum iOS is far
  newer). Phase 0 contains a mandatory on-device spike to prove it, with a
  documented fallback (write the file via Capacitor Filesystem and import it
  through `Capacitor.convertFileSrc()`).
- **App Store rules:** Apple guideline 2.5.2 explicitly **permits** downloaded
  code "run by WebKit". Community-plugin apps (Obsidian et al.) ship this way.
  The curated-registry model keeps the app's core purpose unchanged, which is
  the other half of the guideline.
- **Everything else already exists:** resolution, install/uninstall/diff,
  patch migration, config UI, and the dynamic render path are data-driven and
  don't care where a manifest came from.

---

## 3. Locked architecture decisions

These were decided upfront. **Do not re-litigate them mid-implementation** —
if one proves wrong, stop and record why before changing course.

| # | Decision | Choice | Rationale |
|---|---|---|---|
| D1 | Code delivery | Bundle text cached in Dexie → `Blob` → `URL.createObjectURL` → `import(/* @vite-ignore */ blobUrl)` | Offline-capable, hash-verifiable, supported by all target WebViews. Fallback: Capacitor Filesystem + `convertFileSrc()`. |
| D2 | Shared deps (Vue must be a singleton) | Host installs `window.FateSDK = { version, vue, vueI18n, ionicVue, ionicons, api }`; the SDK build preset aliases `vue`, `vue-i18n`, `@ionic/vue`, `ionicons/icons` to tiny shim modules that re-export from `globalThis.FateSDK` | Obsidian-proven. Two Vue copies = broken reactivity/provide-inject. Import maps rejected (Safari-version + hashed-chunk problems). Mods still write normal `import { ref } from 'vue'`. |
| D3 | `@vitejs/plugin-legacy` | **Remove it** | It targets IE 11 (!) and transforms dynamic `import()` into SystemJS, which would break the runtime loader. All Capacitor WebViews are evergreen. |
| D4 | Bundle storage | Dexie (IndexedDB), DB version 2, bundle code stored as a string column | Uniform across iOS/Android/web, no filesystem path/scheme divergence. Bundles are ≤ ~1 MB of text. |
| D5 | Built-in modules | Same package **format** and same ModRegistry **API**, but statically imported and registered with `source: 'builtin'` | One pipeline (dogfoods the SDK) with zero startup regression; the sheet can never be blank because built-ins don't depend on the loader. |
| D6 | Registry hosting | GitHub Pages of the registry repo: `registry.json` + immutable `mods/<id>/<version>/…` paths; jsDelivr documented as mirror | Free, predictable URLs; immutability makes SHA-256 pinning meaningful. |
| D7 | Types single source | New pnpm workspace package `packages/mod-types` in this repo, published to npm as `@fate-core/mod-types`; the app imports its own types from it | Zero drift between host and SDK. `pnpm-workspace.yaml` already exists. |
| D8 | Mod typing contract | `defineFateMod<TData>()` generic + typed accessors (`getModData<TData>(character, id)`); optionally mods augment interfaces of the *published npm package* | Declaration merging into `@/types` cannot cross a compile boundary. |
| D9 | Mod CSS | CSS inlined in the bundle, injected as `<style data-mod-id="...">` at load; styling contract = Ionic components + CSS variables. **Tailwind is explicitly NOT available to mods** | The app's Tailwind JIT never sees mod source, so mod Tailwind classes would silently not exist. CSS variables keep mods theme-reactive (dark/light). |
| D10 | Trust model | Curated PR review + CI-only builds + SHA-256 per file in the index + `blocklist.json` kill-switch + scary typed-confirmation modal for install-from-URL | Closes the "published bundle ≠ reviewed source" gap; remote kill for versions found to be malicious. |

---

## 4. The mod package format (target state)

A published mod version is a folder of static files:

```
mods/<author>@<name>/<version>/
  manifest.json        # static metadata — NEVER executed, safe to browse/index
  bundle.mjs           # single-file ESM — all code, CSS inlined, small assets base64-inlined
  translations/
    en.json            # only locales the mod supports
    ru.json
  README.md            # rendered in the Mod Store (markdown-it is already a dependency)
  CHANGELOG.md
```

**The split rule:** anything JSON-serializable that is needed for *browsing,
resolution, or configuration UI* lives in `manifest.json`; anything
*executable* lives in `bundle.mjs`.

`manifest.json` = today's per-module `manifest.json`, plus new fields:

```jsonc
{
  "id": "author@name",
  "version": "1.2.0",
  "name": "t.name",                          // "t." prefix resolved by signRecord
  "author": { "name": "...", "github": "..." },  // github handle: CI binds to PR author
  "description": { "short": "t.description.short", "full": "t.description.full" },
  "languages": ["en", "ru"],
  "tags": ["inventory"],
  "dependencies": { "sonder@core-skills": "^1.0.0" },
  "incompatibleWith": [],
  "loadPriority": 1000,
  "appVersion": ">=1.4.0",                   // existing gate, kept
  "sdk": "^1.0.0",                           // NEW: host mod-API (ABI) semver range
  "entry": "bundle.mjs",                     // NEW
  "capabilities": ["sheetComponents"],       // NEW: sheetComponents | dice | theme | translations
  "config": { "groups": [], "options": [] }  // NEW LOCATION: moved from src/config.ts (already pure data)
}
```

`bundle.mjs` default-exports the executable half:

```ts
import { defineFateMod } from '@fate-core/mod-types'

export default defineFateMod<MyModData>({
  components: [{ id: 'my-section', component: MySection, order: 250 }], // precompiled Vue components
  constants: { ... },
  templates: { ... },
  shared: { ... },
  onInstall(context, character) { ... },
  onUninstall(context, character) { ... },
  onReconfigure(context, character) { ... },
  patches: [ ... ],
  // capability sections (Phase 4):
  dice: { shapes: [...], materials: [...] },
  theme: { css: '...' },
})
```

The loader merges `manifest.json` + the bundle's default export into one
`FateModuleManifest`-shaped object — from that point on, **all existing 1.x
machinery works unchanged**.

Size limits (enforced by registry CI): `bundle.mjs` ≤ 1 MB soft / 3 MB hard;
whole artifact ≤ 5 MB.

---

## 5. Target app architecture (bird's-eye)

```
main.ts
 ├─ installFateSDK()            // window.FateSDK = { vue, ionicVue, ... }  (Phase 2)
 ├─ await initMods()            // BEFORE app.mount — resolution needs all manifests
 │    ├─ register built-ins     // static imports, source:'builtin'   (Phase 1)
 │    └─ for each row in Dexie 'mods' table:                          (Phase 2)
 │         verify sha256 → blob import → validate shape → merge manifest
 │         → signRecord → i18n.mergeLocaleMessage → register
 │         (any failure → mod quarantined as 'errored', app boots anyway)
 └─ app.mount('#app')

src/mods/                        // NEW directory (Phases 0–3)
  modRegistry.ts                 // replaces the static Map — single source of truth
  sdk.ts                         // builds window.FateSDK
  loader.ts                      // initMods(), blob import, quarantine
  installService.ts              // install/update/remove/enable, from registry or URL
  registryClient.ts              // fetch + cache registry.json, apply blocklist
  devMode.ts                     // live-reload connection to a local mod dev server

packages/mod-types/              // NEW workspace package → npm @fate-core/mod-types (Phase 0)
```

Existing code that changes: `src/modules/index.ts` (becomes a thin built-ins
registrar), `src/modules/utils/getModules.ts` (reads ModRegistry),
`src/db/` (Dexie v2), `src/main.ts`, `vite.config.mts`,
`scripts/translation-compiler/`, `src/composables/useModuleSelection.ts`,
`src/components/CharacterCreate/CharacterConfiguration.vue`,
`src/store/useFate.ts` (minor).

Existing code that does **not** change: `resolveModules.ts` (one new issue
type in Phase 3), `installModules.ts` / `uninstallModules.ts` /
`modulesDiff.ts` / `updateModules.ts`, `CharacterSheet.vue`,
`mergeComponents.ts`, the config-rendering UI (`ModuleInfo.vue`,
`ModuleConfigOption.vue`, `CustomListConfig.vue`), patches machinery.

---

## 6. Glossary

| Term | Meaning |
|---|---|
| **Module / Mod** | Same thing. "Module" = 1.x vocabulary, "mod" = 2.0/user-facing vocabulary. |
| **Manifest** | The static JSON metadata (`manifest.json`). Safe to parse without running code. |
| **Bundle** | The compiled `bundle.mjs` — the executable half of a mod. |
| **ModRegistry** | In-app runtime map of every known mod (built-in + installed external) and its status. |
| **FateSDK** | `window.FateSDK` — the host-provided object exposing shared libraries (Vue, Ionic) and app APIs to mod bundles. Its semver `version` is the **ABI version** that manifests gate on via `sdk` range. |
| **FateContext** | The reactive runtime aggregate `{ modules, constants, components, templates, shared }` provided to sheet components. |
| **Registry (remote)** | The `fate-core-mods` GitHub repo + its published `registry.json` and artifacts. |
| **Quarantine** | A mod whose bundle failed to load/verify is registered as `errored`, excluded from resolution, and shown in UI with retry/disable/remove — the app never crashes because of a bad mod. |
| **signRecord** | Existing util that rewrites `"t.foo"` i18n keys in a manifest to `"<modId>.foo"`. |
| **Capability** | A named section of the bundle export (`sheetComponents`, `dice`, `theme`, `translations`) declaring what kind of extension the mod provides. |

---

## 7. Cross-phase rules

1. **Never break existing characters.** `character._modules` keys (module ids)
   and versions must remain valid across every phase. Any data change goes
   through the existing `patches` mechanism.
2. **Built-ins must not depend on the network or the loader.** A user with no
   connectivity and no installed mods must get the exact experience they get
   today.
3. **A failing mod must never brick the app.** Every external-code touchpoint
   is wrapped; failure → quarantine, not crash.
4. **`pnpm build && pnpm lint && pnpm test` must be green at the end of every
   phase.** Conventional commits (`feat:`, `fix:`, `refactor:` …) are enforced
   by commitlint.
5. **Immutable published artifacts.** Once a mod version is published to the
   registry, its files never change (only new versions are added). The
   blocklist is the mechanism for pulling bad versions, not deletion.
6. **Update this folder as you go.** If reality diverges from a guide, edit
   the guide in the same PR — these documents are the long-term source of truth.
