# Phase 1 — Migrate Built-in Modules to the 2.0 Format

> **Prerequisites:** Phase 0 complete ([phase-0-groundwork.md](./phase-0-groundwork.md)).
>
> **Outcome:** all 9 built-in sheet modules are restructured into the 2.0
> package shape (static `manifest.json` + executable bundle entry via
> `defineFateMod`), their translations are merged at **runtime** instead of
> build time, and the per-module TypeScript declaration-merging is dismantled.
> **Zero user-visible change** — a user's existing characters open
> pixel-identically.
>
> **Expanded scope (added after Phase 0 sign-off):** this phase also (a) lets
> a character exist with just a `name` and zero sheet modules, and (b) pulls
> forward a *minimal, built-in-only* slice of Phase 4's `dice`/`theme`
> capability design — the existing Fudge and D20 dice become two built-in
> mods, and one dummy "Pink" theme mod is added, all going through the same
> `ModRegistry`/manifest system as the sheet modules (see Steps 5–8). Full
> external-mod support for `dice`/`theme` (exposing `three`/`cannon-es` via
> `FateSDK.dice`, registry CI validation, proper `DiceConstructor[]`/
> `DiceMaterial[]` typing in `mod-types`) **stays in Phase 4** — this phase
> only needs the built-in registration mechanism to work. See
> [phase-4-sdk-extensions.md](./phase-4-sdk-extensions.md) Step 4/5 for the
> updated split.
>
> This phase is the "dogfooding" phase: after it, the built-ins consume the
> exact same registration API that external mods will use, so every gap in the
> API surfaces here, cheaply, before any external author hits it.

## Why this phase exists

Three build-time couplings must die before external mods can work, and killing
them against the 9 modules we control is the safest way:

1. **Manifest/bundle split.** Today a module's `index.ts` mixes static
   metadata and executable code into one `FateModuleManifest` object. 2.0
   needs them separable (the Mod Store must read metadata without executing
   code). Built-ins adopt the split first.
2. **Build-time translation flattening.** `scripts/translation-compiler`
   currently bakes every module's translations into `src/i18n/languages.json`.
   External mods can't participate in a build step — translations must merge
   at runtime (`i18n.global.mergeLocaleMessage`). Built-ins switch to the
   runtime path so there is exactly one translation pipeline.
3. **Declaration merging.** Each module's `src/types.ts` does
   `declare module '@/types' { interface Character { aspects?: ... } }`.
   External mods compile separately and cannot do this. Built-ins move to the
   same typed-accessor pattern external mods will use, proving it's ergonomic.

---

## Step 1 — Restructure each module to the package shape

### Target structure (per module)

Before (today, e.g. `src/modules/sonder@core-aspects/`):

```
manifest.json          # static metadata (config moved here in Phase 0)
index.ts               # spreads signRecord(manifest) + config + constants
                       #   + templates + components + lifecycle fns
src/
  actions.ts           # onInstall / onUninstall / onReconfigure
  components/          # Vue SFCs + index.ts ([{id, component, order}])
  constants.ts  templates.ts  types.ts
translations/*.json
```

After:

```
manifest.json          # UNCHANGED position — the static half
bundle.ts              # NEW — the executable half; default-exports defineFateMod({...})
index.ts               # tiny: merges manifest + bundle into a FateModuleManifest
                       #   (built-ins only; external mods won't have this file —
                       #    the runtime loader does the merge for them)
src/                   # unchanged internals (actions, components, constants, templates)
translations/*.json    # unchanged files, loaded differently (Step 2)
```

### How

For each module:

1. Create `bundle.ts`:

   ```ts
   import { defineFateMod } from '@fate-app/mod-types'
   import constants from './src/constants'
   import templates from './src/templates'
   import components from './src/components'
   import { onInstall, onReconfigure, onUninstall } from './src/actions'
   // sonder@core-skills additionally: import shared from './src/shared'
   // sonder@core-stress additionally: import patches from './src/patches'

   export default defineFateMod({
     components,
     constants,
     templates,
     onInstall,
     onUninstall,
     onReconfigure,
   })
   ```

