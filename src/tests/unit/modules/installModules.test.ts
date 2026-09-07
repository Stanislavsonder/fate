import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { installModule, installModules } from '@/modules/utils/installModules'
import { uninstallModule } from '@/modules/utils/uninstallModules'
import type { FateModuleManifest } from '@/modules/utils/types'
import type { Character, FateContext } from '@/types'

const mocks = vi.hoisted(() => ({
	patchAction: vi.fn(),
	showIssuesMessage: vi.fn()
}))

vi.mock('@/modules/utils/getModules', () => ({
	getModules: vi.fn()
}))

vi.mock('@/modules/utils/showIssuesMessage', () => ({
	showIssuesMessage: mocks.showIssuesMessage
}))

const { getIndex, isEntryPublished } = vi.hoisted(() => ({
	getIndex: vi.fn().mockResolvedValue({ index: null, stale: true, fetchedAt: null }),
	isEntryPublished: (entry: { published?: boolean }) => entry.published !== false
}))
vi.mock('@/mods/registryClient', () => ({ getIndex, isEntryPublished }))

const testModuleRecords = vi.hoisted(
	() =>
		new Map([
			[
				'test@module',
				{
					manifest: {
						id: 'test@module',
						name: 'Test Module',
						version: '2.0.0',
						patches: [{ version: '2.0.0', action: mocks.patchAction }]
					},
					source: 'builtin',
					status: 'loaded'
				}
			]
		])
)

vi.mock('@/mods/modRegistry', () => ({
	ModRegistry: {
		get: vi.fn((id: string) => testModuleRecords.get(id)),
		getLoadedManifests: vi.fn(() => new Map([...testModuleRecords].map(([id, r]) => [id, r.manifest]))),
		getAll: vi.fn(() => [...testModuleRecords.values()]),
		register: vi.fn(),
		remove: vi.fn()
	}
}))

vi.mock('@/utils/helpers/toast', () => ({
	showErrorToast: vi.fn(),
	showSuccessToast: vi.fn(),
	showWarningToast: vi.fn()
}))

import { getModules } from '@/modules/utils/getModules'
import * as updateModulesModule from '@/modules/utils/updateModules'

function createModule(overrides: Partial<FateModuleManifest> = {}): FateModuleManifest {
	return {
		id: 'test@module',
		author: { name: 'Test' },
		description: { short: 'Test' },
		languages: ['en'],
		tags: ['test'],
		name: 'Test Module',
		version: '1.0.0',
		loadPriority: 0,
		onInstall: vi.fn(),
		onUninstall: vi.fn(),
		onReconfigure: vi.fn(),
		...overrides
	}
}

function createContext(overrides: Partial<FateContext> = {}): FateContext {
	return {
		modules: {},
		constants: {},
		components: [],
		templates: { character: { id: 0, name: '', _modules: {} } },
		shared: {},
		...overrides
	} as FateContext
}

function createCharacter(overrides: Partial<Character> = {}): Character {
	return {
		id: 1,
		name: 'Test',
		avatar: '',
		_modules: {},
		...overrides
	}
}

