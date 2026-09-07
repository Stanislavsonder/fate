import { describe, it, expect, vi, beforeEach } from 'vitest'

const { getMod, putMod, deleteMod, setEnabledMod, getAllMods } = vi.hoisted(() => ({
	getMod: vi.fn(),
	putMod: vi.fn(),
	deleteMod: vi.fn(),
	setEnabledMod: vi.fn(),
	getAllMods: vi.fn().mockResolvedValue([])
}))
vi.mock('@/db/tables/mods', () => ({ modsService: { get: getMod, put: putMod, delete: deleteMod, setEnabled: setEnabledMod, getAll: getAllMods } }))

const { loadExternalMod, safeManifest } = vi.hoisted(() => ({
	loadExternalMod: vi.fn(),
	safeManifest: vi.fn((row: { id: string; version: string }) => ({ id: row.id, version: row.version }))
}))
vi.mock('@/mods/loader', () => ({ loadExternalMod, safeManifest }))

const { getCharacters } = vi.hoisted(() => ({ getCharacters: vi.fn().mockResolvedValue([]) }))
vi.mock('@/service/character.service', () => ({ default: { getCharacters } }))

const { getIndex, isEntryPublished } = vi.hoisted(() => ({
	getIndex: vi.fn(),
	isEntryPublished: (entry: { published?: boolean }) => entry.published !== false
}))
vi.mock('@/mods/registryClient', () => ({ getIndex, isEntryPublished }))

const { getRegistryBase } = vi.hoisted(() => ({ getRegistryBase: vi.fn(() => 'https://registry.example.com') }))
vi.mock('@/composables/useRegistryBase', () => ({ default: () => ({ getRegistryBase }) }))

import { ModRegistry } from '@/mods/modRegistry'
import { installFromUrl, update, remove, setEnabled, installFromRegistry, updateFromRegistry, checkForUpdates, isEntryPublished } from '@/mods/installService'
import type { StoredMod } from '@/db/tables/mods'
import type { RegistryIndex, RegistryModEntry } from '@/mods/registryClient'

function jsonResponse(body: unknown, ok = true, status = 200) {
	return { ok, status, json: async () => body }
}

function textResponse(body: string, ok = true, status = 200) {
	return { ok, status, text: async () => body }
}

function baseStoredRow(overrides: Partial<StoredMod> = {}): StoredMod {
	return {
		id: 'author@mod',
		version: '1.0.0',
		source: 'url',
		enabled: true,
		manifestJson: JSON.stringify({ id: 'author@mod', version: '1.0.0' }),
		bundleCode: 'export default {}',
		translationsJson: '{}',
		sha256: 'abc',
		sourceUrl: 'https://example.com/mods/author@mod',
		installedAt: 0,
		updatedAt: 0,
		...overrides
	}
}

beforeEach(() => {
	vi.clearAllMocks()
	getCharacters.mockResolvedValue([])
	putMod.mockResolvedValue(undefined)
	deleteMod.mockResolvedValue(undefined)
	setEnabledMod.mockResolvedValue(undefined)
	getAllMods.mockResolvedValue([])
	getRegistryBase.mockReturnValue('https://registry.example.com')
})

function baseRegistryEntry(overrides: Partial<RegistryModEntry> = {}): RegistryModEntry {
	return {
		id: 'reg@mod',
		version: '1.0.0',
		name: 'Reg Mod',
		author: { name: 'Someone' },
		description: { short: 'desc' },
		languages: ['en'],
		tags: [],
		loadPriority: 100,
		entry: 'bundle.mjs',
		latestVersion: '1.0.0',
		publishedAt: '2026-01-01T00:00:00Z',
		files: {
			'manifest.json': { url: 'mods/reg@mod/1.0.0/manifest.json', sha256: 'manifest-hash', size: 10 },
			'bundle.mjs': { url: 'mods/reg@mod/1.0.0/bundle.mjs', sha256: 'bundle-hash', size: 10 }
		},
		versions: ['1.0.0'],
		strings: { en: { name: 'Reg Mod', short: 'desc' } },
		...overrides
	} as RegistryModEntry
}

function baseRegistryIndex(mods: RegistryModEntry[] = []): RegistryIndex {
	return { schemaVersion: 1, generatedAt: '2026-01-01T00:00:00Z', blocklist: {}, mods }
}

