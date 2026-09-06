# Assistant for Fate — Mod API

This is the contract between the app (the "host") and a mod's code — what a
mod may rely on, what it must not, and how the pieces fit together. It's
aimed at mod authors. `@fate-core/mod-types`/`@fate-core/mod-build` are
published to npm; scaffold a new project with `pnpm create fate-mod` rather
than hand-writing the files described below.

Background reading: `planning/modules-2-0/README.md` (architecture and the
locked decisions, D1–D10) and `planning/modules-2-0/phase-2-loader-storage-devmode.md`
(the implementation plan this doc's contents were built against).

## 1. The package format

A mod is a folder of static files:

```
author@name/
  manifest.json        # static metadata — never executed, safe to parse/index
  bundle.mjs            # single-file ESM — all code, CSS inlined
  translations/
    en.json             # only the locales you support
    ru.json
```

**The split rule**: anything needed to browse, resolve, or configure a mod
*without running its code* lives in `manifest.json`. Anything executable
lives in `bundle.mjs`. The app never executes `manifest.json`; the in-app
Mod Store renders mod listings from manifests alone, without loading any
bundle.

`bundle.mjs` default-exports the result of `defineFateMod()`
(`@fate-core/mod-types`):

```ts
import { defineFateMod } from '@fate-core/mod-types'

export default defineFateMod({
  components: [{ id: 'my-section', component: MySection, order: 250 }],
  constants: { /* merged into the shared FateConstants */ },
  templates: { /* merged into FateTemplates */ },
  shared: { /* namespaced under your mod id in FateShared */ },
  onInstall(context, character) { /* ... */ },
  onUninstall(context, character) { /* ... */ },
  onReconfigure(context, character) { /* ... */ },
  patches: [ /* versioned character-data migrations */ ],
})
```

The loader (`src/mods/loader.ts`) merges your `manifest.json` with this
object into one `FateModuleManifest` — from that point on, your mod is
indistinguishable from a built-in one to the rest of the app.

## 2. `window.FateSDK` — the host API (ABI)

Your mod runs inside the **same Vue instance** as the host app — not a copy.
This is what makes reactivity, `provide`/`inject`, and shared component
context work across the mod boundary. The mechanism (`src/mods/sdk.ts`):
before loading any mod, the app freezes `window.FateSDK`, and your build
tool (`@fate-core/mod-build`) rewrites `import { ref } from 'vue'` and
similar imports into re-exports from `FateSDK.vue` — you never see this
rewrite; you just write normal imports.

```ts
interface FateSDK {
  version: string        // the ABI version — see "Versioning" below
  vue: typeof import('vue')
  vueI18n: typeof import('vue-i18n')
  ionicVue: typeof import('@ionic/vue')
  ionicons: typeof import('ionicons/icons')   // full icon set; populated lazily, see note below
  dice: { three: typeof import('three'); cannonEs: typeof import('cannon-es') }  // experimental, see §2a
  api: {
    toast: { error(key: string, opts?): Promise<void>; success(key: string, opts?): Promise<void> }
    getModData<T>(character: Character, key: string): T | undefined
    setModData<T>(character: Character, key: string, value: T): void
  }
}
```

`FateSDK.ionicons` note: the full icon set (~1300 exports, ~800KB) is loaded
lazily — only fetched the moment there's an external mod to load at all, so
users with no external mods installed never pay for it. This is transparent
to you as an author; `import { starOutline } from 'ionicons/icons'` in your
source works exactly like it would in the host app.

### 2a. The `dice` capability (experimental)

A mod with `"capabilities": ["dice"]` can contribute custom roll shapes and/or
materials:

```ts
import { defineFateMod, Dice, DiceMaterial } from '@fate-core/mod-types'
import * as THREE from 'three'
import * as CANNON from 'cannon-es'

class MyD12 extends Dice {
  static name = 'MyD12'
  static icon = 'my-d12.svg'
  // implement clone/getResult/formatResult/changeMaterial/createMesh/createBody
  // using THREE/CANNON exactly like src/modules/sonder@dice-fudge does
}

export default defineFateMod({
  dice: {
    shapes: [MyD12],
    materials: [new DiceMaterial('neon', new THREE.MeshStandardMaterial(), new THREE.MeshStandardMaterial(), '#39ff14')]
  }
})
```

`Dice`/`DiceMaterial` are real, tiny runtime exports of `@fate-core/mod-types`
(no three/cannon-es logic of their own — that's your subclass's job in
`createMesh`/`createBody`), so they bundle directly into your `bundle.mjs`.
`three`/`cannon-es` themselves are the two libraries you must NOT bundle a
second copy of — `@fate-core/mod-build`'s preset externalizes plain
`import * as THREE from 'three'` / `import * as CANNON from 'cannon-es'` to
pull from `FateSDK.dice.three`/`FateSDK.dice.cannonEs` instead, the same
mechanism as `vue`. Shapes/materials register under a namespaced key
(`<your-mod-id>:<name>`) to avoid colliding with other mods' or the
built-ins' dice — you never construct this key yourself.

Marked **experimental**: a three/cannon-es major upgrade is an SDK major
bump, since it changes what `FateSDK.dice.three`/`.cannonEs` expose.

**What's on `window.FateSDK` is everything you may rely on from the host.**
Nothing under `@/` (the app's internal path alias) exists at runtime for a
mod — those modules are compiled into the host bundle and never shipped to
you; importing them isn't possible and wouldn't resolve at load time even
if it were.

### The character-sheet render contract

Your components receive the currently-edited character as a `v-model`
(`defineModel<Character>({ required: true })`) and can `inject('context')`
to read the shared `FateContext` (`{ constants, templates, shared, components,
modules }`) — the exact same contract built-in modules use
(`src/store/useFate.ts` / `CharacterSheet.vue`). Nothing here differs for
external mods; the render path was already fully data-driven before Phase 2.

Since you don't own `Character`'s type (only the app does), you read/write
your own data through namespaced keys via `getModData`/`setModData` rather
than declaring new `Character` fields — see `packages/example-mod` for a
worked example (`sonder@example.note` as its key).

### Lifecycle guarantees

Unchanged from the 1.x module system (`src/modules/utils/installModules.ts`,
`uninstallModules.ts`, `updateModules.ts`):

- `onInstall(context, character)` runs whenever the character's context is
  (re)built — that's on **every character load**, not just the first time a
  user adds your mod (`installModules.ts` calls it for every module already
  in `character._modules`, unconditionally, to rebuild the shared
  `FateContext` from scratch each load). **It must be idempotent**: only
  initialize a field if it's genuinely unset, exactly like the built-in
  modules' `character.field = character.field ?? default` pattern —
  `setModData(character, key, getModData(character, key) ?? default)`.
  Writing an unconditional default (`setModData(character, key, default)`)
  will silently wipe the user's data on every reload; this is a real bug
  `packages/example-mod` shipped with initially and was caught by manual
  testing, not by any automated check — see `src/modules/utils/installModules.ts`.
- `onUninstall(context, character)` runs once, when removed — clean up your
  own data (`setModData`/`delete character[yourKey]`); the app never touches
  it for you.
- `onReconfigure(context, character)` runs whenever the user changes your
  mod's config options (declared in `manifest.json`'s `config`).
- `patches` — an array of `{ version: string; action(context, character) }`,
  run in order for characters whose stored version of your mod is older,
  exactly like `sonder@core-stress`'s existing patch does. Bump your
  manifest's `version` and add a patch whenever a character-data shape
  change needs migrating.

## 3. What a mod must NOT rely on

- **Tailwind classes.** The host's Tailwind JIT compiler never sees your
  source, so any Tailwind class in your markup silently does nothing. Ship
  your own CSS — `@fate-core/mod-build` inlines and injects it as a
  `<style>` tag at load (via `vite-plugin-css-injected-by-js`). Style
  against Ionic components and Ionic's CSS variables (`--ion-color-*` etc.)
  so you stay reactive to the host's light/dark theme.
- **Anything under `@/`.** App-internal components/utilities are compiled
  into the host and don't exist as an importable module for external code.
- **DOM structure outside your own components.** You render into a slot the
  host provides; don't reach outside it.
- **Network availability after install.** Once installed, your bundle runs
  entirely offline — the loader caches everything in IndexedDB
  (`src/db/tables/mods.ts`). Don't assume `fetch` to your own origin works.
- **A specific load order relative to other mods**, beyond `loadPriority`
  and `dependencies` in your manifest (unchanged from 1.x resolution,
  `src/modules/utils/resolveModules.ts`).

## 4. Building your mod

Use the `@fate-core/mod-build` Vite preset (published to npm; scaffold a new
project with `pnpm create fate-mod` rather than writing these files by hand).
Your project:

```
your-mod/
  manifest.json
  bundle.ts
  translations/en.json
  vite.config.ts        # export default defineModConfig()
```

```ts
// vite.config.ts
import { defineModConfig } from '@fate-core/mod-build'
export default defineModConfig()
```

`pnpm build` (i.e. `vite build`) emits `dist/bundle.mjs`: a single-file ESM
bundle, CSS inlined, with `vue`/`vue-i18n`/`@ionic/vue`/`ionicons/icons`
imports rewritten to pull from `FateSDK` instead of being bundled. Size
limits are enforced at build time: 1MB soft warning, 3MB hard error per
`bundle.mjs` (`packages/mod-build/src/manifestChecks.ts`).

**Why not `rollupOptions.external`**: it's tempting, but wrong — `external`
tells the bundler to leave `import ... from 'vue'` as a literal statement in
the output. That's an unresolvable bare specifier once the bundle is loaded
via a blob URL (there's no bare-specifier resolution outside a bundler).
`defineModConfig()` instead virtualizes those imports into local modules
that reference `globalThis.FateSDK.*` directly, which get bundled normally.

See `packages/example-mod` for a complete, buildable, non-trivial reference
mod: a sheet component, `getModData`/`setModData`, a config option,
`onInstall`/`onUninstall`/`onReconfigure`, scoped CSS, and an i18n key.

## 5. Testing locally

1. **Settings → Developer Mode** (persisted toggle, `src/composables/useDeveloperMode.ts`) — reveals install-from-URL and dev-mod connection. This gate is only for pulling in **new** code from a URL; once a mod is installed (from any source), **Settings → Mods** is a separate, always-visible entry — installed mods are app-wide state, not a "developer" concern, so managing them (enable/disable/update/remove) doesn't require the toggle.
2. **Install from URL**: serve your built mod's folder (manifest.json + dist/bundle.mjs + translations/) over HTTP, paste the base URL. You'll be asked to type your mod's id or "install" to confirm — this is deliberate friction (README.md decision D10): you're installing code from outside any reviewed registry, with full app access.
3. **Live reload** (`npm run dev` in your mod project, which runs `fate-mod-build dev`): runs a watched build and serves it with an SSE `/events` endpoint. Connect via Settings → Developer Mode → Connect dev mod. Every rebuild hot-reimports your mod into whichever character is currently open, through the existing `reconfigureCharacter` store action (`src/store/useCharacter.ts`) — not real HMR, just a fast full reload of your mod specifically. (Earlier versions called `changeCharacterModules` directly with the live reactive character object, which throws `DataCloneError` from its internal `structuredClone` backup — `reconfigureCharacter` re-fetches a plain character object first, exactly like the existing "save modules configuration" UI already does.)
   - No hash verification for dev connections (WebCrypto needs a secure context; dev servers are plain `http://` on the LAN).
   - iOS device → laptop: needs an ATS local-networking exception (`NSAllowsLocalNetworking` in `ios/App/App/Info.plist`) — **not verified on-device in this implementation session**, flagged for manual follow-up.
   - Android device: prefer `adb reverse tcp:5199 tcp:5199` so the app can reach `http://localhost:5199` instead of needing cleartext-traffic exceptions for a LAN IP — **not verified on-device in this implementation session**, flagged for manual follow-up.
   - Web (browser/`vite preview`): plain fetch, no special setup — verified working end-to-end (manifest/bundle/translations serving, CORS, SSE rebuild notifications) as part of this implementation.

## 6. Manifest reference (`manifest.json`)

| Field | Required | Notes |
|---|---|---|
| `id` | yes | `"author@name"`, globally unique, matches your bundle's `defineFateMod` export id implicitly (via `assembleMod`) |
| `version` | yes | semver |
| `name` | yes | i18n key (`"t.name"` — resolved to `"<id>.name"` at registration via `signRecord`) or a plain string |
| `author` | yes | `{ name, email?, url? }` |
| `description` | yes | `{ short, full? }`, same `"t."` convention |
| `languages` | yes | locale codes your `translations/` folder covers |
| `tags` | yes | freeform, used for browsing in the Mod Store |
| `dependencies` | no | `{ [modId]: semverRange }` |
| `incompatibleWith` | no | mod ids that can't coexist with yours |
| `appVersion` | no | semver range gating the **app version** (existing 1.x mechanism) |
| `loadPriority` | yes | higher loads first; tiebreak for topological sort |
| `sdk` | yes | semver range gating the **ABI version** (`FateSDK.version`) — see Versioning below |
| `entry` | yes | relative path to your bundle, conventionally `"bundle.mjs"` |
| `capabilities` | yes | `["sheetComponents"]` for a character-sheet mod; `["dice"]`/`["theme"]` also work for externally-loaded mods (install-from-URL, dev mode) as of the app's SDK 1.1.0 — the curated public registry's own CI may lag behind on accepting `dice`/`theme` submissions, check `fate-core-mods`' `SUBMITTING.md` for current status |
| `config` | no | `{ groups: [], options: [] }` — declarative settings schema, rendered by the host's existing config UI, unchanged from 1.x |

## 7. Versioning rules

`FateSDK.version` (`SDK_VERSION` in `src/mods/sdk.ts`) is the ABI version.
Your manifest's `sdk` field is a semver range checked against it
(`semver.satisfies(SDK_VERSION, manifest.sdk)`) **before your bundle is
ever imported** — a mismatch quarantines your mod with a clear message,
without executing a single line of your code.

- **Minor bump**: additions to `FateSDK` (a new API, a new export). Existing
  mods keep working.
- **Major bump**: anything removed or changed incompatibly — including a
  Vue/Ionic major upgrade the host takes, since that changes what
  `FateSDK.vue`/`FateSDK.ionicVue` actually expose.

Current: `SDK_VERSION = '1.1.0'`. Treat every property on `FateSDK` as
something you must support for years once shipped — this is why its surface
is deliberately small (`src/mods/sdk.ts`'s own comment: "every property
added here is frozen ABI").

## 8. Trust model

There is no code sandbox (README.md decision D10) — a mod runs with full
app privileges, the same model Obsidian/VS Code plugins use. Trust is
established two ways depending on install source:

- **Install from URL**: a typed-confirmation prompt ("type the mod id or
  'install' to confirm") gates every install, behind the Developer Mode
  setting.
- **Public registry**: PR review + CI-only builds + SHA-256 pinning + a
  blocklist kill-switch is the trust gate instead — no typed confirmation
  needed for a mod installed from the reviewed registry via the in-app Mod
  Store.

Every load goes through integrity verification regardless of source
(except `dev`, for the reasons above): the loader recomputes the bundle's
SHA-256 and refuses to run it on mismatch (`src/mods/loader.ts`).