describe('installModule', () => {
	afterEach(() => {
		vi.restoreAllMocks()
	})

	it('registers the module in context and calls onInstall with that context', async () => {
		const context = createContext()
		const character = createCharacter({
			_modules: { 'test@module': { version: '1.0.0' } }
		})
		const onInstall = vi.fn()
		const module = createModule({ onInstall })

		await installModule(module, context, character)

		expect(context.modules['test@module']).toBe(module)
		expect(onInstall).toHaveBeenCalledTimes(1)
		expect(onInstall).toHaveBeenCalledWith(context, character)
	})

	it('awaits async onInstall', async () => {
		const callOrder: string[] = []
		const context = createContext()
		const character = createCharacter({
			_modules: { 'test@module': { version: '1.0.0' } }
		})
		const onInstall = vi.fn(async () => {
			await new Promise(resolve => setTimeout(resolve, 10))
			callOrder.push('onInstall')
		})

		await installModule(createModule({ onInstall }), context, character)
		callOrder.push('afterInstall')

		expect(callOrder).toEqual(['onInstall', 'afterInstall'])
	})

	it('nests shared state under the module id', async () => {
		const context = createContext()
		const character = createCharacter({
			_modules: { 'test@module': { version: '1.0.0' } }
		})
		const shared = { skills: new Map([['fight', 1]]) }
		const module = createModule({
			shared: shared as FateModuleManifest['shared']
		})

		await installModule(module, context, character)

		expect(context.shared).toEqual({
			'test@module': shared
		})
	})

	it('merges constants and templates into the shared context', async () => {
		const context = createContext({
			constants: { EXISTING: true } as unknown as FateContext['constants'],
			templates: {
				character: { id: 0, name: '', _modules: {} },
				existing: { keep: true }
			} as unknown as FateContext['templates']
		})
		const character = createCharacter({
			_modules: { 'test@module': { version: '1.0.0' } }
		})
		const module = createModule({
			constants: { MAX_TOKENS: 9 } as FateModuleManifest['constants'],
			templates: { aspect: { name: '' } } as FateModuleManifest['templates']
		})

		await installModule(module, context, character)

		expect(context.constants).toEqual({ EXISTING: true, MAX_TOKENS: 9 })
		expect(context.templates).toEqual({
			character: { id: 0, name: '', _modules: {} },
			existing: { keep: true },
			aspect: { name: '' }
		})
	})

	it('appends markRaw-wrapped components without replacing existing ones', async () => {
		const existing = { id: 'keep', component: { name: 'Keep' }, order: 1 }
		const context = createContext({ components: [existing] })
		const character = createCharacter({
			_modules: { 'test@module': { version: '1.0.0' } }
		})
		const added = { id: 'add', component: { name: 'Add' }, order: 2 }
		const module = createModule({ components: [added] })

		await installModule(module, context, character)

		expect(context.components).toHaveLength(2)
		expect(context.components[0]).toBe(existing)
		expect(context.components[1].id).toBe('add')
		expect((context.components[1] as { __v_skip?: boolean }).__v_skip).toBe(true)
	})

	it('skips empty shared, constants, templates, and components', async () => {
		const context = createContext({
			shared: { keep: true } as unknown as FateContext['shared'],
			constants: { keep: 1 } as unknown as FateContext['constants'],
			templates: {
				character: { id: 0, name: '', _modules: {} },
				keep: true
			} as unknown as FateContext['templates'],
			components: [{ id: 'keep', component: {}, order: 1 }]
		})
		const character = createCharacter({
			_modules: { 'test@module': { version: '1.0.0' } }
		})
		const module = createModule({
			shared: {},
			constants: {},
			templates: {},
			components: []
		})

		await installModule(module, context, character)

		expect(context.shared).toEqual({ keep: true })
		expect(context.constants).toEqual({ keep: 1 })
		expect(context.templates).toEqual({
			character: { id: 0, name: '', _modules: {} },
			keep: true
		})
		expect(context.components.map(c => c.id)).toEqual(['keep'])
	})

	it('exposes contributed context to onInstall', async () => {
		const context = createContext()
		const character = createCharacter({
			_modules: { 'test@module': { version: '1.0.0' } }
		})
		const onInstall = vi.fn((ctx: FateContext) => {
			expect(ctx.modules['test@module']).toBeDefined()
			expect(ctx.shared).toEqual({
				'test@module': { bag: true }
			})
			expect(ctx.constants).toEqual({ MAX_TOKENS: 9 })
			expect(ctx.templates).toMatchObject({ aspect: { name: '' } })
			expect(ctx.components.map(c => c.id)).toEqual(['ui'])
		})
		const module = createModule({
			shared: { bag: true } as FateModuleManifest['shared'],
			constants: { MAX_TOKENS: 9 } as FateModuleManifest['constants'],
			templates: { aspect: { name: '' } } as FateModuleManifest['templates'],
			components: [{ id: 'ui', component: {}, order: 1 }],
			onInstall
		})

		await installModule(module, context, character)

		expect(onInstall).toHaveBeenCalled()
	})

	it('awaits version update before calling onInstall', async () => {
		const callOrder: string[] = []

		vi.spyOn(updateModulesModule, 'updateModule').mockImplementation(async () => {
			await new Promise(resolve => setTimeout(resolve, 10))
			callOrder.push('updateModule')
			return true
		})

		const onInstall = vi.fn(() => {
			callOrder.push('onInstall')
		})
		const context = createContext()
		const character = createCharacter({
			_modules: { 'test@module': { version: '1.0.0' } }
		})
		const module = createModule({ version: '2.0.0', onInstall })

		await installModule(module, context, character)

		expect(updateModulesModule.updateModule).toHaveBeenCalledWith(context, character, 'test@module', character._modules['test@module'])
		expect(callOrder).toEqual(['updateModule', 'onInstall'])
	})

	it('skips version update when versions match', async () => {
		const updateModuleSpy = vi.spyOn(updateModulesModule, 'updateModule')
		const context = createContext()
		const character = createCharacter({
			_modules: { 'test@module': { version: '1.0.0' } }
		})
		const module = createModule({ version: '1.0.0' })

		await installModule(module, context, character)

		expect(updateModuleSpy).not.toHaveBeenCalled()
	})
})