async function sha256Hex(text: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
	return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

describe('installFromUrl', () => {
	it('fetches manifest+bundle+translations, persists, loads, and registers', async () => {
		const manifest = { id: 'fresh@mod', version: '1.0.0', entry: 'bundle.mjs', languages: ['en'] }
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse(manifest))
			.mockResolvedValueOnce(textResponse('export default {}'))
			.mockResolvedValueOnce(jsonResponse({ greeting: 'hi' }))
		vi.stubGlobal('fetch', fetchMock)
		getMod.mockResolvedValue(undefined)
		loadExternalMod.mockResolvedValue({ id: 'fresh@mod', version: '1.0.0' })

		const result = await installFromUrl('https://example.com/mods/fresh@mod')

		expect(result.ok).toBe(true)
		expect(fetchMock).toHaveBeenCalledTimes(3)
		expect(putMod).toHaveBeenCalledTimes(1)
		expect(ModRegistry.get('fresh@mod')).toEqual({ manifest: { id: 'fresh@mod', version: '1.0.0' }, source: 'url', status: 'loaded' })
	})

	it('refuses an id that conflicts with a built-in mod without fetching the bundle', async () => {
		ModRegistry.register({ manifest: { id: 'builtin@mod', version: '1.0.0' } as never, source: 'builtin', status: 'loaded' })
		const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 'builtin@mod', version: '1.0.0' }))
		vi.stubGlobal('fetch', fetchMock)

		const result = await installFromUrl('https://example.com/mods/builtin@mod')

		expect(result).toEqual({ ok: false, error: '"builtin@mod" conflicts with a built-in mod' })
		expect(putMod).not.toHaveBeenCalled()
		expect(fetchMock).toHaveBeenCalledTimes(1)
	})

	it('refuses a duplicate install and suggests update instead, without fetching the bundle', async () => {
		const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 'dup@mod', version: '1.0.0' }))
		vi.stubGlobal('fetch', fetchMock)
		getMod.mockResolvedValue(baseStoredRow({ id: 'dup@mod' }))

		const result = await installFromUrl('https://example.com/mods/dup@mod')

		expect(result.ok).toBe(false)
		expect(fetchMock).toHaveBeenCalledTimes(1)
		expect(!result.ok && result.error).toMatch(/already installed/)
		expect(putMod).not.toHaveBeenCalled()
	})

	it('rolls back the stored row when the fetched bundle fails to load', async () => {
		const manifest = { id: 'bad@mod', version: '1.0.0', languages: [] }
		vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(jsonResponse(manifest)).mockResolvedValueOnce(textResponse('export default {}')))
		getMod.mockResolvedValue(undefined)
		loadExternalMod.mockRejectedValue(new Error('boom'))

		const result = await installFromUrl('https://example.com/mods/bad@mod')

		expect(result.ok).toBe(false)
		expect(putMod).toHaveBeenCalledTimes(1)
		expect(deleteMod).toHaveBeenCalledWith('bad@mod')
	})

	it('surfaces a fetch failure without touching storage', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, false, 404)))

		const result = await installFromUrl('https://example.com/mods/missing')

		expect(result.ok).toBe(false)
		expect(putMod).not.toHaveBeenCalled()
	})
})

describe('update', () => {
	it('validates the new bundle BEFORE overwriting the stored row', async () => {
		getMod.mockResolvedValue(baseStoredRow())
		const manifest = { id: 'author@mod', version: '1.1.0', languages: [] }
		vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(jsonResponse(manifest)).mockResolvedValueOnce(textResponse('export default {}')))
		loadExternalMod.mockResolvedValue({ id: 'author@mod', version: '1.1.0' })

		const result = await update('author@mod')

		expect(result.ok).toBe(true)
		const loadOrder = loadExternalMod.mock.invocationCallOrder[0]
		const putOrder = putMod.mock.invocationCallOrder[0]
		expect(loadOrder).toBeLessThan(putOrder)
	})

	it('keeps the previous version installed when the new bundle fails to load', async () => {
		getMod.mockResolvedValue(baseStoredRow())
		const manifest = { id: 'author@mod', version: '2.0.0', languages: [] }
		vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(jsonResponse(manifest)).mockResolvedValueOnce(textResponse('export default {}')))
		loadExternalMod.mockRejectedValue(new Error('boom'))

		const result = await update('author@mod')

		expect(result.ok).toBe(false)
		expect(putMod).not.toHaveBeenCalled()
	})

	it('refuses when the mod is not installed', async () => {
		getMod.mockResolvedValue(undefined)

		const result = await update('nope@mod')

		expect(result).toEqual({ ok: false, error: '"nope@mod" is not installed' })
	})
})

