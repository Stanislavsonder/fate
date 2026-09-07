# Mods 2.0 — pre-release critical review

Audit of the external mod system as it stands on `2.0.0`: loading, installation, updates,
removal, enable/disable, the registry path, dev mode, and the author-facing SDK surface.

Scope of what was read: `src/mods/**`, `src/modules/utils/**`, `src/db/tables/mods.ts`,
`src/store/useFate.ts`, `src/store/useCharacter.ts`, `src/composables/useSkins.ts`,
`src/composables/useRegistryBase.ts`, `src/dice/registerBuiltinDice.ts`, `src/views/mods/**`,
`src/views/settings/DeveloperModePage.vue`, `packages/mod-types/**`, `packages/mod-build/**`,
and the registry repo's `scripts/ci/**` + `eslint.config.js`.

The bias of this document is deliberately negative — it lists what is wrong or fragile. The
system is well built overall; see "What is good" at the end for the parts that should not be
touched.

**Ground rule: nothing is in production yet.** The Mod Store has not shipped, so the four mods
in the registry and the two example packages are the entire population, all maintained by us and
all trivially republishable. Every breaking change to the mod ABI is therefore free right now,
and stops being free the day a third party publishes a mod. Where an option below is marked
"SDK major" or "breaking", read that as a cost that applies *after* release — take those changes
now if you want them at all.

---

## Summary

