import semver from 'semver'
import { ModRegistry } from './modRegistry'
import { loadExternalMod, safeManifest } from './loader'
import { SDK_VERSION } from './sdk'
import { getIndex, isEntryPublished, type RegistryFileEntry, type RegistryModEntry, type RegistryReleaseEntry } from './registryClient'
import { modsService, type StoredMod } from '@/db/tables/mods'
import characterService from '@/service/character.service'
import useRegistryBase from '@/composables/useRegistryBase'
import appVersion from '@/utils/helpers/appVersion'
import { markModReloadRequired } from '@/mods/reloadState'
import type { FateModuleManifest } from '@fate-app/mod-types'

export type InstallOutcome = { ok: true; manifest: FateModuleManifest } | { ok: false; error: string }
export type SimpleOutcome = { ok: true } | { ok: false; error: string }
export type RemoveOutcome = { ok: true } | { ok: false; reason: 'blocked'; characterNames: string[] } | { ok: false; reason: 'error'; error: string }

function errorMessage(e: unknown): string {
	return e instanceof Error ? e.message : String(e)
}

export interface FetchedModFiles {
	manifest: Record<string, unknown>
	bundleCode: string
	translationsJson: string
	sha256: string
}

export type FetchResult<T> = { ok: true; data: T } | { ok: false; error: string }

/** Exported for reuse by devMode.ts, which needs the same fetch logic tagged `source: 'dev'` instead of persisted through installFromUrl's built-in/duplicate checks. */
export async function fetchManifest(baseUrl: string): Promise<FetchResult<Record<string, unknown>>> {
	const url = baseUrl.replace(/\/+$/, '')
	try {
		const res = await fetch(`${url}/manifest.json`)
		if (!res.ok) {
			throw new Error(`manifest.json request failed (${res.status})`)
		}
		const manifest = (await res.json()) as Record<string, unknown>
		if (typeof manifest.id !== 'string' || typeof manifest.version !== 'string') {
			return { ok: false, error: 'manifest.json is missing required "id"/"version" fields' }
		}
		return { ok: true, data: manifest }
	} catch (e) {
		return { ok: false, error: `Could not fetch manifest: ${errorMessage(e)}` }
	}
}

/** Fetches the bundle + translations for an already-fetched, already-validated manifest. */
export async function fetchBundleAndTranslations(baseUrl: string, manifest: Record<string, unknown>): Promise<FetchResult<FetchedModFiles>> {
	const url = baseUrl.replace(/\/+$/, '')
	const entry = typeof manifest.entry === 'string' ? manifest.entry : 'bundle.mjs'

	let bundleCode: string
	try {
		const res = await fetch(`${url}/${entry}`)
		if (!res.ok) {
			throw new Error(`${entry} request failed (${res.status})`)
		}
		bundleCode = await res.text()
	} catch (e) {
		return { ok: false, error: `Could not fetch bundle: ${errorMessage(e)}` }
	}

	const languages = Array.isArray(manifest.languages) ? manifest.languages.filter((lang): lang is string => typeof lang === 'string') : []
	const translations: Record<string, unknown> = {}
	for (const lang of languages) {
		try {
			const res = await fetch(`${url}/translations/${lang}.json`)
			if (res.ok) {
				translations[lang] = await res.json()
			}
		} catch {
			// A missing/unreachable translation file is tolerated — the mod just isn't localized for that language.
		}
	}

	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(bundleCode))
	const sha256 = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')

	return { ok: true, data: { manifest, bundleCode, translationsJson: JSON.stringify(translations), sha256 } }
}

/**
 * Fetches just manifest.json's id — used by the UI to show a typed-
 * confirmation prompt (decision D10) before installFromUrl actually persists
 * or loads anything.
 */
export async function previewManifestId(baseUrl: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
	const fetched = await fetchManifest(baseUrl)
	return fetched.ok ? { ok: true, id: fetched.data.id as string } : { ok: false, error: fetched.error }
}