2. Rewrite `index.ts` to perform exactly the merge the runtime loader will do
   for external mods. Put the merge logic in **one shared function** so
   built-ins and the Phase-2 loader cannot drift:

   ```ts
   // src/mods/assembleMod.ts  (NEW, shared)
   import { signRecord } from '@/modules/utils/localizationSigners'
   import type { FateModuleManifest, FateModBundle } from '@fate-app/mod-types'

   export function assembleMod(manifestJson: Record<string, unknown>, bundle: FateModBundle): FateModuleManifest {
     const signed = signRecord(manifestJson, manifestJson.id as string)
     return { ...signed, ...bundle } as FateModuleManifest
   }
   ```

   ```ts
   // src/modules/sonder@core-aspects/index.ts (after)
   import manifest from './manifest.json'
   import bundle from './bundle'
   import { assembleMod } from '@/mods/assembleMod'

   export default assembleMod(manifest, bundle)
   ```

3. Add the new manifest fields to each `manifest.json`:
   `"sdk": "^1.0.0"`, `"entry": "bundle.mjs"`, `"capabilities": ["sheetComponents"]`.
   (For built-ins `entry` is aspirational metadata — they're statically
   imported — but keeping the manifests fully valid against the registry
   schema means they double as reference examples for authors.)

4. Update `scripts/module-generator/` to scaffold the **new** structure
   (manifest with 2.0 fields, `bundle.ts`, no `config.ts`, no declaration
   merging — see Step 3).

### Module-specific notes

- **`sonder@core-skills`** — exports `shared` (skills map) and has the richest
  config; it's the best test of the whole split. Its components read
  `context.shared['sonder@core-skills']` — unchanged.
- **`sonder@core-stress`** — the only module with `patches`
  (`src/patches/v1.0.1.ts`). Patches are functions → they belong to the
  bundle. Verify the version-migration path still runs
  (`src/modules/utils/updateModules.ts` is untouched).
- **`sonder@core-stunts`** — the only module with a dependency
  (`sonder@core-skills: ^1.0.0`). Resolution is untouched; just re-verify.
- **`sonder@core-aspects`** — imports an SVG **from another module**
  (`@/modules/sonder@inventory/src/assets/icons/Star.svg`). This
  cross-module asset reach-in is illegal in the 2.0 model (mods are isolated
  packages). Fix now: copy the icon into `sonder@core-aspects`' own assets, or
  move shared icons into the app (`src/assets/`) and expose them via
  `FateConstants`. Record which you chose.

---

## Step 2 — Runtime translation merging

### Today

`scripts/translation-compiler/index.ts` (runs before dev/build) reads
`src/i18n/translations/<lang>.json` (core app strings) **and** every
`src/modules/*/translations/<lang>.json`, nests module strings under the
module id, and writes the merged 552 KB `src/i18n/languages.json`, which
`src/i18n/index.ts` feeds to `createI18n({ messages })`.

### Target

- The compiler stops walking `src/modules/` and compiles **core app strings
  only** (`languages.json` shrinks accordingly).
- Each built-in module's translations are imported statically (they still live
  in the app bundle — no network) and merged at registration time, using the
  same function the Phase-2 loader will use for downloaded translations.

### How

1. Add a shared helper (next to `assembleMod`):

   ```ts
   // src/mods/registerModTranslations.ts
   import i18n from '@/i18n'

   export function registerModTranslations(modId: string, translations: Record<string, Record<string, unknown>>): void {
     for (const [lang, messages] of Object.entries(translations)) {
       i18n.global.mergeLocaleMessage(lang, { [modId]: messages })
     }
   }
   ```

2. In each module, add a `translations.ts` that eagerly imports its JSON files.
   Use Vite's glob import so adding a locale file needs no code change:

   ```ts
   // src/modules/sonder@core-aspects/translations.ts
   const files = import.meta.glob<Record<string, unknown>>('./translations/*.json', { eager: true, import: 'default' })
   export default Object.fromEntries(
     Object.entries(files).map(([path, messages]) => [path.match(/([\w-]+)\.json$/)![1], messages])
   )
   ```

   and call `registerModTranslations(manifest.id, translations)` where the
   module registers (in `src/modules/index.ts`, right after `ModRegistry.register`).

