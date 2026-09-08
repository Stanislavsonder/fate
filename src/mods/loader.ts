import * as semver from 'semver'
import { ModRegistry } from './modRegistry'
import { assembleMod } from './assembleMod'
import { signRecord } from '@/modules/utils/localizationSigners'
import { registerModTranslations } from './registerModTranslations'
import { registerBuiltinMods } from './builtins'
import { importBlobModule } from './importBlobModule'
import { isSeedBlocked } from './blocklist'
import { getIndex, getRegistryRelease, type RegistryIndex } from './registryClient'
import { invalidModIdMessage, isValidModId } from './modId'
import { modsService, type StoredMod } from '@/db/tables/mods'
import { SDK_VERSION, loadFullIconset, loadDiceLibs, loadSharedComponents } from './sdk'
import { validateBundleShape, type FateModuleManifest } from '@fate-app/mod-types'

function registerDisabledMod(row: StoredMod): void {
	try {
		registerModTranslations(row.id, JSON.parse(row.translationsJson || '{}'))
	} catch {
		// Malformed stored translations — name display falls back to the raw id.
	}
	ModRegistry.register({
		manifest: safeManifest(row),
		source: row.source,
		status: 'disabled'
	})
}

/** Marks a row blocked in memory and in storage, so the Installed tab can
 * explain why it is off and the state survives to the next launch. */
async function blockRow(row: StoredMod): Promise<void> {
	row.blocked = true
	row.enabled = false
	try {
		await modsService.setBlocked(row.id, true)
		await modsService.setEnabled(row.id, false)
	} catch (e) {
		console.error(`[mods] failed to persist the blocked state of "${row.id}"`, e)
	}
}

/**
 * Registers built-ins, then every stored external mod. Enabled rows are loaded
 * through the usual gates; disabled rows are registered as display-only stubs
 * so character load can tell "installed but off" from "missing". Never throws
 * outward: a mod that fails any gate is quarantined (status: 'errored') rather
 * than blocking startup — see loadExternalMod. Call once from main.ts, before
 * app.mount().
 */
export async function initMods(): Promise<void> {
	registerBuiltinMods()

	let rows: StoredMod[]
	try {
		rows = await modsService.getAll()
	} catch (e) {
		console.error('[mods] failed to read installed mods from storage', e)
		return
	}

	for (const row of rows) {
		// The registry blocklist only lands after boot (registryClient.refreshIndex),
		// so the persisted flag and the compiled-in seed list are what stop a
		// blocked mod from getting one more execution window per launch.
		if (isSeedBlocked(row.id, row.version)) {
			await blockRow(row)
		}

		if (!row.enabled || row.blocked) {
			registerDisabledMod(row)
			continue
		}

		try {
			const manifest = await loadExternalMod(row)
			ModRegistry.register({ manifest, source: row.source, status: 'loaded' })
			console.info(
				`[mods] loaded "${row.id}"@${row.version} (${row.source}, sdk range ${JSON.parse(row.manifestJson).sdk ?? 'unspecified'}, app SDK ${SDK_VERSION})`
			)
		} catch (e) {
			if (row.source === 'dev') {
				// A dev-mod row surviving to next boot almost always means the dev
				// server is no longer running — that's normal, not an error worth
				// a scary persistent quarantine entry. Drop it silently; reconnect
				// via Settings -> Developer Mode when the server is back.
				console.warn(`[mods] dev mod "${row.id}" unreachable at boot, dropping`, e)
				await modsService.delete(row.id).catch(() => {})
				continue
			}
			console.error(`[mods] failed to load "${row.id}"`, e)
			ModRegistry.register({
				manifest: safeManifest(row),
				source: row.source,
				status: 'errored',
				error: e instanceof Error ? e.message : String(e)
			})
		}
	}
}

