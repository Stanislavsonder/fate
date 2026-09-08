import { describe, it, expect, vi, beforeEach } from 'vitest'
import type * as SdkModule from '@/mods/sdk'
import type * as RegistryClientModule from '@/mods/registryClient'
import type { RegistryIndex } from '@/mods/registryClient'

const { getAll, deleteMod, setBlocked, setEnabled } = vi.hoisted(() => ({
	getAll: vi.fn(),
	deleteMod: vi.fn().mockResolvedValue(undefined),
	setBlocked: vi.fn().mockResolvedValue(undefined),
	setEnabled: vi.fn().mockResolvedValue(undefined)
}))
vi.mock('@/db/tables/mods', () => ({ modsService: { getAll, delete: deleteMod, setBlocked, setEnabled } }))

const { isSeedBlocked } = vi.hoisted(() => ({ isSeedBlocked: vi.fn(() => false) }))
vi.mock('@/mods/blocklist', () => ({ isSeedBlocked }))

// Only the cache read is stubbed — getRegistryRelease stays real so the pin
// lookup is exercised against actual index shapes.
const { getIndex } = vi.hoisted(() => ({ getIndex: vi.fn() }))
vi.mock('@/mods/registryClient', async importOriginal => ({ ...(await importOriginal<typeof RegistryClientModule>()), getIndex }))

const { registerBuiltinMods } = vi.hoisted(() => ({ registerBuiltinMods: vi.fn() }))
vi.mock('@/mods/builtins', () => ({ registerBuiltinMods }))

const { registerModTranslations } = vi.hoisted(() => ({ registerModTranslations: vi.fn() }))
vi.mock('@/mods/registerModTranslations', () => ({ registerModTranslations }))

const { importBlobModule } = vi.hoisted(() => ({ importBlobModule: vi.fn() }))
vi.mock('@/mods/importBlobModule', () => ({ importBlobModule }))

const { loadFullIconset, loadDiceLibs, loadSharedComponents } = vi.hoisted(() => ({
	loadFullIconset: vi.fn().mockResolvedValue(undefined),
	loadDiceLibs: vi.fn().mockResolvedValue(undefined),
	loadSharedComponents: vi.fn().mockResolvedValue(undefined)
}))
vi.mock('@/mods/sdk', async importOriginal => ({
	...(await importOriginal<typeof SdkModule>()),
	loadFullIconset,
	loadDiceLibs,
	loadSharedComponents
}))

import { ModRegistry } from '@/mods/modRegistry'
import { initMods, loadExternalMod } from '@/mods/loader'
import type { StoredMod } from '@/db/tables/mods'