3. Trim `scripts/translation-compiler/index.ts` to core-only. Keep the script
   (core strings still benefit from compile-time merging) but delete the
   module-walking loop.

4. **Ordering constraint:** `mergeLocaleMessage` must run after `createI18n`
   but before first render of any module UI. Since `src/i18n/index.ts` creates
   the i18n instance at import time and module registration happens during
   `src/modules/index.ts` import (later in `main.ts`'s import graph), this
   holds — but add a unit test asserting a known key (e.g.
   `sonder@core-aspects.name`) resolves after registration.

5. Check `pnpm translate` (the AI localizer in `scripts/localizer/`) for
   assumptions about the compiler's output; update its docs/inputs if it reads
   `languages.json`.

### Verification

- Boot the app in several locales (incl. an RTL one — the app supports RTL via
  `getTextDirection`): every module section title, config option label, and
  description renders translated, not as raw keys like `sonder@core-skills.name`.
- `languages.json` no longer contains module namespaces.

---

## Step 3 — Dismantle declaration merging (typing migration)

### Today

Each module's `src/types.ts` augments the app's core interfaces:

```ts
declare module '@/types' {
  interface Character { aspects?: CharacterAspect[] }
  interface FateConstants { ASPECT_ICONS: ... }
  interface FateShared { 'sonder@core-skills'?: { skills: Map<string, Skill> } }
  interface FateTemplates { aspect: CharacterAspect }
}
```

App code (and other modules) then freely writes `character.aspects`.

### Target

The core `Character` in `@fate-app/mod-types` carries an **index signature
escape hatch** plus the typed accessor from Phase 0:

```ts
// packages/mod-types/src/character.ts
export interface Character {
  id?: number
  _version: string
  _modules: CharacterModules
  name: string
  // ... other truly-core fields ...
  /** Mod-owned data. Each mod reads/writes its own keys via getModData/setModData. */
  [modKey: string]: unknown
}
```

Each module keeps its rich types **locally** (e.g. `CharacterAspect`) and
accesses its slice through typed helpers:

```ts
// inside sonder@core-aspects code
import { getModData } from '@fate-app/mod-types'
const aspects = getModData<CharacterAspect[]>(character, 'aspects') ?? []
```

For **built-ins only**, a transitional alternative is allowed: keep the
`declare module` blocks but retarget them at the published package
(`declare module '@fate-app/mod-types' { interface Character { … } }`) —
this compiles fine inside the workspace and external mods can even do the same
against their own copy of the package for local DX (their augmentation only
affects their own compilation, which is exactly what they need). **Pick one
pattern and apply it consistently**; the accessor pattern is the
recommendation because it's what external mods will do and dogfooding is the
point of this phase.

### How

1. Update `packages/mod-types` `Character` (index signature) as above; do the
   same for `FateConstants`, `FateShared`, `FateTemplates`
   (`[key: string]: unknown`-style escape hatches replacing per-module merges).
2. Migrate module code and any **app** code that reads module fields.
   Grep for direct uses: `character.aspects`, `character.skills`,
   `character.stunts`, `character.stress`, `character.consequences`,
   `character.inventory`, `character.tokens`, etc. Note: the Dexie schema in
   `src/db/tables/character.ts` names these fields as indexes — that's
   runtime-only (strings), unaffected by type changes, but see Phase 2 for the
   schema cleanup.
3. Delete each module's `declare module '@/types'` block once its code
   compiles via accessors/local augmentation.
4. Update the module generator scaffold accordingly.

### Why this doesn't change runtime behavior

Declaration merging is purely compile-time; the runtime objects were always
plain string-keyed records (`Object.assign` merges). This step only changes
how TypeScript is told about it.

---

## Step 4 — Registration order & `main.ts` shape

By the end of Phase 1, built-in registration should be an explicit function
(preparing the slot where Phase 2 inserts external loading):

```ts
// src/mods/builtins.ts
import SonderCoreIdentity from '@/modules/sonder@core-identity'
// ... all 9 ...
export function registerBuiltinMods(): void {
  for (const mod of [SonderCoreIdentity, /* ... */]) {
    ModRegistry.register({ manifest: mod, source: 'builtin', status: 'loaded' })
    registerModTranslations(mod.id, translationsFor(mod.id))
  }
}
```

```ts
// src/main.ts — add before app.mount:
registerBuiltinMods()      // 9 sheet modules + 2 dice mods + 1 theme mod
registerBuiltinDice()      // Step 6 — populates DICE_SHAPES from 'dice'-capability mods
applyPersistedSkin()       // Step 7 — injects the persisted skin's <style>, if any
```

`registerBuiltinMods()`'s static import list grows from 9 to 12 entries
(`sonder@dice-fudge`, `sonder@dice-d20`, `sonder@theme-pink` join the 9 sheet
modules) — it stays generic/capability-agnostic; `registerBuiltinDice()` and
`applyPersistedSkin()` are the two small capability-specific consumers that
read back out of `ModRegistry` after registration.

(Phase 2 turns this into `await initMods()` which calls
`registerBuiltinMods()` first, then loads external mods.)

---

## Step 5 — Let a character exist with just a name

### Today

`CharacterConfiguration.vue`'s create/update button is disabled via
`:disabled="!name || !selectedIds.size"` — a character cannot be created
without at least one sheet module selected, even though nothing below the UI
layer requires this: `Character._modules` already defaults to `{}` via
`src/utils/config/templates.ts`, `id` is DB-assigned, and rendering
(`CharacterSheet.vue`) is fully data-driven off `context.components` from
whatever modules *are* installed.

### Target

Change the binding to `:disabled="!name"`. No `Character` type change needed
— `id`/`_modules` stay required in the type (they're never something a user
manually supplies, so loosening them to optional would only add risk by
requiring defensive `?? {}`/`?? -1` checks across every consumer, for no
functional gain). Verify: a character created with zero modules renders an
empty sheet and round-trips through Dexie on save/reopen.

---

## Step 6 — Bundle Fudge and D20 dice as built-in mods

### Today

`src/dice/shapes/fudge/` and `src/dice/shapes/d20/` are registered into a
hardcoded `DICE_SHAPES: Map<string, DiceConstructor>` literal in
`src/dice/constants.ts` — no coupling to the module system at all.

### Target (built-in-only; full external support is Phase 4)

Move `src/dice/shapes/fudge/{fudge.ts,fugde.svg}` →
`src/modules/sonder@dice-fudge/src/` and `src/dice/shapes/d20/{d20.ts,d20.svg}`
→ `src/modules/sonder@dice-d20/src/`. Each gets a minimal `manifest.json`
(`capabilities: ["dice"]`, plain-string name/description, no translations —
these are small/internal, full localization is a trivial follow-up) and a
`bundle.ts` exporting `defineFateMod({ dice: { shapes: [FudgeDice] } })`
(respectively `D20Dice`). `src/dice/shapes/index.ts` keeps the shared
abstract `Dice` class + `DiceConstructor` type — **still app-local**, not
moved into `mod-types` (that's Phase 4, once `FateSDK.dice` needs to expose
the base class to external authors).

Add `src/dice/registerBuiltinDice.ts`, which statically imports the two dice
mods, registers them into `ModRegistry`, and populates `DICE_SHAPES` from
each mod's `dice.shapes` (one localized `as DiceConstructor[]` cast here —
see note below on why `FateModDice.shapes` stays `unknown[]`). `DICE_MATERIALS`
(white/black) is **not** converted to mods in this phase — materials are
generic/shared across shapes, not a natural per-shape decomposition; revisit
in Phase 4 if wanted.