/**
 * Fetches a mod's manifest.json + bundle + translations from `baseUrl`,
 * stores it, and loads it. This phase's only install entry point — Phase 3
 * adds installFromRegistry. Refuses ids that collide with a built-in or an
 * already-installed mod (use update() instead).
 */
export async function installFromUrl(baseUrl: string): Promise<InstallOutcome> {
	const fetchedManifest = await fetchManifest(baseUrl)
	if (!fetchedManifest.ok) {
		return { ok: false, error: fetchedManifest.error }
	}

	const id = fetchedManifest.data.id as string

	// Checked before fetching the (potentially large) bundle — no point downloading
	// it just to reject the install for an id we already know conflicts.
	if (ModRegistry.get(id)?.source === 'builtin') {
		return { ok: false, error: `"${id}" conflicts with a built-in mod` }
	}
	if (await modsService.get(id)) {
		return { ok: false, error: `"${id}" is already installed — use update instead` }
	}

	const fetched = await fetchBundleAndTranslations(baseUrl, fetchedManifest.data)
	if (!fetched.ok) {
		return { ok: false, error: fetched.error }
	}

	const now = Date.now()
	const row: StoredMod = {
		id,
		version: fetched.data.manifest.version as string,
		source: 'url',
		enabled: true,
		manifestJson: JSON.stringify(fetched.data.manifest),
		bundleCode: fetched.data.bundleCode,
		translationsJson: fetched.data.translationsJson,
		sha256: fetched.data.sha256,
		sourceUrl: baseUrl,
		installedAt: now,
		updatedAt: now
	}

	// Fresh install: persist first, then validate — never persist an unloadable
	// install, so on failure the row is rolled back rather than left dangling.
	try {
		await modsService.put(row)
		const manifest = await loadExternalMod(row)
		ModRegistry.register({ manifest, source: 'url', status: 'loaded' })
		markModReloadRequired()
		return { ok: true, manifest }
	} catch (e) {
		await modsService.delete(id).catch(() => {})
		return { ok: false, error: `Installed but failed to load: ${errorMessage(e)}` }
	}
}

/**
 * Refetches an already-installed mod (from `baseUrl`, or its original
 * sourceUrl if omitted) and reloads it. Unlike installFromUrl, the new bundle
 * is validated BEFORE the stored row is overwritten — a bad update leaves the
 * previously working version installed instead of bricking the mod.
 */
export async function update(id: string, baseUrl?: string): Promise<InstallOutcome> {
	const existingRow = await modsService.get(id)
	if (!existingRow) {
		return { ok: false, error: `"${id}" is not installed` }
	}

	const url = baseUrl ?? existingRow.sourceUrl
	const fetchedManifest = await fetchManifest(url)
	if (!fetchedManifest.ok) {
		return { ok: false, error: fetchedManifest.error }
	}
	if (fetchedManifest.data.id !== id) {
		return { ok: false, error: `fetched manifest id "${String(fetchedManifest.data.id)}" does not match installed id "${id}"` }
	}

	const fetched = await fetchBundleAndTranslations(url, fetchedManifest.data)
	if (!fetched.ok) {
		return { ok: false, error: fetched.error }
	}

	const row: StoredMod = {
		id,
		version: fetched.data.manifest.version as string,
		source: existingRow.source,
		enabled: existingRow.enabled,
		manifestJson: JSON.stringify(fetched.data.manifest),
		bundleCode: fetched.data.bundleCode,
		translationsJson: fetched.data.translationsJson,
		sha256: fetched.data.sha256,
		sourceUrl: url,
		installedAt: existingRow.installedAt,
		updatedAt: Date.now()
	}

	try {
		const manifest = await loadExternalMod(row)
		await modsService.put(row)
		ModRegistry.register({ manifest, source: row.source, status: 'loaded' })
		markModReloadRequired()
		return { ok: true, manifest }
	} catch (e) {
		return { ok: false, error: `Update failed to load — keeping the previously installed version: ${errorMessage(e)}` }
	}
}

/**
 * Removes an installed mod. Guarded: refuses if any character still
 * references it, listing the affected character names, so the user
 * uninstalls it per-character (the existing changeCharacterModules flow)
 * before the mod itself can be removed.
 */