async function sha256(text: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
	return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

function baseRow(overrides: Partial<StoredMod> = {}): StoredMod {
	return {
		id: 'author@mod',
		version: '1.0.0',
		source: 'url',
		enabled: true,
		manifestJson: JSON.stringify({ id: 'author@mod', version: '1.0.0', capabilities: ['sheetComponents'] }),
		bundleCode: 'export default {}',
		translationsJson: '{}',
		sha256: '',
		sourceUrl: 'https://example.com/mods/author@mod',
		installedAt: 0,
		updatedAt: 0,
		...overrides
	}
}

/** An index pinning one version of author@mod to `sha256`. */
function indexPinning(sha256: string, version = '1.0.0'): RegistryIndex {
	return {
		schemaVersion: 2,
		generatedAt: '2026-01-01T00:00:00Z',
		blocklist: {},
		mods: [
			{
				id: 'author@mod',
				latestVersion: version,
				releases: { [version]: { version, files: { 'bundle.mjs': { url: '', sha256, size: 0 } } } }
			} as never
		]
	}
}

beforeEach(() => {
	vi.clearAllMocks()
	isSeedBlocked.mockReturnValue(false)
	getIndex.mockResolvedValue({ index: null, stale: true, fetchedAt: null })
})

describe('loadExternalMod', () => {
	it('happy path: registers translations and returns the assembled manifest', async () => {
		const row = baseRow({ translationsJson: JSON.stringify({ en: { name: 'Mod' } }) })
		row.sha256 = await sha256(row.bundleCode)
		importBlobModule.mockResolvedValue({ components: [] })

		const manifest = await loadExternalMod(row)

		expect(manifest.id).toBe('author@mod')
		expect(loadFullIconset).toHaveBeenCalled()
		expect(loadSharedComponents).toHaveBeenCalled()
		expect(importBlobModule).toHaveBeenCalledWith(row.bundleCode)
		expect(registerModTranslations).toHaveBeenCalledWith('author@mod', { en: { name: 'Mod' } })
	})

	it('populates FateSDK.dice before importing a dice-capability bundle', async () => {
		const row = baseRow({ manifestJson: JSON.stringify({ id: 'author@mod', version: '1.0.0', capabilities: ['dice'] }) })
		row.sha256 = await sha256(row.bundleCode)
		importBlobModule.mockImplementation(async () => {
			// The shimmed bundle reads globalThis.FateSDK.dice.* at module
			// evaluation — loadDiceLibs must have run before we get here.
			expect(loadDiceLibs).toHaveBeenCalled()
			return { dice: {} }
		})

		await loadExternalMod(row)

		expect(importBlobModule).toHaveBeenCalled()
	})

	it('does not load the dice libs for a mod without the dice capability', async () => {
		const row = baseRow()
		row.sha256 = await sha256(row.bundleCode)
		importBlobModule.mockResolvedValue({ components: [] })

		await loadExternalMod(row)

		expect(loadDiceLibs).not.toHaveBeenCalled()
	})

	it('does not load shared components for a mod without the sheetComponents capability', async () => {
		const row = baseRow({ manifestJson: JSON.stringify({ id: 'author@mod', version: '1.0.0', capabilities: ['dice'] }) })
		row.sha256 = await sha256(row.bundleCode)
		importBlobModule.mockResolvedValue({ dice: {} })

		await loadExternalMod(row)

		expect(loadSharedComponents).not.toHaveBeenCalled()
	})

	it('quarantines on hash mismatch without ever importing the bundle', async () => {
		const row = baseRow({ sha256: 'deadbeef' })

		await expect(loadExternalMod(row)).rejects.toThrow(/does not match its stored hash/)
		expect(importBlobModule).not.toHaveBeenCalled()
		expect(loadFullIconset).not.toHaveBeenCalled()
	})

	it('quarantines a registry mod whose stored bundle no longer matches the published hash', async () => {
		const row = baseRow({ source: 'registry' })
		row.sha256 = await sha256(row.bundleCode)
		getIndex.mockResolvedValue({ index: indexPinning('a-different-hash'), stale: false, fetchedAt: 0 })

		await expect(loadExternalMod(row)).rejects.toThrow(/the registry published/)
		expect(importBlobModule).not.toHaveBeenCalled()
	})

	it('loads a registry mod that still matches its published hash', async () => {
		const row = baseRow({ source: 'registry' })
		row.sha256 = await sha256(row.bundleCode)
		getIndex.mockResolvedValue({ index: indexPinning(row.sha256), stale: false, fetchedAt: 0 })
		importBlobModule.mockResolvedValue({ components: [] })

		await expect(loadExternalMod(row)).resolves.toMatchObject({ id: 'author@mod' })
	})

	it('loads a registry mod when no pin is available — an uncached index is not suspicious', async () => {
		const row = baseRow({ source: 'registry', version: '0.9.0' })
		row.sha256 = await sha256(row.bundleCode)
		importBlobModule.mockResolvedValue({ components: [] })

		await expect(loadExternalMod(row)).resolves.toMatchObject({ id: 'author@mod' })

		// Same for an index that carries no pinned release for this old version.
		getIndex.mockResolvedValue({ index: indexPinning('a-different-hash', '2.0.0'), stale: false, fetchedAt: 0 })
		await expect(loadExternalMod(row)).resolves.toMatchObject({ id: 'author@mod' })
	})

	it('quarantines on an sdk-range mismatch without ever importing the bundle', async () => {
		const row = baseRow({ manifestJson: JSON.stringify({ id: 'author@mod', version: '1.0.0', sdk: '^99.0.0' }) })

		await expect(loadExternalMod(row)).rejects.toThrow(/mod-API/)
		expect(importBlobModule).not.toHaveBeenCalled()
		expect(loadFullIconset).not.toHaveBeenCalled()
	})

	it('quarantines a malformed bundle shape', async () => {
		const row = baseRow()
		row.sha256 = await sha256(row.bundleCode)
		importBlobModule.mockResolvedValue({ components: 'not-an-array' })

		await expect(loadExternalMod(row)).rejects.toThrow(/components must be an array/)
	})

	it('quarantines a bundle that tries to declare its own identity or capabilities', async () => {
		const row = baseRow()
		row.sha256 = await sha256(row.bundleCode)
		importBlobModule.mockResolvedValue({
			id: 'sonder@core-skills',
			capabilities: ['theme'],
			theme: { css: ':root{}' },
			components: []
		})

		await expect(loadExternalMod(row)).rejects.toThrow(/manifest-only keys \(id, capabilities\)/)
	})

	it('quarantines a mod whose id could shadow an app translation namespace', async () => {
		const row = baseRow({ id: 'settings', manifestJson: JSON.stringify({ id: 'settings', version: '1.0.0' }) })
		row.sha256 = await sha256(row.bundleCode)

		await expect(loadExternalMod(row)).rejects.toThrow(/not a valid mod id/)
		expect(registerModTranslations).not.toHaveBeenCalled()
	})

	it('quarantines a stored manifest whose id does not match the row', async () => {
		const row = baseRow({ manifestJson: JSON.stringify({ id: 'someone@else', version: '1.0.0' }) })
		row.sha256 = await sha256(row.bundleCode)

		await expect(loadExternalMod(row)).rejects.toThrow(/does not match the installed id/)
		expect(importBlobModule).not.toHaveBeenCalled()
		expect(registerModTranslations).not.toHaveBeenCalled()
	})

	it('skips the hash check for dev-mode mods', async () => {
		const row = baseRow({ source: 'dev', sha256: 'irrelevant-and-wrong' })
		importBlobModule.mockResolvedValue({})

		await expect(loadExternalMod(row)).resolves.toMatchObject({ id: 'author@mod' })
	})
})

describe('initMods', () => {
	it('registers built-ins first, then quarantines a failing external mod instead of throwing', async () => {
		const row = baseRow({
			id: 'bad@mod',
			manifestJson: JSON.stringify({ id: 'bad@mod', version: '1.0.0', capabilities: ['sheetComponents'] }),
			sha256: 'wrong'
		})
		getAll.mockResolvedValue([row])

		await expect(initMods()).resolves.toBeUndefined()

		expect(registerBuiltinMods).toHaveBeenCalled()
		const record = ModRegistry.get('bad@mod')
		expect(record?.status).toBe('errored')
		expect(record?.error).toMatch(/does not match its stored hash/)
	})

	it('registers a successfully loaded external mod as loaded', async () => {
		const row = baseRow({ id: 'good@mod', manifestJson: JSON.stringify({ id: 'good@mod', version: '1.0.0' }) })
		row.sha256 = await sha256(row.bundleCode)
		getAll.mockResolvedValue([row])
		importBlobModule.mockResolvedValue({})

		await initMods()

		const record = ModRegistry.get('good@mod')
		expect(record?.status).toBe('loaded')
		expect(record?.source).toBe('url')
	})

	it('silently drops an unreachable dev mod instead of quarantining it', async () => {
		const row = baseRow({
			id: 'stale-dev@mod',
			source: 'dev',
			manifestJson: JSON.stringify({ id: 'stale-dev@mod', version: '1.0.0' })
		})
		getAll.mockResolvedValue([row])
		importBlobModule.mockRejectedValue(new Error('dev server unreachable'))

		await initMods()

		expect(ModRegistry.get('stale-dev@mod')).toBeUndefined()
		expect(deleteMod).toHaveBeenCalledWith('stale-dev@mod')
	})

	it('does not import a blocked mod, even while it is still marked enabled', async () => {
		const row = baseRow({ id: 'blocked@mod', blocked: true, manifestJson: JSON.stringify({ id: 'blocked@mod', version: '1.0.0' }) })
		getAll.mockResolvedValue([row])

		await initMods()

		expect(importBlobModule).not.toHaveBeenCalled()
		expect(ModRegistry.get('blocked@mod')?.status).toBe('disabled')
	})

	it('applies the compiled-in seed blocklist offline, before the bundle is imported', async () => {
		const row = baseRow({ id: 'seed-blocked@mod', manifestJson: JSON.stringify({ id: 'seed-blocked@mod', version: '1.0.0' }) })
		getAll.mockResolvedValue([row])
		isSeedBlocked.mockReturnValue(true)

		await initMods()

		expect(importBlobModule).not.toHaveBeenCalled()
		expect(setBlocked).toHaveBeenCalledWith('seed-blocked@mod', true)
		expect(setEnabled).toHaveBeenCalledWith('seed-blocked@mod', false)
		expect(ModRegistry.get('seed-blocked@mod')?.status).toBe('disabled')
	})

	it('registers a disabled stored mod as a stub without importing its bundle', async () => {
		const row = baseRow({
			id: 'off@mod',
			enabled: false,
			manifestJson: JSON.stringify({ id: 'off@mod', version: '1.0.0' }),
			translationsJson: JSON.stringify({ en: { name: 'Off' } })
		})
		getAll.mockResolvedValue([row])

		await initMods()

		expect(importBlobModule).not.toHaveBeenCalled()
		expect(registerModTranslations).toHaveBeenCalledWith('off@mod', { en: { name: 'Off' } })
		const record = ModRegistry.get('off@mod')
		expect(record?.status).toBe('disabled')
		expect(record?.manifest.id).toBe('off@mod')
	})
})