describe('remove', () => {
	it('blocks removal when a character still references the mod', async () => {
		getCharacters.mockResolvedValue([
			{ id: 1, name: 'Hero', avatar: '', _modules: { 'author@mod': { version: '1.0.0' } } },
			{ id: 2, name: 'Other', avatar: '', _modules: {} }
		])

		const result = await remove('author@mod')

		expect(result).toEqual({ ok: false, reason: 'blocked', characterNames: ['Hero'] })
		expect(deleteMod).not.toHaveBeenCalled()
	})

	it('removes the mod when no character references it', async () => {
		ModRegistry.register({ manifest: { id: 'removable@mod', version: '1.0.0' } as never, source: 'url', status: 'loaded' })

		const result = await remove('removable@mod')

		expect(result).toEqual({ ok: true })
		expect(deleteMod).toHaveBeenCalledWith('removable@mod')
		expect(ModRegistry.get('removable@mod')).toBeUndefined()
	})
})

describe('setEnabled', () => {
	it('disabling flips the in-session ModRegistry status without deleting the record', async () => {
		ModRegistry.register({ manifest: { id: 'toggle@mod', version: '1.0.0' } as never, source: 'url', status: 'loaded' })
		getMod.mockResolvedValue(baseStoredRow({ id: 'toggle@mod' }))

		const result = await setEnabled('toggle@mod', false)

		expect(result).toEqual({ ok: true })
		expect(setEnabledMod).toHaveBeenCalledWith('toggle@mod', false)
		expect(ModRegistry.get('toggle@mod')?.status).toBe('disabled')
	})

	it('re-enabling an in-session-disabled mod flips it back without reloading', async () => {
		ModRegistry.register({ manifest: { id: 'toggle2@mod', version: '1.0.0' } as never, source: 'url', status: 'disabled' })
		getMod.mockResolvedValue(baseStoredRow({ id: 'toggle2@mod' }))

		const result = await setEnabled('toggle2@mod', true)

		expect(result).toEqual({ ok: true })
		expect(loadExternalMod).not.toHaveBeenCalled()
		expect(ModRegistry.get('toggle2@mod')?.status).toBe('loaded')
	})

	it('enabling a mod with no in-session record loads it fresh', async () => {
		getMod.mockResolvedValue(baseStoredRow({ id: 'toggle3@mod' }))
		loadExternalMod.mockResolvedValue({ id: 'toggle3@mod', version: '1.0.0' })

		const result = await setEnabled('toggle3@mod', true)

		expect(result).toEqual({ ok: true })
		expect(loadExternalMod).toHaveBeenCalled()
		expect(ModRegistry.get('toggle3@mod')?.status).toBe('loaded')
	})

	it('refuses when the mod is not installed', async () => {
		getMod.mockResolvedValue(undefined)

		const result = await setEnabled('nope@mod', true)

		expect(result).toEqual({ ok: false, error: '"nope@mod" is not installed' })
	})
})

