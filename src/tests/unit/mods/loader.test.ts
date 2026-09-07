import { describe, it, expect, vi, beforeEach } from 'vitest'
import type * as SdkModule from '@/mods/sdk'

const { getAllEnabled, deleteMod } = vi.hoisted(() => ({ getAllEnabled: vi.fn(), deleteMod: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/db/tables/mods', () => ({ modsService: { getAllEnabled, delete: deleteMod } }))

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

beforeEach(() => {
	vi.clearAllMocks()
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

		await expect(loadExternalMod(row)).rejects.toThrow(/hash mismatch/)
		expect(importBlobModule).not.toHaveBeenCalled()
		expect(loadFullIconset).not.toHaveBeenCalled()
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
		getAllEnabled.mockResolvedValue([row])

		await expect(initMods()).resolves.toBeUndefined()

		expect(registerBuiltinMods).toHaveBeenCalled()
		const record = ModRegistry.get('bad@mod')
		expect(record?.status).toBe('errored')
		expect(record?.error).toMatch(/hash mismatch/)
	})

	it('registers a successfully loaded external mod as loaded', async () => {
		const row = baseRow({ id: 'good@mod', manifestJson: JSON.stringify({ id: 'good@mod', version: '1.0.0' }) })
		row.sha256 = await sha256(row.bundleCode)
		getAllEnabled.mockResolvedValue([row])
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
		getAllEnabled.mockResolvedValue([row])
		importBlobModule.mockRejectedValue(new Error('dev server unreachable'))

		await initMods()

		expect(ModRegistry.get('stale-dev@mod')).toBeUndefined()
		expect(deleteMod).toHaveBeenCalledWith('stale-dev@mod')
	})
})