export async function remove(id: string): Promise<RemoveOutcome> {
	try {
		const characters = await characterService.getCharacters()
		const affected = characters.filter(character => id in character._modules).map(character => character.name)
		if (affected.length > 0) {
			return { ok: false, reason: 'blocked', characterNames: affected }
		}

		await modsService.delete(id)
		ModRegistry.remove(id)
		markModReloadRequired()
		return { ok: true }
	} catch (e) {
		return { ok: false, reason: 'error', error: errorMessage(e) }
	}
}

/**
 * Enables/disables an installed mod. Disabling takes effect immediately in
 * the current session (flips the in-memory ModRegistry status so
 * getLoadedManifests()/getSheetModules() stop seeing it right away) as well
 * as on next launch (modsService.getAllEnabled() skips it). Enabling reloads
 * the bundle if it wasn't already registered this session.
 */
export async function setEnabled(id: string, enabled: boolean): Promise<SimpleOutcome> {
	const row = await modsService.get(id)
	if (!row) {
		return { ok: false, error: `"${id}" is not installed` }
	}

	await modsService.setEnabled(id, enabled)

	const record = ModRegistry.get(id)

	if (!enabled) {
		if (record && record.status !== 'errored') {
			ModRegistry.register({ ...record, status: 'disabled' })
		}
		markModReloadRequired()
		return { ok: true }
	}

	if (record && record.status === 'disabled') {
		ModRegistry.register({ ...record, status: 'loaded' })
		markModReloadRequired()
		return { ok: true }
	}

	try {
		const manifest = await loadExternalMod({ ...row, enabled: true })
		ModRegistry.register({ manifest, source: row.source, status: 'loaded' })
		markModReloadRequired()
		return { ok: true }
	} catch (e) {
		ModRegistry.register({ manifest: safeManifest(row), source: row.source, status: 'errored', error: errorMessage(e) })
		return { ok: false, error: errorMessage(e) }
	}
}

// --- Registry installs (Phase 3) ---
// Differences from installFromUrl/update above (README.md decision D10, Phase
// 3 doc Step 6): every file is verified against the *registry index's* pinned
// sha256 (provenance, not just self-consistency), source is tagged
// 'registry', and there's no confirmInstallFromUrl typed-confirmation modal —
// the registry is the trusted path, install-from-URL is the unreviewed one.

/** Exported for reuse by the Mod Store's Browse tab ("compatible with my app version" filter/badges). */
export function isEntryCompatible(entry: RegistryModEntry): boolean {
	return isRegistryReleaseCompatible(entry, entry.latestVersion)
}

/** Exported for reuse by the Mod Store's Browse tab (published vs draft visibility). */
export { isEntryPublished } from './registryClient'

export function getRegistryRelease(entry: RegistryModEntry, version: string): RegistryReleaseEntry | null {
	const release = entry.releases?.[version]
	if (release) {
		return release
	}
	if (version !== entry.latestVersion) {
		return null
	}
	return {
		version,
		appVersion: entry.appVersion,
		sdk: entry.sdk,
		files: entry.files
	}
}

export function isRegistryReleaseCompatible(entry: RegistryModEntry, version: string): boolean {
	const release = getRegistryRelease(entry, version)
	if (!release) {
		return false
	}
	if (typeof release.appVersion === 'string' && !semver.satisfies(appVersion, release.appVersion)) {
		return false
	}
	if (typeof release.sdk === 'string' && !semver.satisfies(SDK_VERSION, release.sdk)) {
		return false
	}
	return true
}

export function isRegistryVersionBlocked(blocklist: Record<string, string[]>, id: string, version: string): boolean {
	return (blocklist[id] ?? []).some(range => semver.satisfies(version, range))
}