describe('installFromRegistry', () => {
	it('installs the latest version, verifying manifest and bundle against the pinned index hashes', async () => {
		const manifestJson = { id: 'reg@mod', version: '1.0.0', entry: 'bundle.mjs', languages: ['en'] }
		const manifestText = JSON.stringify(manifestJson)
		const bundleText = 'export default {}'
		const manifestHash = await sha256Hex(manifestText)
		const bundleHash = await sha256Hex(bundleText)

		const entry = baseRegistryEntry({
			files: {
				'manifest.json': { url: 'mods/reg@mod/1.0.0/manifest.json', sha256: manifestHash, size: manifestText.length },
				'bundle.mjs': { url: 'mods/reg@mod/1.0.0/bundle.mjs', sha256: bundleHash, size: bundleText.length }
			}
		})
		getIndex.mockResolvedValue({ index: baseRegistryIndex([entry]) })
		getMod.mockResolvedValue(undefined)
		loadExternalMod.mockResolvedValue({ id: 'reg@mod', version: '1.0.0' })

		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(textResponse(manifestText)) // verifyFileHash(manifest.json)
			.mockResolvedValueOnce(jsonResponse(manifestJson)) // fetchManifest
			.mockResolvedValueOnce(textResponse(bundleText)) // fetchBundleAndTranslations: bundle
			.mockResolvedValueOnce(jsonResponse({ greeting: 'hi' })) // translations/en.json
		vi.stubGlobal('fetch', fetchMock)

		const result = await installFromRegistry('reg@mod')

		expect(result.ok).toBe(true)
		expect(putMod).toHaveBeenCalledWith(expect.objectContaining({ id: 'reg@mod', version: '1.0.0', source: 'registry' }))
	})

	it('refuses when the id is not in the registry index', async () => {
		getIndex.mockResolvedValue({ index: baseRegistryIndex([]) })
		getMod.mockResolvedValue(undefined)

		const result = await installFromRegistry('missing@mod')

		expect(result).toEqual({ ok: false, error: '"missing@mod" was not found in the registry' })
	})

	it('refuses when the registry index is unavailable', async () => {
		getIndex.mockResolvedValue({ index: null })
		getMod.mockResolvedValue(undefined)

		const result = await installFromRegistry('reg@mod')

		expect(result.ok).toBe(false)
	})

	it('refuses when the entry is incompatible with the current app version', async () => {
		getIndex.mockResolvedValue({ index: baseRegistryIndex([baseRegistryEntry({ appVersion: '<0.0.1' })]) })
		getMod.mockResolvedValue(undefined)

		const result = await installFromRegistry('reg@mod')

		expect(result.ok).toBe(false)
	})

	it('refuses when the entry is unpublished', async () => {
		getIndex.mockResolvedValue({ index: baseRegistryIndex([baseRegistryEntry({ published: false })]) })
		getMod.mockResolvedValue(undefined)

		const result = await installFromRegistry('reg@mod')

		expect(result).toEqual({ ok: false, error: '"reg@mod" is not published in the Mod Store' })
	})

	it('treats omitted published as visible', () => {
		expect(isEntryPublished(baseRegistryEntry())).toBe(true)
		expect(isEntryPublished(baseRegistryEntry({ published: true }))).toBe(true)
		expect(isEntryPublished(baseRegistryEntry({ published: false }))).toBe(false)
	})

	it('refuses when the fetched bundle does not match the pinned index hash', async () => {
		const manifestJson = { id: 'reg@mod', version: '1.0.0', entry: 'bundle.mjs', languages: [] }
		const manifestText = JSON.stringify(manifestJson)
		const manifestHash = await sha256Hex(manifestText)

		const entry = baseRegistryEntry({
			files: {
				'manifest.json': { url: 'mods/reg@mod/1.0.0/manifest.json', sha256: manifestHash, size: 1 },
				'bundle.mjs': { url: 'mods/reg@mod/1.0.0/bundle.mjs', sha256: 'not-the-real-hash', size: 1 }
			}
		})
		getIndex.mockResolvedValue({ index: baseRegistryIndex([entry]) })
		getMod.mockResolvedValue(undefined)

		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(textResponse(manifestText))
			.mockResolvedValueOnce(jsonResponse(manifestJson))
			.mockResolvedValueOnce(textResponse('export default {}'))
		vi.stubGlobal('fetch', fetchMock)

		const result = await installFromRegistry('reg@mod')

		expect(result.ok).toBe(false)
		expect(!result.ok && result.error).toMatch(/does not match the registry index hash/)
		expect(putMod).not.toHaveBeenCalled()
	})

	it('refuses when the fetched manifest.json does not match the pinned index hash, before fetching the bundle', async () => {
		const entry = baseRegistryEntry({
			files: {
				'manifest.json': { url: 'mods/reg@mod/1.0.0/manifest.json', sha256: 'not-the-real-hash', size: 1 },
				'bundle.mjs': { url: 'mods/reg@mod/1.0.0/bundle.mjs', sha256: 'bundle-hash', size: 1 }
			}
		})
		getIndex.mockResolvedValue({ index: baseRegistryIndex([entry]) })
		getMod.mockResolvedValue(undefined)
		const fetchMock = vi.fn().mockResolvedValue(textResponse('{"id":"reg@mod","version":"1.0.0"}'))
		vi.stubGlobal('fetch', fetchMock)

		const result = await installFromRegistry('reg@mod')

		expect(result.ok).toBe(false)
		expect(!result.ok && result.error).toMatch(/does not match the registry index hash/)
		expect(fetchMock).toHaveBeenCalledTimes(1)
	})

	it('refuses an explicit version without pinned release metadata', async () => {
		const entry = baseRegistryEntry({ versions: ['0.9.0', '1.0.0'] })
		getIndex.mockResolvedValue({ index: baseRegistryIndex([entry]) })
		getMod.mockResolvedValue(undefined)

		const result = await installFromRegistry('reg@mod', '0.9.0')

		expect(result.ok).toBe(false)
	})

	it('installs an older version from its pinned release metadata', async () => {
		const manifestJson = { id: 'reg@mod', version: '0.9.0', entry: 'bundle.mjs', languages: [] }
		const manifestText = JSON.stringify(manifestJson)
		const bundleText = 'export default {}'
		const manifestHash = await sha256Hex(manifestText)
		const bundleHash = await sha256Hex(bundleText)
		const files = {
			'manifest.json': { url: 'mods/reg@mod/0.9.0/manifest.json', sha256: manifestHash, size: manifestText.length },
			'bundle.mjs': { url: 'mods/reg@mod/0.9.0/bundle.mjs', sha256: bundleHash, size: bundleText.length }
		}
		const entry = baseRegistryEntry({
			versions: ['0.9.0', '1.0.0'],
			releases: {
				'0.9.0': { version: '0.9.0', files },
				'1.0.0': { version: '1.0.0', files: baseRegistryEntry().files }
			}
		})
		getIndex.mockResolvedValue({ index: baseRegistryIndex([entry]) })
		getMod.mockResolvedValue(undefined)
		loadExternalMod.mockResolvedValue({ id: 'reg@mod', version: '0.9.0' })
		vi.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockResolvedValueOnce(textResponse(manifestText))
				.mockResolvedValueOnce(jsonResponse(manifestJson))
				.mockResolvedValueOnce(textResponse(bundleText))
		)

		const result = await installFromRegistry('reg@mod', '0.9.0')

		expect(result.ok).toBe(true)
		expect(putMod).toHaveBeenCalledWith(expect.objectContaining({ version: '0.9.0', sourceUrl: 'https://registry.example.com/mods/reg@mod/0.9.0' }))
	})

	it('refuses a blocklisted version before downloading it', async () => {
		const entry = baseRegistryEntry()
		getIndex.mockResolvedValue({ index: { ...baseRegistryIndex([entry]), blocklist: { 'reg@mod': ['1.0.0'] } } })
		getMod.mockResolvedValue(undefined)
		const fetchMock = vi.fn()
		vi.stubGlobal('fetch', fetchMock)

		const result = await installFromRegistry('reg@mod')

		expect(result.ok).toBe(false)
		expect(fetchMock).not.toHaveBeenCalled()
	})

	it('refuses an id that conflicts with a built-in mod', async () => {
		ModRegistry.register({ manifest: { id: 'builtin@mod', version: '1.0.0' } as never, source: 'builtin', status: 'loaded' })

		const result = await installFromRegistry('builtin@mod')

		expect(result).toEqual({ ok: false, error: '"builtin@mod" conflicts with a built-in mod' })
	})

	it('refuses a duplicate install and suggests update instead', async () => {
		getMod.mockResolvedValue(baseStoredRow({ id: 'dup@mod' }))

		const result = await installFromRegistry('dup@mod')

		expect(result.ok).toBe(false)
		expect(!result.ok && result.error).toMatch(/already installed/)
	})
})

