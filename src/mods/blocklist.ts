import semver from 'semver'

/**
 * Kill-switch entries compiled into the app itself, in the same
 * `{ [modId]: semverRange[] }` shape as the registry's blocklist.json.
 *
 * The registry blocklist is the fast path — it reaches users within the hour
 * without an app release — but it only arrives over the network, and only
 * after boot has already imported every enabled bundle. This list is applied
 * before a single line of mod code runs, works offline, and cannot be
 * redirected by a tampered registry base. Use it for anything that warrants
 * an emergency app release; prune an entry once the release carrying it is no
 * longer in circulation.
 */
export const SEED_BLOCKLIST: Record<string, string[]> = {}

export function isVersionBlocked(blocklist: Record<string, string[]>, id: string, version: string): boolean {
	return (blocklist[id] ?? []).some(range => semver.satisfies(version, range))
}

export function isSeedBlocked(id: string, version: string): boolean {
	return isVersionBlocked(SEED_BLOCKLIST, id, version)
}
