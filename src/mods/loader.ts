import * as semver from 'semver'
import { ModRegistry } from './modRegistry'
import { assembleMod } from './assembleMod'
import { signRecord } from '@/modules/utils/localizationSigners'
import { registerModTranslations } from './registerModTranslations'
import { registerBuiltinMods } from './builtins'
import { importBlobModule } from './importBlobModule'
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
		if (!row.enabled) {
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

/**
 * Loads a single stored mod through the ABI, integrity, import, and shape
 * gates and assembles it exactly like a built-in. Exported so installService
 * (install/update/retry) can reuse the same path without duplicating it.
 */
export async function loadExternalMod(row: StoredMod): Promise<FateModuleManifest> {
	const manifest = JSON.parse(row.manifestJson) as Record<string, unknown>

	// 1. ABI gate — refuse before executing anything
	if (typeof manifest.sdk === 'string' && !semver.satisfies(SDK_VERSION, manifest.sdk)) {
		throw new Error(`requires mod-API ${manifest.sdk}, app provides ${SDK_VERSION}`)
	}

	// 2. Integrity — recompute the hash of the code we're about to run. Skipped
	// for dev-mode mods: WebCrypto requires a secure context and dev servers
	// are plain http:// on the LAN (see src/mods/devMode.ts).
	if (row.source !== 'dev') {
		const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(row.bundleCode))
		const hex = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
		if (hex !== row.sha256) {
			throw new Error('bundle hash mismatch — possible tampering, refusing to load')
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

	// 5. Assemble exactly like built-ins + merge translations
	registerModTranslations(manifest.id as string, JSON.parse(row.translationsJson || '{}'))
	return assembleMod(manifest, bundle)
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