describe('updateFromRegistry', () => {
	it('validates the new bundle BEFORE overwriting the stored row', async () => {
		getMod.mockResolvedValue(baseStoredRow({ id: 'reg@mod', source: 'registry' }))
		const manifestJson = { id: 'reg@mod', version: '1.1.0', entry: 'bundle.mjs', languages: [] }
		const manifestText = JSON.stringify(manifestJson)
		const manifestHash = await sha256Hex(manifestText)
		const bundleText = 'export default {}'
		const bundleHash = await sha256Hex(bundleText)
		const entry = baseRegistryEntry({
			latestVersion: '1.1.0',
			files: {
				'manifest.json': { url: 'mods/reg@mod/1.1.0/manifest.json', sha256: manifestHash, size: 1 },
				'bundle.mjs': { url: 'mods/reg@mod/1.1.0/bundle.mjs', sha256: bundleHash, size: 1 }
			}
		})
		getIndex.mockResolvedValue({ index: baseRegistryIndex([entry]) })
		loadExternalMod.mockResolvedValue({ id: 'reg@mod', version: '1.1.0' })

		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(textResponse(manifestText))
			.mockResolvedValueOnce(jsonResponse(manifestJson))
			.mockResolvedValueOnce(textResponse(bundleText))
		vi.stubGlobal('fetch', fetchMock)

		const result = await updateFromRegistry('reg@mod')

		expect(result.ok).toBe(true)
		const loadOrder = loadExternalMod.mock.invocationCallOrder[0]
		const putOrder = putMod.mock.invocationCallOrder[0]
		expect(loadOrder).toBeLessThan(putOrder)
	})

	it('keeps the previous version installed when the new bundle fails to load', async () => {
		getMod.mockResolvedValue(baseStoredRow({ id: 'reg@mod', source: 'registry' }))
		const manifestJson = { id: 'reg@mod', version: '1.1.0', entry: 'bundle.mjs', languages: [] }
		const manifestText = JSON.stringify(manifestJson)
		const manifestHash = await sha256Hex(manifestText)
		const bundleText = 'export default {}'
		const bundleHash = await sha256Hex(bundleText)
		const entry = baseRegistryEntry({
			latestVersion: '1.1.0',
			files: {
				'manifest.json': { url: 'mods/reg@mod/1.1.0/manifest.json', sha256: manifestHash, size: 1 },
				'bundle.mjs': { url: 'mods/reg@mod/1.1.0/bundle.mjs', sha256: bundleHash, size: 1 }
			}
		})
		getIndex.mockResolvedValue({ index: baseRegistryIndex([entry]) })
		loadExternalMod.mockRejectedValue(new Error('boom'))

		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(textResponse(manifestText))
			.mockResolvedValueOnce(jsonResponse(manifestJson))
			.mockResolvedValueOnce(textResponse(bundleText))
		vi.stubGlobal('fetch', fetchMock)

		const result = await updateFromRegistry('reg@mod')

		expect(result.ok).toBe(false)
		expect(putMod).not.toHaveBeenCalled()
	})

	it('refuses when the mod is not installed', async () => {
		getMod.mockResolvedValue(undefined)

		const result = await updateFromRegistry('nope@mod')

		expect(result).toEqual({ ok: false, error: '"nope@mod" is not installed' })
	})
})

