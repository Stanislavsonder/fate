import semver from 'semver'
import { kvService } from '@/db/tables/kv'
import { modsService } from '@/db/tables/mods'
import useRegistryBase from '@/composables/useRegistryBase'
import { showWarningToast } from '@/utils/helpers/toast'
import type { FateModuleManifest } from '@fate-app/mod-types'

export interface RegistryFileEntry {
	url: string
	sha256: string
	size: number
}

export interface RegistryReleaseEntry {
	version: string
	appVersion?: string
	sdk?: string
	files: Record<string, RegistryFileEntry>
}

/** A registry.json entry: the mod's full static manifest embedded verbatim,
 * plus publish-time fields — see fate-mods' scripts/ci/publish.ts. */
export interface RegistryModEntry extends FateModuleManifest {
	latestVersion: string
	publishedAt: string
	files: Record<string, RegistryFileEntry>
	readmeUrl?: string
	versions: string[]
	/** Missing only in legacy schema-v1 caches, where the latest release remains available through `files`. */
	releases?: Record<string, RegistryReleaseEntry>
	/** Per-language display strings extracted at publish time so the Mod Store
	 * can render browse cards without fetching each mod's translations. */
	strings: Record<string, { name: string; short: string }>
}

export interface RegistryIndex {
	schemaVersion: number
	generatedAt: string
	blocklist: Record<string, string[]>
	mods: RegistryModEntry[]
}

interface CachedIndex {
	fetchedAt: number
	index: RegistryIndex
}

const KV_KEY = 'registryIndex'
const AUTO_REFRESH_INTERVAL_MS = 60 * 60 * 1000 // throttle: at most 1 automatic refresh/hour
const STALE_AFTER_MS = 24 * 60 * 60 * 1000 // "stale" banner threshold in the Mod Store UI

let lastAutoRefreshAttempt = 0

function isSaneIndex(value: unknown): value is RegistryIndex {
	if (!value || typeof value !== 'object') return false
	const candidate = value as Record<string, unknown>
	return typeof candidate.schemaVersion === 'number' && Array.isArray(candidate.mods) && typeof candidate.blocklist === 'object' && candidate.blocklist !== null
}

/**
 * Fetches registry.json, sanity-checks its shape, caches it in the Dexie `kv`
 * table, and applies the blocklist to already-installed mods. Never throws —
 * a failed refresh just leaves the previous cache (if any) in place, per the
 * cross-phase rule that startup must work offline.
 *
 * @param force Bypasses the 1-hour automatic-refresh throttle — used by
 * manual pull-to-refresh and when opening the Mod Store.
 */
export async function refreshIndex(force = false): Promise<{ ok: true } | { ok: false; error: string }> {
	const now = Date.now()
	if (!force && now - lastAutoRefreshAttempt < AUTO_REFRESH_INTERVAL_MS) {
		return { ok: true }
	}
	lastAutoRefreshAttempt = now

	const { getRegistryBase } = useRegistryBase()
	try {
		const res = await fetch(`${getRegistryBase()}/registry.json`, { cache: 'no-store' })
		if (!res.ok) {
			return { ok: false, error: `registry.json request failed (${res.status})` }
		}
		const index: unknown = await res.json()
		if (!isSaneIndex(index)) {
			return { ok: false, error: 'registry.json has an unexpected shape' }
		}

		await kvService.set<CachedIndex>(KV_KEY, { fetchedAt: now, index })
		await applyBlocklist(index)
		return { ok: true }
	} catch (e) {
		return { ok: false, error: e instanceof Error ? e.message : String(e) }
	}
}

/** Cached-first read — never fetches. `stale` is true if there's no cache yet,
 * or the last successful fetch is older than STALE_AFTER_MS (the Mod Store UI
 * uses this for its "last updated …" banner, not a hard error). */
export async function getIndex(): Promise<{ index: RegistryIndex | null; stale: boolean; fetchedAt: number | null }> {
	const cached = await kvService.get<CachedIndex>(KV_KEY)
	if (!cached) {
		return { index: null, stale: true, fetchedAt: null }
	}
	return { index: cached.index, stale: Date.now() - cached.fetchedAt > STALE_AFTER_MS, fetchedAt: cached.fetchedAt }
}

/**
 * Disables (and marks `blocked: true` on) any installed mod whose version
 * matches a blocklist.json range for its id. Idempotent — re-running with the
 * same index is a no-op for mods already marked blocked, and un-blocks (clears
 * the flag, but leaves enabled/disabled as the user last set it) mods whose
 * blocklist entry was lifted, e.g. after updating to a fixed version.
 */
export async function applyBlocklist(index: RegistryIndex): Promise<void> {
	const installed = await modsService.getAll()

	for (const row of installed) {
		const ranges = index.blocklist[row.id]
		const isBlocked = Array.isArray(ranges) && ranges.some(range => semver.satisfies(row.version, range))

		if (isBlocked && !row.blocked) {
			await modsService.setEnabled(row.id, false)
			await modsService.setBlocked(row.id, true)
			await showWarningToast('settings.mods.blocked', { id: row.id })
		} else if (!isBlocked && row.blocked) {
			await modsService.setBlocked(row.id, false)
		}
	}
}