**Deviation from the original plan, discovered during implementation:**
`registerBuiltinDice()` is deliberately **not** called from `main.ts`/
`src/mods/builtins.ts`. The Roll Dice page (`RollDicePage.vue`) was always a
lazy-routed view, so the Fudge/D20 dice code (Three.js geometry + cannon-es
physics setup, ~300KB) was never part of the eager app-boot bundle. Wiring
`registerBuiltinDice()` (which statically imports the two dice mods) into the
eagerly-loaded `builtins.ts` would have pulled that ~300KB into every app
boot — a real, measured regression (confirmed via `pnpm build` chunk sizes).
Instead, `registerBuiltinDice()` lives in its own file, imported only by
`src/dice/composables/useDiceScene.ts` (which itself is only reachable via
the lazy `RollDicePage` route), and is called as the first line of
`useDiceScene()` — idempotent, guarded by a module-level flag. This keeps
dice mods dogfooding the same `ModRegistry`/manifest system as everything
else, while preserving the pre-existing lazy-loading boundary.
`RollDicePage`/`DiceTypeSelect.vue` need no other changes — they already read
from the `DICE_SHAPES` Map, just now populated dynamically instead of at
module-eval time.

**Why `FateModDice.shapes`/`materials` stay `unknown[]` in `mod-types`:**
properly typing them as `DiceConstructor[]`/`DiceMaterial[]` requires either
pulling `three`/`cannon-es` types into the publishable `mod-types` package or
duplicating structural types — both are Phase 4 concerns tied to exposing
`FateSDK.dice`. Doing it now would be premature for a package that's meant to
be a stable, minimal npm-published contract.