describe('checkForUpdates', () => {
	it('lists registry-sourced mods with a newer compatible version available', async () => {
		getAllMods.mockResolvedValue([
			baseStoredRow({ id: 'reg@mod', version: '1.0.0', source: 'registry' }),
			baseStoredRow({ id: 'url@mod', version: '1.0.0', source: 'url' })
		])
		getIndex.mockResolvedValue({ index: baseRegistryIndex([baseRegistryEntry({ id: 'reg@mod', latestVersion: '1.1.0' })]) })

		const updates = await checkForUpdates()

		expect(updates).toEqual([{ id: 'reg@mod', installedVersion: '1.0.0', latestCompatibleVersion: '1.1.0' }])
	})

	it('ignores mods already on the latest version', async () => {
		getAllMods.mockResolvedValue([baseStoredRow({ id: 'reg@mod', version: '1.0.0', source: 'registry' })])
		getIndex.mockResolvedValue({ index: baseRegistryIndex([baseRegistryEntry({ id: 'reg@mod', latestVersion: '1.0.0' })]) })

		const updates = await checkForUpdates()

		expect(updates).toEqual([])
	})

	it('returns nothing when the index is unavailable', async () => {
		getAllMods.mockResolvedValue([baseStoredRow({ id: 'reg@mod', version: '1.0.0', source: 'registry' })])
		getIndex.mockResolvedValue({ index: null })

		const updates = await checkForUpdates()

		expect(updates).toEqual([])
	})
})