async function hashFile(text: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
	return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

async function verifyFileHash(url: string, expected: RegistryFileEntry | undefined): Promise<SimpleOutcome> {
	if (!expected) {
		return { ok: false, error: `${url} is not hash-pinned in the registry index — refusing to install.` }
	}
	let text: string
	try {
		const res = await fetch(url)
		if (!res.ok) {
			return { ok: false, error: `${url} request failed (${res.status})` }
		}
		text = await res.text()
	} catch (e) {
		return { ok: false, error: `Could not fetch ${url}: ${errorMessage(e)}` }
	}
	const actual = await hashFile(text)
	if (actual !== expected.sha256) {
		return { ok: false, error: `${url} does not match the registry index hash — refusing to install (possible tampering).` }
	}
	return { ok: true }
}

async function fetchRegistryRelease(entry: RegistryModEntry, release: RegistryReleaseEntry): Promise<FetchResult<FetchedModFiles>> {
	const { getRegistryBase } = useRegistryBase()
	const registryBase = getRegistryBase()
	const versionBaseUrl = `${registryBase}/mods/${entry.id}/${release.version}`
	const manifestFile = release.files['manifest.json']
	const manifestUrl = `${registryBase}/${manifestFile?.url ?? `mods/${entry.id}/${release.version}/manifest.json`}`
	const manifestHashResult = await verifyFileHash(manifestUrl, manifestFile)
	if (!manifestHashResult.ok) {
		return manifestHashResult
	}

	const fetchedManifest = await fetchManifest(versionBaseUrl)
	if (!fetchedManifest.ok) {
		return fetchedManifest
	}
	if (fetchedManifest.data.id !== entry.id || fetchedManifest.data.version !== release.version) {
		return { ok: false, error: `Registry manifest does not match "${entry.id}"@${release.version}` }
	}

	const fetched = await fetchBundleAndTranslations(versionBaseUrl, fetchedManifest.data)
	if (!fetched.ok) {
		return fetched
	}

	const entryFile = typeof fetchedManifest.data.entry === 'string' ? fetchedManifest.data.entry : 'bundle.mjs'
	const bundleFile = release.files[entryFile]
	if (!bundleFile) {
		return { ok: false, error: `${entryFile} is not hash-pinned in the registry index — refusing to install.` }
	}
	if (bundleFile.sha256 !== fetched.data.sha256) {
		return { ok: false, error: `${entryFile} does not match the registry index hash — refusing to install (possible tampering).` }
	}

	return fetched
}

export async function installFromRegistry(id: string, version?: string): Promise<InstallOutcome> {
	if (ModRegistry.get(id)?.source === 'builtin') {
		return { ok: false, error: `"${id}" conflicts with a built-in mod` }
	}
	if (await modsService.get(id)) {
		return { ok: false, error: `"${id}" is already installed — use update instead` }
	}

	const { index } = await getIndex()
	if (!index) {
		return { ok: false, error: 'Registry index is not available — try refreshing the Mod Store' }
	}
	const entry = index.mods.find(m => m.id === id)
	if (!entry) {
		return { ok: false, error: `"${id}" was not found in the registry` }
	}
	if (!isEntryPublished(entry)) {
		return { ok: false, error: `"${id}" is not published in the Mod Store` }
	}
	const selectedVersion = version ?? entry.latestVersion
	const release = getRegistryRelease(entry, selectedVersion)
	if (!release) {
		return { ok: false, error: `"${id}"@${selectedVersion} has no hash-pinned release metadata` }
	}
	if (isRegistryVersionBlocked(index.blocklist, id, selectedVersion)) {
		return { ok: false, error: `"${id}"@${selectedVersion} is blocked and cannot be installed` }
	}
	if (!isRegistryReleaseCompatible(entry, selectedVersion)) {
		return { ok: false, error: `"${id}"@${selectedVersion} is not compatible with this app version` }
	}

	const fetched = await fetchRegistryRelease(entry, release)
	if (!fetched.ok) {
		return { ok: false, error: fetched.error }
	}

	const now = Date.now()
	const row: StoredMod = {
		id,
		version: selectedVersion,
		source: 'registry',
		enabled: true,
		manifestJson: JSON.stringify(fetched.data.manifest),
		bundleCode: fetched.data.bundleCode,
		translationsJson: fetched.data.translationsJson,
		sha256: fetched.data.sha256,
		sourceUrl: `${useRegistryBase().getRegistryBase()}/mods/${id}/${selectedVersion}`,
		installedAt: now,
		updatedAt: now
	}

	try {
		await modsService.put(row)
		const manifest = await loadExternalMod(row)
		ModRegistry.register({ manifest, source: 'registry', status: 'loaded' })
		markModReloadRequired()
		return { ok: true, manifest }
	} catch (e) {
		await modsService.delete(id).catch(() => {})
		return { ok: false, error: `Installed but failed to load: ${errorMessage(e)}` }
	}
}

export async function changeRegistryVersion(id: string, version?: string): Promise<InstallOutcome> {
	const existingRow = await modsService.get(id)
	if (!existingRow) {
		return { ok: false, error: `"${id}" is not installed` }
	}

	const { index } = await getIndex()
	if (!index) {
		return { ok: false, error: 'Registry index is not available — try refreshing the Mod Store' }
	}
	const entry = index.mods.find(m => m.id === id)
	if (!entry) {
		return { ok: false, error: `"${id}" was not found in the registry` }
	}
	if (!isEntryPublished(entry)) {
		return { ok: false, error: `"${id}" is not published in the Mod Store` }
	}
	const selectedVersion = version ?? entry.latestVersion
	const release = getRegistryRelease(entry, selectedVersion)
	if (!release) {
		return { ok: false, error: `"${id}"@${selectedVersion} has no hash-pinned release metadata` }
	}
	if (isRegistryVersionBlocked(index.blocklist, id, selectedVersion)) {
		return { ok: false, error: `"${id}"@${selectedVersion} is blocked and cannot be installed` }
	}
	if (!isRegistryReleaseCompatible(entry, selectedVersion)) {
		return { ok: false, error: `"${id}"@${selectedVersion} is not compatible with this app version` }
	}

	const fetched = await fetchRegistryRelease(entry, release)
	if (!fetched.ok) {
		return { ok: false, error: fetched.error }
	}

	const row: StoredMod = {
		id,
		version: selectedVersion,
		source: 'registry',
		enabled: existingRow.enabled,
		manifestJson: JSON.stringify(fetched.data.manifest),
		bundleCode: fetched.data.bundleCode,
		translationsJson: fetched.data.translationsJson,
		sha256: fetched.data.sha256,
		sourceUrl: `${useRegistryBase().getRegistryBase()}/mods/${id}/${selectedVersion}`,
		installedAt: existingRow.installedAt,
		updatedAt: Date.now()
	}

	try {
		const manifest = await loadExternalMod(row)
		await modsService.put(row)
		ModRegistry.register({ manifest, source: row.source, status: 'loaded' })
		markModReloadRequired()
		return { ok: true, manifest }
	} catch (e) {
		return { ok: false, error: `Update failed to load — keeping the previously installed version: ${errorMessage(e)}` }
	}
}

export async function updateFromRegistry(id: string): Promise<InstallOutcome> {
	return changeRegistryVersion(id)
}

export interface AvailableUpdate {
	id: string
	installedVersion: string
	latestCompatibleVersion: string
}

/** Diffs installed registry-sourced mods against the cached index for
 * Settings→Mod Store update badges. Reads the cache only — never fetches
 * (call registryClient.refreshIndex() first if a fresh check is needed). */
export async function checkForUpdates(): Promise<AvailableUpdate[]> {
	const { index } = await getIndex()
	if (!index) {
		return []
	}

	const installed = await modsService.getAll()
	const updates: AvailableUpdate[] = []

	for (const row of installed) {
		if (row.source !== 'registry') continue
		const entry = index.mods.find(m => m.id === row.id)
		if (!entry) continue
		if (
			isEntryPublished(entry) &&
			isEntryCompatible(entry) &&
			!isRegistryVersionBlocked(index.blocklist, entry.id, entry.latestVersion) &&
			semver.gt(entry.latestVersion, row.version)
		) {
			updates.push({ id: row.id, installedVersion: row.version, latestCompatibleVersion: entry.latestVersion })
		}
	}

	return updates
}