---

## Step 7 — One dummy pink theme mod + skin selection

### Target (built-in-only; full external support is Phase 4)

New `src/modules/sonder@theme-pink/`: `manifest.json`
(`capabilities: ["theme"]`, name "Pink"), `bundle.ts` exporting
`defineFateMod({ theme: { css: '...' } })` with a CSS string overriding
`--ion-color-primary` and the app's Tailwind `--color-*` vars
(`src/styles/variables.css`) to a pink palette, under both `:root` and
`:root.ion-palette-dark` (mirrors the existing light/dark split).

Extend `src/composables/useTheme.ts` (or a new adjacent `useSkins.ts`) with a
"skin" concept: list `ModRegistry` entries with
`capabilities?.includes('theme')`, persist the chosen skin id to
`localStorage`, and on selection/boot inject `<style data-skin-id="...">`
containing the mod's `theme.css` (removing/replacing the previous skin's tag
on change). Extend `src/views/settings/ThemePage.vue` with a skin picker
below the existing light/dark/system radio list — "Default" (no skin) plus
"Pink".

This is intentionally the same shallow model Phase 4 Step 5 already designed
("themes register app-level like dice... injected as `<style data-skin>`
after app styles... must handle both `:root` and `:root.ion-palette-dark`") —
Phase 1 just builds it for one built-in mod instead of leaving it a stub.

---

## Step 8 — Keep dice/theme mods out of character module-selection

Dice and theme mods are **app-level**, not per-character (per Phase 4's own
design intent for the `dice` capability) — they must never appear in
`character._modules` or in the "select modules for this character" UI.

Add a filter — e.g. `getSheetModules()` wrapping
`ModRegistry.getLoadedManifests()` filtered to
`!m.capabilities || m.capabilities.includes('sheetComponents')` — used by both
`src/utils/helpers/getCoreModulesConfig.ts` and the `CharacterConfiguration.vue`
call site (`useModuleSelection(getSheetModules(), initialConfig)` instead of
the raw registry). No change needed to `resolveModules.ts`/`installModules.ts`/
`updateModules.ts` — these mods simply never get referenced by any character,
so the existing per-character machinery never sees them.

---

## Regression safety — the critical checklist

This phase touches every module. The bar: **a device upgrading from 1.3.x
must notice nothing.**

- [x] `character._modules` ids and versions unchanged — no accidental version
      bumps that would trigger `updateModules` patch runs. Verified: manifest
      `version` fields untouched by this phase; only new fields (`sdk`,
      `entry`, `capabilities`) added.
- [x] Create a new character with all 9 modules; toggle each config option
      type (`boolean`, `select`, `range`, `custom-list` in skills); reconfigure.
      Verified via e2e (`identity.cy.ts`, `aspects.cy.ts`, `skills.cy.ts`,
      `moduleRemove.cy.ts`, `create.cy.ts`, `fateCoreModulesCrush.cy.ts` — all
      passing against the restructured modules).
- [x] `sonder@core-stress` patch path unchanged — `patches` moved into
      `bundle.ts` verbatim, `updateModules.ts` untouched.
- [x] `pnpm test:unit` — 111/111 passing (15 test files), including new
      coverage for `registerModTranslations`.
- [x] `pnpm test:e2e` green — 14/14 passing across all 7 specs.
- [x] Create a character with **zero** sheet modules and just a name —
      type/store/DB path verified safe (`_modules: {}` already a valid
      template default; `resolveModules([])`/`installModules` both handle the
      empty case explicitly); UI gate removed.
- [x] Roll-dice page: `pnpm build` confirms `DICE_SHAPES` populates correctly
      from the two built-in dice mods; e2e doesn't cover interactive dice
      rolling — **manual on-device check still recommended**, same as the
      Phase 0 spike.
- [ ] Settings → Theme: "Pink" skin behavior — implemented, not yet manually
      verified in a running browser/device (no e2e coverage for this new UI).
- [ ] Open a pre-Phase-1 `.fchar` export / `.fmod` round-trip — not
      re-verified in this session (no exported fixture available); the data
      shape is unchanged so this should hold, but is an explicit manual
      follow-up.
- [ ] All 30 locales spot-checked — en verified (build + tests); others not
      manually spot-checked this session.
- [ ] iOS + Android smoke test — not done this session (web-only
      build/lint/test/e2e).

## Phase 1 exit checklist

- [x] All 9 sheet modules: `bundle.ts` + thin `index.ts` via shared `assembleMod()`
- [x] `manifest.json`s carry `sdk`, `entry`, `capabilities` and validate as
      full 2.0 manifests
- [x] Translations merge at runtime; compiler is core-only; `languages.json` shrank
- [x] No `declare module '@/types'` anywhere — retargeted to
      `declare module '@fate-app/mod-types'` (the doc's sanctioned
      "transitional, built-ins-only" choice — see Step 3 note; the full
      index-signature + `getModData`/`setModData` accessor path was added to
      `mod-types` too and is demonstrated in `CharacterCard.vue`, but not
      applied to every internal module↔field access, to avoid an
      unnecessarily wide ripple for a built-in-only phase)
- [x] **Deviation, discovered after the first pass:** `CharacterCard.vue`
      reading `avatar` via `getModData(character, 'avatar')` fixed the
      *runtime* coupling to `sonder@core-identity` (graceful fallback when
      not installed) but not the *architectural* one — the app's own list
      card still had implicit, undocumented knowledge of that module's field
      name. Resolved by promoting `avatar` to a required core `Character`
      field (`packages/mod-types/src/character.ts`), removed from
      `sonder@core-identity`'s `declare module` augmentation and its
      `onUninstall` (core fields aren't deleted on module uninstall). `race`/
      `description` stay module-owned (read via `getModData` as before) —
      only `avatar` moved, because a blank card image was the actual UX
      problem. `src/utils/config/templates.ts` defaults new characters to
      `avatar: ''`; `src/patches/v2.0.0.ts` (app-level, not module-scoped —
      see `src/patches/index.ts` / `updateApplication.ts`) backfills existing
      characters regardless of whether they ever had identity installed. App
      version bumped to `2.0.0` (major — this is a breaking change to the
      module contract: `avatar` is no longer owned by `sonder@core-identity`)
      so the patch fires. See
      [phase-5-other-improvements.md](./phase-5-other-improvements.md) for
      the follow-up (no UI to set an avatar without identity installed yet —
      user-owned redesign).
- [x] Cross-module asset imports eliminated (aspects↔inventory icon — copied
      into `sonder@core-aspects`' own assets)
- [x] Module generator scaffolds the new shape
- [x] `registerBuiltinMods()` called from `main.ts`
- [x] Character creatable with zero sheet modules (Step 5)
- [x] Fudge and D20 dice bundled as built-in `dice`-capability mods; registered
      lazily via `registerBuiltinDice()` from `useDiceScene.ts`, not eagerly
      from `main.ts` (Step 6 — see the deviation note above)
- [x] "Pink" theme mod + skin picker shipped (Step 7)
- [x] Dice/theme mods excluded from character module-selection UI (Step 8)
- [x] `pnpm build && pnpm lint && pnpm test:unit && pnpm test:e2e` all green
- [ ] Manual verification: Pink skin in-browser, `.fchar`/`.fmod` round-trip,
      non-English locale spot-check, iOS/Android smoke test — flagged above,
      left for the user/next session (matches this project's established
      pattern of doing device/manual verification separately from the coding
      session, as with the Phase 0 spike)
