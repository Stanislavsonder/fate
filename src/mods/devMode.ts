import { ModRegistry } from './modRegistry'
import { loadExternalMod } from './loader'
import { fetchManifest, fetchBundleAndTranslations } from './installService'
import { modsService, type StoredMod } from '@/db/tables/mods'
import useCharacter from '@/store/useCharacter'

export type DevConnectOutcome = { ok: true; id: string } | { ok: false; error: string }

/** One live EventSource per connected dev mod id — closed on disconnect or on reconnecting to a different id. */
const connections = new Map<string, EventSource>()

function errorMessage(e: unknown): string {
	return e instanceof Error ? e.message : String(e)
}

function trimTrailingSlash(url: string): string {
	return url.replace(/\/+$/, '')
}

/**
 * Fetches + loads a mod from a dev server and opens an EventSource to
 * `<baseUrl>/events` for hot-reimport on rebuild. No hash check (dev servers
 * are plain http:// on the LAN, where WebCrypto is unavailable — see
 * loader.ts). Reconnecting to an id that's already connected replaces the
 * old EventSource.
 */
export async function connectDevMod(baseUrl: string): Promise<DevConnectOutcome> {
	const result = await loadDevMod(baseUrl)
	if (!result.ok) {
		return result
	}

	const { id } = result
	disconnectDevMod(id)

	const source = new EventSource(`${trimTrailingSlash(baseUrl)}/events`)
	source.onmessage = () => {
		reloadDevMod(baseUrl, id).catch(e => console.error(`[mods] dev hot-reload failed for "${id}"`, e))
	}
	source.onerror = () => {
		console.warn(`[mods] dev server connection lost for "${id}" (${baseUrl})`)
	}
	connections.set(id, source)

	return { ok: true, id }
}

export function disconnectDevMod(id: string): void {
	connections.get(id)?.close()
	connections.delete(id)
}

export function isDevModConnected(id: string): boolean {
	return connections.has(id)
}

async function loadDevMod(baseUrl: string): Promise<DevConnectOutcome> {
	const fetchedManifest = await fetchManifest(baseUrl)
	if (!fetchedManifest.ok) {
		return { ok: false, error: fetchedManifest.error }
	}

	const id = fetchedManifest.data.id as string
	if (ModRegistry.get(id)?.source === 'builtin') {
		return { ok: false, error: `"${id}" conflicts with a built-in mod` }
	}
	// A dev build must never shadow a real install: the stored copy keeps its
	// provenance and update path only if nothing loads over it.
	if (await modsService.get(id)) {
		return { ok: false, error: `"${id}" is installed — remove it before connecting a dev build of it` }
	}

	const fetched = await fetchBundleAndTranslations(baseUrl, fetchedManifest.data)
	if (!fetched.ok) {
		return { ok: false, error: fetched.error }
	}

	const now = Date.now()
	const row: StoredMod = {
		id,
		version: fetched.data.manifest.version as string,
		source: 'dev',
		enabled: true,
		manifestJson: JSON.stringify(fetched.data.manifest),
		bundleCode: fetched.data.bundleCode,
		translationsJson: fetched.data.translationsJson,
		sha256: fetched.data.sha256,
		sourceUrl: baseUrl,
		installedAt: now,
		updatedAt: now
	}

	// Session-only: dev builds are never persisted. They are unreviewed and
	// skip the hash check, so they must not outlive the connection that
	// vouches for them — reconnect via Settings -> Developer Mode after a reload.
	try {
		const manifest = await loadExternalMod(row)
		ModRegistry.register({ manifest, source: 'dev', status: 'loaded' })
		return { ok: true, id }
	} catch (e) {
		return { ok: false, error: errorMessage(e) }
	}
}

/**
 * Re-fetches and reloads a connected dev mod (called on each SSE rebuild
 * ping), then hot-reimports it into any currently open character that has it
 * installed, via the existing reconfigureCharacter store action — the same
 * uninstall -> reinstall flow the "Save modules configuration" UI already
 * uses, which rebuilds the whole context from the (now updated) ModRegistry.
 * Not real HMR — the old component/module objects are simply abandoned.
 *
 * Deliberately NOT `useFate().changeCharacterModules(characterStore.character, ...)`
 * directly: that call site (reconfigureCharacter in useCharacter.ts) always
 * passes a freshly DB-fetched plain object, never the live reactive Pinia
 * store proxy — passing the proxy directly throws
 * `DataCloneError: ... could not be cloned` from changeCharacterModules'
 * internal `structuredClone(character)` backup.
 */
async function reloadDevMod(baseUrl: string, id: string): Promise<void> {
	const result = await loadDevMod(baseUrl)
	if (!result.ok) {
		console.error(`[mods] dev hot-reload failed for "${id}": ${result.error}`)
		return
	}

	const characterStore = useCharacter()
	const character = characterStore.character
	if (character?.id !== undefined && id in character._modules) {
		await characterStore.reconfigureCharacter(character.id, character._modules)
	}
}