| # | Severity | Area | One-line |
| --- | --- | --- | --- |
| [M1](#m1) | ~~Critical~~ done | Loader | A bundle can overwrite any manifest field, including `id` and `capabilities` |
| [M2](#m2) | ~~Critical~~ A done, B batched | i18n | Mod ids are unvalidated app-side; a mod can hijack the app's translation namespace |
| [M3](#m3) | High | Kill switch | Blocked mods still execute once per boot; the registry base lives in writable localStorage |
| [M4](#m4) | High | Trust model | The load-time hash check is self-consistency, but is documented as anti-tampering |
| [M5](#m5) | High | Isolation | No CSP — every mod has unrestricted network access to all character data |
| [M6](#m6) | High | SDK | `Object.freeze(FateSDK)` does not prevent reassignment of the global |
| [M7](#m7) | High | Dev mode | Dev mods persist forever, are never re-verified, and can overwrite a real install |
| [M8](#m8) | High | Lifecycle | `installModule` ignores the "incompatible patch" abort and installs anyway |
| [M9](#m9) | High | Data | Orphaned mod data is never cleaned up; `setModData` keys are unnamespaced |
| [M10](#m10) | High | Removal | `remove()` runs `onUninstall` with an empty context and JSON-clones characters |
| [M11](#m11) | Medium | Validation | Bundles without `capabilities` skip component shape validation |
| [M12](#m12) | Medium | Versioning | Downgrades run forward-only patches and silently rewrite the stored version |
| [M13](#m13) | Medium | Updates | URL mods always show "Update"; updating re-executes new code with no confirmation |
| [M14](#m14) | Medium | Registry | Only `manifest.json` and the bundle are hash-verified; translations are not |
| [M15](#m15) | Medium | Storage | No size or count limits at install time; quota errors are generic |
| [M16](#m16) | Medium | Registry | `isSaneIndex` validates three fields; entries are trusted wholesale |
| [M17](#m17) | Medium | Runtime | In-session install/remove is half-applied; reload is the real contract |
| [M18](#m18) | Medium | Boot | Mod imports are serialized with no timeout, and block `app.mount()` |
| [M19](#m19) | Medium | Compat | `appVersion` is ignored for dice/theme mods and for URL/dev installs |
| [M20](#m20) | Medium | Compat | `sdk` is documented as required but optional at runtime |
| [M21](#m21) | Low | Hardening | Manifest-derived values reach `Object.assign` (prototype pollution path) |
| [M22](#m22) | Low | Config | Config values are never validated against the declared schema |
| [M23](#m23) | Low | Concurrency | No locking around install/update; check-then-write races |
| [M24](#m24) | Optional | UX | Character import does not reconcile required mods |
| [M25](#m25) | Optional | Themes | Theme CSS is treated as inert; it is not |
| [M26](#m26) | Optional | API | The `translations` capability is published but unimplemented |
| [M27](#m27) | Optional | CI | `onInstall` idempotency is a rule with no enforcement |
| [M28](#m28) | Optional | Registry CI | Multi-mod PRs validate one mod; security lint scope is narrow |
| [M29](#m29) | Optional | Support | No per-mod error boundary and no diagnostics surface |

---

## Critical

### M1 — A bundle can overwrite any manifest field, including `id` and `capabilities` {#m1}

`assembleMod` merged the executable half over the static half (code as it was when this was
written):

```ts
export function assembleMod<M extends Record<string, unknown>>(manifestJson: M, bundle: FateModBundle): FateModuleManifest {
	return {
		...signRecord(manifestJson, manifestJson.id as string),
		...bundle
	} as unknown as FateModuleManifest
}
```

`FateModBundle` does not declare `id`/`capabilities`/`dependencies`, but nothing enforces the
type at runtime, and `validateBundleShape` does not reject unknown keys. Every gate in
`loadExternalMod` runs against the *manifest's* values, then the bundle gets the last word.
Consequences, in order of seriousness:

- **Built-in override.** The "conflicts with a built-in" check runs on the fetched manifest id
  (`installService.ts:123`, `:426`, `devMode.ts:64`) before any code executes. A bundle that
  exports `id: 'sonder@core-skills'` is registered under that id in `ModRegistry`'s Map
  (`modRegistry.ts:17`), replacing the built-in module — its components, constants, and
  lifecycle hooks — for the whole session.
- **Un-removable mod.** The DB row is keyed by the manifest id, the registry entry by the
  bundle id. The Installed tab iterates DB rows and looks the record up by row id, so an
  id-divergent mod cannot be disabled or removed through the UI, and `ModRegistry.remove(id)`
  in `remove()` misses it.
- **Capability escalation.** `validateBundleShape(bundle, manifest.capabilities)`
  (`loader.ts:118`) gates the theme CSS size check and dice shape checks on the manifest's
  capability list, but `useSkins`/`registerBuiltinDice` read the *assembled* manifest. A mod
  declaring `sheetComponents` in `manifest.json` and `capabilities: ['theme']` in its bundle
  gets unchecked CSS injected into `<head>`.
- `version`, `dependencies`, `appVersion`, `sdk`, `published` are equally overridable, so
  resolution and update logic operate on values chosen after all gates passed.

**Options**

| | Approach | Cost |
| --- | --- | --- |
| **A (recommended)** | Whitelist in `assembleMod`: pick only executable keys from the bundle (`components`, `constants`, `templates`, `shared`, the three hooks, `patches`, `dice`, `theme`). Metadata comes from the manifest, always. | ~10 lines + unit test |
| B | Reverse the spread (`{...bundle, ...signedManifest}`). Cheaper, but leaves arbitrary bundle keys on the manifest object. | 1 line |
| C | Post-assembly assertion (`assembled.id === row.id`, capabilities unchanged) and quarantine on mismatch. | small |
| D | Add an allowlist check to `validateBundleShape` so unknown top-level keys are rejected at the gate. | small |

Recommend **A + C + D**. This is the single highest-value fix in this document, and it is
behaviour no published mod can depend on, so it is safe to change now.

**Resolved (A + C + D).**

- **A** — `assembleMod` copies an explicit `BUNDLE_KEYS` allowlist off the bundle instead of
  spreading it, so metadata always comes from `manifest.json`. The list is
  `satisfies Record<keyof FateModBundle, true>`, so adding a key to `FateModBundle` fails to
  compile until it is listed here too.
- **C** — `loadExternalMod` checks `manifest.id === row.id` before translations are merged
  (step 0), and re-checks the assembled id afterwards as a tripwire on A.
- **D** — narrowed so it does not constrain authors: `validateBundleShape` rejects only the nine
  manifest-owned gating keys (`id`, `version`, `sdk`, `capabilities`, `dependencies`,
  `incompatibleWith`, `appVersion`, `published`, `entry`) and leaves every other extra key
  alone. Rejecting rather than ignoring turns a silent no-op into a build/PR-time error for
  authors who put a field in the wrong file. No published mod declares any of them.

Tests: `src/tests/unit/mods/assembleMod.test.ts`, plus cases in `loader.test.ts` and
`validateBundleShape.test.ts`. The registry's CI inherits D through `smokeLoad` once
`@fate-app/mod-types` is republished (the mods' `^2.1.0` range picks it up).

### M2 — Mod ids are unvalidated app-side; the i18n namespace is hijackable {#m2}

```10:14:src/mods/registerModTranslations.ts
export function registerModTranslations(modId: string, translations: Record<string, Record<string, unknown>>): void {
	for (const [lang, messages] of Object.entries(translations)) {
		i18n.global.mergeLocaleMessage(lang, { [modId]: messages })
	}
}
```

The `author@name` id pattern is enforced only by the registry repo's `registry.schema.json`,
which install-from-URL and dev mode never touch. `fetchManifest` checks that `id` is a string
and nothing more. A mod with `"id": "settings"` deep-merges its messages over the app's own
`settings` namespace; `"errors"`, `"common"`, and every dialog string are equally reachable.
Combined with M1, the id can also be chosen after the built-in-collision check.

This matters beyond mischief: the install-from-URL confirmation copy, the blocklist warning
toast, and the privacy-policy links are all i18n keys.

**Options**

| | Approach | Cost |
| --- | --- | --- |
| **A (recommended)** | Validate the id against your published pattern (`^[a-z0-9-]+@[a-z0-9-]+$`) at install *and* at load; quarantine on mismatch. | small |
| **B (recommended)** | Namespace all mod messages under a fixed root (`mods.<id>.…`) and update `signRecord` to match. | medium; breaking, but free pre-release |
| C | Keep a reserved-prefix denylist of app-owned top-level keys. | small, brittle |

Recommend **A + B**. A alone leaves the app's namespace reachable by any id that happens to
collide; B makes collision structurally impossible and is the answer you would want long-term
anyway. It renames every mod's translation keys, so it is only cheap while we own all the mods —
that window closes at release. Doing both means a bad id is rejected *and* cannot reach app
strings even if the check is ever loosened.

**A resolved.** `isValidModId` (`src/mods/modId.ts`) holds the pattern, kept identical to the
registry's `registry.schema.json` so nothing can pass review and then be refused at install. It
is enforced in `fetchManifest` — the funnel every install path shares — and again in
`loadExternalMod`, before translations are merged. Tests in `src/tests/unit/mods/modId.test.ts`
and `loader.test.ts`.

**B deferred to the breaking batch.** Two things came out of scoping it that the estimate above
missed:

- *A already closes the hole.* Ids must contain `@` and none of the app's 11 namespaces do —
  now asserted by a test in `modId.test.ts`, so introducing an app namespace with an `@` fails
  CI instead of silently reopening it. B is defence-in-depth against the id check being
  loosened, not a fix for something still reachable.
- *The rename is larger and sharper than "medium".* `signRecord` + `registerModTranslations`, 61
  `$t('<id>.…')` call sites, **230** pre-signed i18n keys hardcoded in the built-in manifests,
  both example packages, an e2e fixture rebuild, the generator template, the docs, the four
  `fate-mods` mods, and a republish. The hazard: those same manifests hold **200** values of
  identical shape that are *data* ids, not i18n keys — `sonder@core-skills.athletics` is a skill
  id persisted inside saved characters. A blind find-and-replace corrupts user data, so this
  needs a field-aware script (rewrite only `name`/`description`/`tooltip`/`label`/`short`/`full`
  values) plus a read-through of the diff.

---

## High

### M3 — Blocked mods still execute; the registry base is writable state {#m3}

```86:92:src/main.ts
initMods().finally(() => {
	applyPersistedSkin()
	router.isReady().then(() => app.mount('#app'))
	// Registry index refresh is a pure background concern — never awaited,
	// never blocks boot. refreshIndex() itself never throws.
	refreshIndex()
})
```

Every enabled bundle is imported and evaluated *before* the blocklist is fetched. A mod
blocklisted for being malicious therefore gets a full execution window on every launch — the
kill switch only takes effect on the boot *after* a successful refresh, and refresh is
throttled to once an hour and silently no-ops offline.

Two related gaps:

- `setEnabled(id, true)` (`installService.ts:260`) never consults `row.blocked`, so a blocked
  mod can be re-enabled and stays enabled until the next successful refresh.
- `useRegistryBase` reads its base URL from `localStorage['registryBaseOverride']` with no
  Developer Mode gate at read time. That is same-origin state any mod can write. On the next
  boot, `registry.json`, the blocklist, and every hash pin come from that host.

**Options**

| | Approach | Cost |
| --- | --- | --- |
| **A (recommended)** | Refuse to load rows with `blocked: true` in `initMods` and `setEnabled`; clear the flag only on a successful update. | small |
| **B (recommended)** | Read the registry override only when Developer Mode is on, and ignore non-`https` overrides. | small |
| C | Compile a seed blocklist into the app so a release can kill a known-bad mod without a network round trip. | small |
| D | Await a timeout-bounded (2–3 s), cache-first blocklist fetch before importing any bundle. | medium; costs boot latency |
| E | Accept as a documented limitation. | free |

Recommend **A + B + C**. D only if you expect to actually need same-day revocation.

### M4 — The load-time hash check is self-consistency, not provenance {#m4}

```93:99:src/mods/loader.ts
	if (row.source !== 'dev') {
		const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(row.bundleCode))
		const hex = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
		if (hex !== row.sha256) {
			throw new Error('bundle hash mismatch — possible tampering, refusing to load')
		}
	}
```

Both operands come from the same IndexedDB row. Anything with same-origin access — that is, any
installed mod — can rewrite `bundleCode` and `sha256` together and pass. The check is a
storage-corruption detector, not a tampering detector. The real provenance check is the
registry index comparison at install time (`installService.ts:368`), which is genuinely good.
`docs/MOD_API.md` §8 currently implies the load-time check defends against a hostile mod.

**Options**

| | Approach | Cost |
| --- | --- | --- |
| **A (recommended)** | Re-verify registry-sourced rows against the cached index's pinned hash at load, not just at install. | small |
| B | Sign `registry.json` and ship a public key in the app — real provenance, and the prerequisite for ever accepting mods you do not review by hand. | large |
| **C (recommended)** | Fix the wording in `MOD_API.md` §8 and the code comment. | trivial |

### M5 — No CSP: unrestricted exfiltration surface {#m5}

There is no `Content-Security-Policy` in `index.html` and none in the Capacitor configuration.
Mod bundles execute with full `fetch`/`WebSocket`/`sendBeacon` access, in a document holding
every character the user has. The registry repo's eslint tiers warn on network globals in
reviewed source, but install-from-URL and dev mode bypass review entirely, and any minifying
transform defeats a source-level lint.

The realistic threat is not the curated registry — it is the install-from-URL path, which is
exactly the one with no review, and which a Discord message can talk a user through.

**Options**

| | Approach | Cost |
| --- | --- | --- |
| **A (recommended)** | Add a CSP keeping `script-src 'self' blob:` (required by the blob-URL loader) and restricting `connect-src` to `'self'` + the registry host. No mod needs network today; granting it later is easy, taking it away is not. | medium |
| B | Manifest-declared network permission enforced by a wrapped `fetch`. Advisory only without CSP — the raw global is always reachable. | medium |
| C | Leave open, document loudly. | free |

Caveat worth deciding on explicitly: a static CSP cannot be relaxed at runtime, so dev mode
(`http://localhost:5199`) and the registry-base override need `connect-src` entries of their
own, which weakens the policy on release builds unless you ship a separate dev CSP. Also worth
weighing the App Store / Play angle — remote code execution with unrestricted network is the
first thing a reviewer asks about.

### M6 — `Object.freeze(FateSDK)` does not prevent reassignment {#m6}

```70:72:src/mods/sdk.ts
export function installFateSDK(): void {
	globalThis.FateSDK = Object.freeze({
		version: SDK_VERSION,
```

The object is frozen; the *binding* is a plain writable global, and `loadFullIconset`,
`loadDiceLibs`, and `loadSharedComponents` all reassign it. The first mod loaded can replace
`globalThis.FateSDK` with a proxy and observe or alter everything every later-loaded mod does,
including `setModData` writes and toast contents. Since load order is `modsService.getAll()`
order, this is not even hard to win.

**Options**

| | Approach | Cost |
| --- | --- | --- |
| **A (recommended)** | Keep a module-scoped object as the source of truth and expose it via `Object.defineProperty(globalThis, 'FateSDK', { get, configurable: false })`; the lazy loaders mutate the internal object. No ABI change. | small |
| B | Inject the SDK per-mod instead of globally (mod-build shim reads a local binding). Real isolation, but an SDK major. | large |
| C | Accept — mods are trusted anyway. | free |

### M7 — Dev mods are permanent, unverified, and can clobber a real install {#m7}

`loadDevMod` writes a full `StoredMod` row with `source: 'dev'` via `modsService.put`
(`devMode.ts:73`), with no check for an existing row. Connecting a dev server that reports id
`sonder@dice-d6` overwrites the registry-installed copy — bundle, hash, `sourceUrl`, and
`source` — destroying its provenance and its update path.

The row then survives forever. `loadExternalMod` reads `row.bundleCode` and never re-fetches,
so at the next boot the dev row loads successfully from IndexedDB and this branch never fires:

```57:64:src/mods/loader.ts
			if (row.source === 'dev') {
				// A dev-mod row surviving to next boot almost always means the dev
				// server is no longer running — that's normal, not an error worth
				// a scary persistent quarantine entry. Drop it silently; reconnect
				// via Settings -> Developer Mode when the server is back.
				console.warn(`[mods] dev mod "${row.id}" unreachable at boot, dropping`, e)
				await modsService.delete(row.id).catch(() => {})
				continue
```

Net effect: an unreviewed dev build stays installed indefinitely, permanently exempt from the
hash check (`row.source !== 'dev'`), and the Installed tab offers it an Update button pointed
at a LAN address.

**Options**

| | Approach | Cost |
| --- | --- | --- |
| **A (recommended)** | Do not persist dev mods at all — session-only in `ModRegistry`. They are re-fetched on connect anyway. | small |
| B | Persist, but delete every `source: 'dev'` row at the start of `initMods`. | trivial |
| C | Keep persistence; refuse `put` when an existing row has a different `source`, and re-fetch dev rows at boot behind a short timeout. | medium |

**A** matches the mental model developers already have and removes the clobbering case with it.
If you keep persistence, C's source-conflict guard is mandatory.

### M8 — `installModule` ignores the incompatible-patch abort {#m8}

`updateModule` deletes the module from the character and returns `false` when a patch is marked
`incompatible` (`updateModules.ts:31-37`). The caller throws the result away:

```72:76:src/modules/utils/installModules.ts
	if (module.version !== character._modules[module.id].version) {
		await updateModule(context, character, module.id, character._modules[module.id])
	}

	await module.onInstall(context, character)
```

So `onInstall` re-seeds the module's data and the module goes live in `context.modules` while
`_modules` no longer lists it. The sheet renders a section for a module the character does not
have, and the entry is dropped again on the next load — an unstable state the user cannot see
or fix.

**Options**: **A (recommended)** — honour the return value: skip `onInstall` and the context
merge when it is `false`. B — throw and let `useFate`'s revert handle it (louder, but reverts
the entire character load). Either way, add a regression test; this is a two-line fix.

### M9 — Orphaned mod data is never cleaned up {#m9}

Mod data is arbitrary top-level fields on the character (`setModData`, `mod-types/src/bundle.ts:41`),
removed only by the mod's own `onUninstall`. When the mod is errored, disabled, or not installed
on this device, `remove()`'s manifest lookup yields a stub with no hooks
(`installService.ts:237`, `loader.ts:134`) and the data is orphaned permanently — including in
every `.fchar` export. There is no UI to inspect or purge it.

Separately, `setModData(character, key, value)` accepts *any* key. A mod can overwrite `name`,
`avatar`, `_modules`, or another mod's slice, deliberately or by typo.

**Options**

| | Approach | Cost |
| --- | --- | --- |
| **A (recommended, do now)** | Enforce the `<modId>.` key prefix inside `setModData`/`getModData`. One-line SDK change — and a breaking one if deferred past release. | small |
| B | Prompt on removal ("also delete this mod's character data?") and delete prefixed keys. Depends on A. | small |
| C | Declare owned keys in the manifest (`dataKeys`) and use that for cleanup. | medium |
| D | Keep data forever, document it as intentional (safe for re-install), add a manual purge in Settings. | small |

A is the item with the shortest window. It is free today — our four mods each write one key and
would need a one-line change plus a republish — and it becomes a major bump the moment someone
else's mod is published against an unprefixed `setModData`. Taking A also makes B a few lines
instead of a design problem, since "this mod's data" becomes mechanically knowable.

### M10 — `remove()` runs `onUninstall` with an empty context {#m10}

```21:29:src/mods/installService.ts
function emptyFateContext(): FateContext {
	return {
		modules: {},
		constants: clone(constants),
		components: [],
		templates: clone(templates),
		shared: {}
	}
}
```

A mod whose `onUninstall` reads `context.modules[...]` or another mod's `shared` slice throws.
The throw escapes the per-character loop (`installService.ts:234-250`), so removal aborts with
some characters already mutated, the mod still installed, and no rollback. The write-back path
also uses the JSON-based `clone` (`clone.ts:20`), which turns other mods' `Date` values into
strings and drops `undefined` — collateral corruption on an unrelated mod's data.

**Options**: **A (recommended)** build the real context per character (the path
`changeCharacterModules` already uses), or at minimum catch per character and report which ones
failed. **B (recommended)** use `safeClone` for the character write-back. C — wrap the loop in a
Dexie transaction so a mid-way failure rolls back.

---

## Medium

### M11 — Bundles without `capabilities` skip component validation {#m11}

`validateBundleShape` only checks `components` when the manifest declares `sheetComponents`
(`validateBundleShape.ts:28`), while `getSheetModules()` treats a manifest with *no*
capabilities as a sheet module for backwards compatibility (`getSheetModules.ts:11`). Malformed
components on a legacy-style mod reach the renderer unvalidated.

**Options**: **A (recommended)** validate `components` whenever present, regardless of
capabilities. **B (recommended)** make `capabilities` mandatory at load — the docs already call
it required, every existing mod declares it, and the "no capabilities means sheet module" compat
branch only exists for 1.x built-ins that are now assembled the same way as everything else.
There is no reason to carry that branch past release.

### M12 — Downgrades run forward-only patches {#m12}

`changeRegistryVersion` accepts any published version, and `updateModule` fires on any
`semver.neq` (`updateModules.ts:28`). Going backwards, `getPatches` finds nothing newer than the
older bundle's own version, so no migration runs, `_modules[id].version` is silently rewritten
downward, and the character keeps a data shape the older code does not understand.

**Options**: **A (recommended)** warn explicitly in the version picker and require confirmation
before writing a lower version. B — add `down` migrations to `FatePatch` (SDK minor). C — refuse
downgrades for mods in use on a character.

### M13 — URL updates: permanent badge, no confirmation {#m13}

`updateAvailable: stored.source === 'url'` (`ModStoreInstalledTab.vue:46`) means every URL mod
shows "Update" forever, and pressing it fetches and executes whatever that URL serves now — no
typed confirmation, no version diff. The deliberate friction of install-from-URL is a one-time
toll.

**Options**: A — check the remote manifest version before showing the badge. B — show old → new
version and re-confirm on URL updates. **Recommend both.**

### M14 — Registry installs verify two files out of N {#m14}

`fetchRegistryRelease` hash-checks `manifest.json` and the entry bundle
(`installService.ts:389-422`); `fetchBundleAndTranslations` fetches translation files with no
verification and they are merged into i18n. The index pins them all already.

**Option**: **A (recommended)** verify every fetched file against `release.files`. Small.

### M15 — No install-time size or count limits {#m15}

`manifestChecks` enforces 1 MB soft / 3 MB hard at *author build* time only; the app enforces
nothing. A URL install streams an arbitrary body into IndexedDB, and quota failures surface as
generic save errors.

**Options**: **A (recommended)** check `Content-Length` and abort past the hard limit, enforcing
the same cap on the stored bundle. B — cross-check `size` from the registry index.
**C (recommended)** handle `QuotaExceededError` with a real message and a way out.

### M16 — `isSaneIndex` validates three fields {#m16}

```59:63:src/mods/registryClient.ts
function isSaneIndex(value: unknown): value is RegistryIndex {
	if (!value || typeof value !== 'object') return false
	const candidate = value as Record<string, unknown>
	return typeof candidate.schemaVersion === 'number' && Array.isArray(candidate.mods) && typeof candidate.blocklist === 'object' && candidate.blocklist !== null
}
```

Consumers then trust `entry.tags.some(...)`, `entry.strings`, `entry.files`, `entry.releases`. A
partially written or malformed `registry.json` crashes the Browse tab, and the bad copy is
cached and replayed at every boot.

**Options**: **A (recommended)** validate entries defensively and drop malformed ones.
**B (recommended)** gate on `schemaVersion` — refuse indexes newer than the app understands;
that is the forward-compatibility lever you will want later. C — validate with Ajv against the
vendored `registry.schema.json` (heavier bundle).

### M17 — In-session mod changes are half-applied {#m17}

Install/remove/enable flips `ModRegistry` immediately, but: `getSheetModules()` is captured at
setup in `CharacterConfiguration.vue`; an imported bundle can never be unloaded
(`importBlobModule`); `useSkins.getSkinRecords()` does not filter on `status`, so a mod disabled
mid-session keeps its CSS injected; and `remove()` leaves the mod's timers and listeners
running. The only signal is the passive footer in the Mod Store.

**Options**: **A (recommended)** treat reload as mandatory — prompt to reload right after any
install/remove/enable/disable rather than offering a banner the user can ignore.
**C (recommended)** filter skins on `status === 'loaded'` and re-read `getSheetModules()`
reactively. B — make it genuinely correct in-session (unload API, reactive registry); note that
unloading a JS module is not actually possible, so B can never be complete.

### M18 — Serialized mod imports with no timeout block `app.mount()` {#m18}

`initMods` awaits each mod in sequence (`loader.ts:44-74`) and the app mounts only afterwards. A
bundle with a hanging top-level import wedges the app on the splash screen with no recovery —
the user cannot even reach Settings to disable it. `onInstall` hooks are similarly unbounded
during character load.

**Options**: **A (recommended)** race each mod's load against a timeout (~5 s) and quarantine on
expiry. B — `Promise.allSettled` for parallel loads (faster boot; load order stops being
deterministic). C — mount first, load mods after, gate sheet rendering on a ready flag (best UX,
largest change).

### M19 — `appVersion` is ignored for app-level mods {#m19}

It is enforced only inside `resolveModules` (`resolveModules.ts:130`), which runs for character
modules. A `dice` or `theme` mod's `appVersion` is checked against the registry index at install
(`isRegistryReleaseCompatible`) and never again — and never at all for URL/dev installs. After
an app update, an incompatible dice mod simply loads.

**Option**: **A (recommended)** check `appVersion` in `loadExternalMod`, next to the `sdk` gate.

### M20 — `sdk` is documented as required but optional at runtime {#m20}

```86:88:src/mods/loader.ts
	if (typeof manifest.sdk === 'string' && !semver.satisfies(SDK_VERSION, manifest.sdk)) {
		throw new Error(`requires mod-API ${manifest.sdk}, app provides ${SDK_VERSION}`)
	}
```

A mod omitting `sdk` loads on any app version, across ABI majors included.

**Option**: **A (recommended)** require it for external mods; quarantine without it. Only breaks
mods that should not exist.

---

## Low

### M21 — Manifest-derived values reach `Object.assign` {#m21}

`installModule` merges `module.constants` / `module.templates` into the shared context with
`Object.assign` (`installModules.ts:60-67`). Those can originate in `manifest.json`, and
`JSON.parse` does create an own `__proto__` property. Low exploitability (mods run code anyway),
but it is a free fix that also protects the manifest-only rendering paths.

**Options**: A — strip `__proto__`/`constructor`/`prototype` when parsing manifests. B —
`Object.create(null)`-backed context objects.

### M22 — Config values are never validated against the declared schema {#m22}

`ModuleConfigOption.vue` applies `limits`/`options` as HTML attributes only; imported `.fchar` /
`.fmod` config is checked for "is an object" and nothing else
(`character.service.ts` → `#validateModules`). Mods receive arbitrary values in `onInstall` /
`onReconfigure` and typically use them as array lengths or indices.

**Option**: **A (recommended)** one coercion/validation function against the declared option
types and limits, reused by the config UI and by import.

### M23 — No locking around install/update {#m23}

`ModRegistry` is a plain Map and the install path is check-then-write (`modsService.get` → `put`).
Two concurrent actions on the same id — Browse tab plus Installed tab, or an SSE dev reload
racing a manual update — interleave freely. Rare, but the failure mode is a stored row that
disagrees with the registry entry.

**Option**: **A (recommended)** a small per-id promise queue in `installService`.

---

## Optional additions

### M24 — Character import does not reconcile mods {#m24}

`_modules` is structurally validated but never checked against installed mods; a missing mod
produces a toast only if it happens to be in the cached registry index. The natural feature is a
"this character needs 3 mods you do not have — install them?" flow with a batch registry
install, plus a version-drift warning. It is also the right place to refuse ids that are not in
the registry, which closes a social-engineering path.

### M25 — Theme CSS is not inert {#m25}

`useSkins` injects raw CSS into `<head>`. CSS can exfiltrate via attribute selectors plus
`background: url(...)`, spoof UI, and hide destructive buttons. The 100 KB cap addresses bloat,
not safety, and the code comment ("raw CSS can't execute script") reads as a safety claim.

**Options**: A — review theme submissions as code and correct the comment. B — sanitize
(`@import` and non-`data:` `url()` stripped). C — CSP `style-src`/`img-src` (overlaps M5).
Recommend **A + B**.

### M26 — `translations` capability is published but unimplemented {#m26}

The capability and `translationTargets` exist in the published types; nothing merges them. Either
implement it or remove it from `@fate-app/mod-types`. Removal is free until an author declares
it, and a major bump afterwards — so this is a decision to take before release, not a backlog
item. Removing now and re-adding later as a minor is the cheaper order.

### M27 — `onInstall` idempotency is unenforced {#m27}

The documented rule is load-bearing (the failure mode wipes user data on every load, and it
already bit `example-mod` once). CI could call `onInstall` twice against a fixture character in
`smoke-load` and diff the result — that catches the entire class mechanically.

### M28 — Registry CI gaps {#m28}

- `validate.ts:88` still takes `[...modIds][0]`, so a `multi-mod`-labelled PR validates,
  builds, and smoke-loads only the first mod. (Already noted in `planning/outstanding`.)
- The security lint applies to `mods/*/src/**` and `mods/*/bundle.ts` only. A mod placing code
  in any other path inside its folder is linted by the base config, without the eval / dynamic
  import / minified-source rules.
- Nothing checks that the published `dist/bundle.mjs` corresponds to the reviewed source beyond
  "CI built it" — which is the right design; worth stating explicitly in `SUBMITTING.md` so it
  is not weakened later by accepting author-supplied artifacts.

### M29 — No per-mod error boundary, no diagnostics {#m29}

A mod component that throws during render is caught by the global handler as a generic toast; the
sheet can be left broken with no attribution. An `onErrorCaptured` boundary around each rendered
mod section — showing "this section failed, disable the mod?" — plus a diagnostics screen listing
load errors and quarantine reasons would make user-reported issues tractable.

---

## What is good (do not regress)

- **Gate ordering in `loadExternalMod`.** ABI check before any code executes, then integrity,
  then import, then shape. That is the correct sequence and it is documented in place.
- **Boot never throws.** Quarantine over crash, plus the `.finally` mount fallback in `main.ts`.
  A broken mod cannot brick the app (M18's hang is the one exception).
- **One `assembleMod` for built-ins and external mods.** Built-ins are genuinely the same code
  path, which is why the whole system is testable at all. Keep this invariant.
- **`validateBundleShape` shared between the app and the registry's CI.** Structurally prevents
  the two gates from drifting.
- **Lazy SDK payloads.** Icons, three/cannon-es, and `SheetSection` load only when a mod actually
  needs them; users with no external mods pay nothing.
- **Registry install path.** Hash pinning against the index, the publish-time immutability guard,
  CI-built artifacts, ownership and version-monotonicity checks, tiered security lint.
- **Update semantics.** `update()` validates the new bundle before overwriting the stored row;
  `installFromUrl` rolls the row back on failure. Both directions are right.
- **Provenance is stored and surfaced.** `source` / `sourceUrl` per row, distinct badges in the
  Installed tab.
- **`docs/MOD_API.md`** is unusually complete for an API this young — including the honest
  warnings about `onInstall` idempotency and Tailwind.

---

## Suggested sequencing

**Before the API freezes (breaking later, free now)**

The freeze point is the Mod Store's public release, not the 2.0.0 tag. Everything here is a
change to the author-facing contract; each costs a one-line edit and a republish across our four
mods today, and an SDK major after someone else publishes. Best taken as one batch, with a
single co-ordinated republish.

- [x] M1 — whitelist bundle keys in `assembleMod`
- [x] M2 (A) — validate the mod id format at install and at load
- [ ] M2 (B) — move mod messages under a `mods.` root (field-aware rename; see M2 for the
      data-id hazard)
- [ ] M9 (A) — enforce the `<modId>.` prefix in `setModData`/`getModData`
- [ ] M11 (B) — make `capabilities` mandatory, drop the "no capabilities" compat branch
- [ ] M26 — implement or remove the `translations` capability
- [ ] M20 — require `sdk`

**Before shipping 2.0 (correctness and data safety)**

- [ ] M7 — stop persisting dev mods
- [ ] M8 — honour the incompatible-patch abort
- [ ] M10 — real context + `safeClone` in `remove()`
- [ ] M6 — non-reassignable `FateSDK`
- [ ] M3 (A, B) — refuse blocked rows at load; gate the registry override
- [ ] M11 (A) — always validate `components`
- [ ] M19 — enforce `appVersion` at load

**Decisions to make deliberately (not code, policy)**

- [ ] M5 — CSP: adopt now, or accept the open network surface and document it
- [ ] M4 — provenance: cached-index re-verification now, signed index later, or neither
- [ ] M17 — mandatory reload after mod changes, or invest in in-session correctness

**2.0.x / 2.1**

- [ ] M12, M13, M14, M15, M16, M18, M21, M22, M23

**Backlog**

- [ ] M24, M25, M27, M28, M29
