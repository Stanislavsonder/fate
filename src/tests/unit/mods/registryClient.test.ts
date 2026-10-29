import { describe, it, expect, vi, beforeEach } from 'vitest'

const { getKv, setKv } = vi.hoisted(() => ({ getKv: vi.fn(), setKv: vi.fn() }))
vi.mock('@/db/tables/kv', () => ({ kvService: { get: getKv, set: setKv } }))

const { getAllMods, setEnabledMod, setBlockedMod } = vi.hoisted(() => ({
	getAllMods: vi.fn(),
	setEnabledMod: vi.fn(),
	setBlockedMod: vi.fn()
}))
vi.mock('@/db/tables/mods', () => ({ modsService: { getAll: getAllMods, setEnabled: setEnabledMod, setBlocked: setBlockedMod } }))

const { getRegistryBase } = vi.hoisted(() => ({ getRegistryBase: vi.fn(() => 'https://registry.example.com') }))
vi.mock('@/composables/useRegistryBase', () => ({ default: () => ({ getRegistryBase }) }))

const { showWarningToast } = vi.hoisted(() => ({ showWarningToast: vi.fn() }))
vi.mock('@/utils/helpers/toast', () => ({ showWarningToast }))

import { refreshIndex, getIndex, applyBlocklist, type RegistryIndex } from '@/mods/registryClient'

function baseIndex(overrides: Partial<RegistryIndex> = {}): RegistryIndex {
	return { schemaVersion: 1, generatedAt: '2026-01-01T00:00:00Z', blocklist: {}, mods: [], ...overrides }
}

function jsonResponse(body: unknown, ok = true, status = 200) {
	return { ok, status, json: async () => body }
}

beforeEach(() => {
	vi.clearAllMocks()
	getAllMods.mockResolvedValue([])
	setEnabledMod.mockResolvedValue(undefined)
	setBlockedMod.mockResolvedValue(undefined)
	setKv.mockResolvedValue(undefined)
})

describe('refreshIndex', () => {
	it('fetches, sanity-checks, and caches the index', async () => {
		const index = baseIndex({ mods: [{ id: 'author@mod' } as never] })
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(index)))

		const result = await refreshIndex(true)

		expect(result).toEqual({ ok: true })
		expect(setKv).toHaveBeenCalledWith('registryIndex', expect.objectContaining({ index }))
	})

	it('rejects a malformed response without caching it', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ not: 'an index' })))

		const result = await refreshIndex(true)

		expect(result.ok).toBe(false)
		expect(setKv).not.toHaveBeenCalled()
	})

	it('surfaces a fetch failure without throwing', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, false, 500)))

		const result = await refreshIndex(true)

		expect(result).toEqual({ ok: false, error: 'registry.json request failed (500)' })
	})

	it('never throws even if fetch itself rejects', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))

		const result = await refreshIndex(true)

		expect(result).toEqual({ ok: false, error: 'network down' })
	})

	it('throttles automatic (non-forced) refreshes to at most once/hour', async () => {
		vi.useFakeTimers()
		try {
			// Jump clear of whatever real-time throttle window earlier tests in this
			// file's forced refreshIndex(true) calls may have set — refreshIndex
			// intentionally lets a forced call also reset the automatic-refresh
			// throttle (no point auto-refreshing again right after a manual one).
			vi.setSystemTime(Date.now() + 2 * 60 * 60 * 1000)
			const fetchMock = vi.fn().mockResolvedValue(jsonResponse(baseIndex()))
			vi.stubGlobal('fetch', fetchMock)

			await refreshIndex(false)
			expect(fetchMock).toHaveBeenCalledTimes(1)

			await refreshIndex(false)
			expect(fetchMock).toHaveBeenCalledTimes(1) // throttled — no second call yet

			vi.advanceTimersByTime(61 * 60 * 1000)
			await refreshIndex(false)
			expect(fetchMock).toHaveBeenCalledTimes(2)
		} finally {
			vi.useRealTimers()
		}
	})
})

describe('getIndex', () => {
	it('reports no cache as stale', async () => {
		getKv.mockResolvedValue(undefined)

		const result = await getIndex()

		expect(result).toEqual({ index: null, stale: true, fetchedAt: null })
	})

	it('reports a fresh cache as not stale', async () => {
		getKv.mockResolvedValue({ fetchedAt: Date.now(), index: baseIndex() })

		const result = await getIndex()

		expect(result.stale).toBe(false)
		expect(result.index).not.toBeNull()
	})

	it('reports an old cache as stale', async () => {
		getKv.mockResolvedValue({ fetchedAt: Date.now() - 25 * 60 * 60 * 1000, index: baseIndex() })

		const result = await getIndex()

		expect(result.stale).toBe(true)
	})
})

describe('applyBlocklist', () => {
	it('disables and marks blocked an installed mod matching a blocklist range', async () => {
		getAllMods.mockResolvedValue([{ id: 'evil@mod', version: '1.2.0', enabled: true, blocked: false }])
		const index = baseIndex({ blocklist: { 'evil@mod': ['<1.2.1'] } })

		await applyBlocklist(index)

		expect(setEnabledMod).toHaveBeenCalledWith('evil@mod', false)
		expect(setBlockedMod).toHaveBeenCalledWith('evil@mod', true)
		expect(showWarningToast).toHaveBeenCalledWith('settings.mods.blocked', { id: 'evil@mod' })
	})

	it('is idempotent — does not re-disable or re-toast an already-blocked mod', async () => {
		getAllMods.mockResolvedValue([{ id: 'evil@mod', version: '1.2.0', enabled: false, blocked: true }])
		const index = baseIndex({ blocklist: { 'evil@mod': ['<1.2.1'] } })

		await applyBlocklist(index)

		expect(setEnabledMod).not.toHaveBeenCalled()
		expect(showWarningToast).not.toHaveBeenCalled()
	})

	it('clears the blocked flag once a mod updates past the blocked range, without touching enabled', async () => {
		getAllMods.mockResolvedValue([{ id: 'fixed@mod', version: '1.2.1', enabled: false, blocked: true }])
		const index = baseIndex({ blocklist: { 'fixed@mod': ['<1.2.1'] } })

		await applyBlocklist(index)

		expect(setBlockedMod).toHaveBeenCalledWith('fixed@mod', false)
		expect(setEnabledMod).not.toHaveBeenCalled()
	})

	it('leaves unaffected mods alone', async () => {
		getAllMods.mockResolvedValue([{ id: 'fine@mod', version: '1.0.0', enabled: true, blocked: false }])
		const index = baseIndex({ blocklist: {} })

		await applyBlocklist(index)

		expect(setEnabledMod).not.toHaveBeenCalled()
		expect(setBlockedMod).not.toHaveBeenCalled()
	})
})