describe('installModules', () => {
	beforeEach(() => {
		vi.mocked(getModules).mockReset()
		mocks.patchAction.mockClear()
		mocks.showIssuesMessage.mockClear()
		getIndex.mockReset().mockResolvedValue({ index: null, stale: true, fetchedAt: null })
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	it('installs each provided module in dependency-resolved order', async () => {
		const context = createContext()
		const character = createCharacter({
			_modules: {
				'mod-a': { version: '1.0.0' },
				'mod-b': { version: '1.0.0' }
			}
		})
		const order: string[] = []
		const modA = createModule({
			id: 'mod-a',
			loadPriority: 10,
			onInstall: vi.fn(() => {
				order.push('mod-a')
			})
		})
		const modB = createModule({
			id: 'mod-b',
			loadPriority: 0,
			dependencies: { 'mod-a': '1.0.0' },
			onInstall: vi.fn(() => {
				order.push('mod-b')
			})
		})

		await installModules(context, character, [modB, modA])

		expect(order).toEqual(['mod-a', 'mod-b'])
		expect(context.modules['mod-a']).toBe(modA)
		expect(context.modules['mod-b']).toBe(modB)
	})

	it('falls back to getModules(character._modules) when modules are omitted', async () => {
		const context = createContext()
		const character = createCharacter({
			_modules: { 'test@module': { version: '1.0.0' } }
		})
		const module = createModule({ onInstall: vi.fn() })
		vi.mocked(getModules).mockReturnValue([module])

		await installModules(context, character)

		expect(getModules).toHaveBeenCalledWith(character._modules)
		expect(module.onInstall).toHaveBeenCalledWith(context, character)
	})

	it('raises a mod-not-installed issue for a character module id that is absent from ModRegistry but present in the registry index', async () => {
		const context = createContext()
		const character = createCharacter({
			_modules: { 'community@mod': { version: '1.0.0' } }
		})
		vi.mocked(getModules).mockReturnValue([]) // ModRegistry.get('community@mod') is undefined too (not in testModuleRecords)
		getIndex.mockResolvedValue({
			index: { schemaVersion: 1, generatedAt: '', blocklist: {}, mods: [{ id: 'community@mod' }] },
			stale: false,
			fetchedAt: Date.now()
		})

		await installModules(context, character)

		expect(mocks.showIssuesMessage).toHaveBeenCalledWith([expect.objectContaining({ type: 'mod-not-installed', moduleId: 'community@mod' })])
	})

	it('does not raise mod-not-installed for an id absent from both ModRegistry and the registry index', async () => {
		const context = createContext()
		const character = createCharacter({
			_modules: { 'nowhere@mod': { version: '1.0.0' } }
		})
		vi.mocked(getModules).mockReturnValue([])
		getIndex.mockResolvedValue({ index: { schemaVersion: 1, generatedAt: '', blocklist: {}, mods: [] }, stale: false, fetchedAt: Date.now() })

		await installModules(context, character)

		expect(mocks.showIssuesMessage).toHaveBeenCalledWith([])
	})

	it('does not raise mod-not-installed for an id that already has a ModRegistry record (e.g. disabled/errored)', async () => {
		const context = createContext()
		const character = createCharacter({
			_modules: { 'test@module': { version: '1.0.0' } } // present in testModuleRecords via ModRegistry.get mock
		})
		vi.mocked(getModules).mockReturnValue([]) // simulates the record being loaded but not resolvable (e.g. disabled)
		getIndex.mockResolvedValue({
			index: { schemaVersion: 1, generatedAt: '', blocklist: {}, mods: [{ id: 'test@module' }] },
			stale: false,
			fetchedAt: Date.now()
		})

		await installModules(context, character)

		expect(mocks.showIssuesMessage).toHaveBeenCalledWith([])
	})

	it('does not check the registry index when an explicit modules list is provided', async () => {
		const context = createContext()
		const character = createCharacter({
			_modules: { 'mod-a': { version: '1.0.0' } }
		})
		const module = createModule({ id: 'mod-a' })

		await installModules(context, character, [module])

		expect(getIndex).not.toHaveBeenCalled()
	})

	it('does not install modules disabled by resolution and surfaces issues', async () => {
		const context = createContext()
		const character = createCharacter({
			_modules: {
				'mod-a': { version: '1.0.0' }
			}
		})
		const onInstall = vi.fn()
		const module = createModule({
			id: 'mod-a',
			dependencies: { 'missing@dep': '1.0.0' },
			onInstall
		})

		await installModules(context, character, [module])

		expect(onInstall).not.toHaveBeenCalled()
		expect(context.modules['mod-a']).toBeUndefined()
		expect(mocks.showIssuesMessage).toHaveBeenCalled()
		expect(mocks.showIssuesMessage.mock.calls[0][0].length).toBeGreaterThan(0)
	})

	it('runs version patches once when followed by updateModules', async () => {
		mocks.patchAction.mockImplementation(async () => {
			await new Promise(resolve => setTimeout(resolve, 10))
		})

		const context = createContext()
		const character = createCharacter({
			_modules: { 'test@module': { version: '1.0.0' } }
		})
		const module = createModule({ version: '2.0.0' })

		await installModules(context, character, [module])
		await updateModulesModule.updateModules(context, character)

		expect(mocks.patchAction).toHaveBeenCalledTimes(1)
		expect(character._modules['test@module'].version).toBe('2.0.0')
	})
})

describe('install/uninstall round-trip', () => {
	afterEach(() => {
		vi.restoreAllMocks()
	})

	it('restores context contributions while preserving unrelated state', async () => {
		const context = createContext({
			shared: { unrelated: true } as unknown as FateContext['shared'],
			constants: {
				OTHER: 'keep'
			} as unknown as FateContext['constants'],
			templates: {
				character: { id: 0, name: '', _modules: {} },
				other: { keep: true }
			} as unknown as FateContext['templates'],
			components: [{ id: 'other-ui', component: {}, order: 0 }],
			modules: {
				'other@module': createModule({ id: 'other@module' })
			}
		})
		const character = createCharacter({
			_modules: { 'test@module': { version: '1.0.0' } }
		})
		const module = createModule({
			shared: { skills: new Map() } as FateModuleManifest['shared'],
			constants: {
				MAX_TOKENS: 9
			} as FateModuleManifest['constants'],
			templates: { aspect: { name: '' } } as FateModuleManifest['templates'],
			components: [{ id: 'module-ui', component: {}, order: 1 }]
		})

		await installModule(module, context, character)
		await uninstallModule(module, context, character)

		expect(context.modules).toEqual({
			'other@module': expect.objectContaining({ id: 'other@module' })
		})
		expect(context.shared).toEqual({ unrelated: true })
		expect(context.constants).toEqual({ OTHER: 'keep' })
		expect(context.templates).toEqual({
			character: { id: 0, name: '', _modules: {} },
			other: { keep: true }
		})
		expect(context.components.map(c => c.id)).toEqual(['other-ui'])
	})
})