async function sha256Hex(text: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
	return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * Compares a registry mod's stored bundle against the hash the registry
 * published for that exact version, which install-time verification checked
 * once and nothing has re-checked since.
 *
 * The pin lives in the cached index, which is same-origin state too — but
 * every successful refresh overwrites it wholesale from the network, so
 * rewriting a mod's row survives at most until the next refresh and then
 * quarantines it for good. Absence of a pin is not suspicious (no cache yet on
 * a first offline boot, an unpinned older release in a schema-v1 cache), so it
 * skips rather than refuses.
 */
async function verifyRegistryPin(row: StoredMod, manifest: Record<string, unknown>, hash: string): Promise<void> {
	let index: RegistryIndex | null
	try {
		index = (await getIndex()).index
	} catch (e) {
		console.warn(`[mods] could not read the registry index to re-verify "${row.id}"`, e)
		return
	}

	const entry = index?.mods.find(mod => mod.id === row.id)
	const release = entry ? getRegistryRelease(entry, row.version) : null
	const pinned = release?.files[typeof manifest.entry === 'string' ? manifest.entry : 'bundle.mjs']
	if (pinned && pinned.sha256 !== hash) {
		throw new Error('stored bundle does not match the hash the registry published for this version — refusing to load')
	}
}

/**
 * Loads a single stored mod through the ABI, integrity, import, and shape
 * gates and assembles it exactly like a built-in. Exported so installService
 * (install/update/retry) can reuse the same path without duplicating it.
 */
export async function loadExternalMod(row: StoredMod): Promise<FateModuleManifest> {
	const manifest = JSON.parse(row.manifestJson) as Record<string, unknown>

	// 0. Identity — the stored manifest must be the one this row is keyed by,
	// and that id must be namespace-safe, since translations are merged into
	// i18n under it a few steps below.
	if (manifest.id !== row.id) {
		throw new Error(`manifest id "${String(manifest.id)}" does not match the installed id "${row.id}"`)
	}
	if (!isValidModId(row.id)) {
		throw new Error(invalidModIdMessage(row.id))
	}

	// 1. ABI gate — refuse before executing anything
	if (typeof manifest.sdk === 'string' && !semver.satisfies(SDK_VERSION, manifest.sdk)) {
		throw new Error(`requires mod-API ${manifest.sdk}, app provides ${SDK_VERSION}`)
	}

	// 2. Integrity — recompute the hash of the code we're about to run. Skipped
	// for dev-mode mods: WebCrypto requires a secure context and dev servers
	// are plain http:// on the LAN (see src/mods/devMode.ts).
	if (row.source !== 'dev') {
		const hex = await sha256Hex(row.bundleCode)
		// Both operands live in the same IndexedDB row, so this alone only
		// detects corruption — anything that can rewrite the code can rewrite
		// the hash beside it. verifyRegistryPin is what turns it into a
		// tampering check for registry mods.
		if (hex !== row.sha256) {
			throw new Error('stored bundle does not match its stored hash — refusing to load')
		}
		if (row.source === 'registry') {
			await verifyRegistryPin(row, manifest, hex)
		}
	}

	// 3. Import (decision D1 — blob URL + native dynamic import). FateSDK.ionicons
	// is upgraded to the full icon set first (a no-op after the first call — the
	// dynamic import resolves from cache) so any external bundle can rely on it.
	// Dice-capability bundles additionally need FateSDK.dice populated BEFORE
	// import: mod-build's shims read globalThis.FateSDK.dice.three/cannonEs at
	// module-evaluation time, so an empty FateSDK.dice makes the import itself
	// throw.
	await loadFullIconset()
	if (Array.isArray(manifest.capabilities) && manifest.capabilities.includes('dice')) {
		await loadDiceLibs()
	}
	if (Array.isArray(manifest.capabilities) && manifest.capabilities.includes('sheetComponents')) {
		await loadSharedComponents()
	}
	const bundle: unknown = await importBlobModule(row.bundleCode)

	// 4. Shape validation — before anything (translations, the sheet) trusts it
	validateBundleShape(bundle, manifest.capabilities as FateModuleManifest['capabilities'])

	// 5. Assemble exactly like built-ins + merge translations. The identity
	// re-check is a tripwire on assembleMod's allowlist, not a second gate.
	registerModTranslations(manifest.id as string, JSON.parse(row.translationsJson || '{}'))
	const assembled = assembleMod(manifest, bundle)
	if (assembled.id !== row.id) {
		throw new Error(`assembled manifest id "${assembled.id}" does not match the installed id "${row.id}"`)
	}
	return assembled
}

/**
 * Best-effort manifest for a quarantined mod — display-only, never used for
 * resolution. Exported so installService can build the same fallback when an
 * enable/retry attempt fails outside of initMods()'s own loop. Signed exactly
 * like assembleMod()'s success path (the stored manifestJson is the raw,
 * unsigned manifest.json — "t.name", not "<id>.name") so callers can always
 * pass `.name`/`.description` straight through `$t()` regardless of whether
 * the mod loaded successfully.
 */
export function safeManifest(row: StoredMod): FateModuleManifest {
	try {
		const parsed = JSON.parse(row.manifestJson) as Record<string, unknown>
		const signed = signRecord(parsed, (parsed.id as string) ?? row.id)
		return { ...signed, id: signed.id ?? row.id, version: signed.version ?? row.version } as unknown as FateModuleManifest
	} catch {
		return { id: row.id, version: row.version } as unknown as FateModuleManifest
	}
}
