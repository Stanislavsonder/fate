import { describe, it, expect, vi, beforeEach } from 'vitest'
import { uninstallModule, uninstallModules } from '@/modules/utils/uninstallModules'
import type { FateModuleManifest } from '@/modules/utils/types'
import type { Character, FateContext } from '@/types'

vi.mock('@/modules/utils/getModules', () => ({
	getModules: vi.fn()
}))

vi.mock('@/utils/config/constants', () => ({
	default: {
		APP_DEFAULT: 'from-app'
	}
}))

import { getModules } from '@/modules/utils/getModules'

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

describe('uninstallModule', () => {
	it('calls onUninstall before tearing down contributed context', async () => {
		const callOrder: string[] = []
		const context = createContext({
			modules: {
				'test@module': createModule()
			},
			shared: {
				'test@module': { skills: new Map() }
			} as FateContext['shared'],
			constants: { MAX_TOKENS: 5 } as FateContext['constants'],
			templates: {
				character: { id: 0, name: '', _modules: {} },
				aspect: { name: '' }
			} as unknown as FateContext['templates'],
			components: [{ id: 'remove-me', component: {}, order: 1 }]
		})
		const character = createCharacter()
		const onUninstall = vi.fn((ctx: FateContext) => {
			callOrder.push('onUninstall')
			expect(ctx.modules['test@module']).toBeDefined()
			expect(ctx.shared).toEqual({
				'test@module': { skills: expect.any(Map) }
			})
			expect(ctx.constants).toEqual({ MAX_TOKENS: 5 })
			expect(ctx.templates).toMatchObject({ aspect: { name: '' } })
			expect(ctx.components.map(c => c.id)).toEqual(['remove-me'])
		})
		const module = createModule({
			shared: { skills: new Map() } as FateModuleManifest['shared'],
			constants: { MAX_TOKENS: 5 } as FateModuleManifest['constants'],
			templates: { aspect: { name: '' } } as FateModuleManifest['templates'],
			components: [{ id: 'remove-me', component: {}, order: 1 }],
			onUninstall
		})

		await uninstallModule(module, context, character)
		callOrder.push('afterUninstall')

		expect(callOrder).toEqual(['onUninstall', 'afterUninstall'])
		expect(onUninstall).toHaveBeenCalledWith(context, character)
		expect(context.modules['test@module']).toBeUndefined()
		expect(context.shared).toEqual({})
		expect(context.constants).toEqual({})
		expect(context.templates).toEqual({
			character: { id: 0, name: '', _modules: {} }
		})
		expect(context.components).toEqual([])
	})

	it('awaits async onUninstall before cleanup', async () => {
		const callOrder: string[] = []
		const context = createContext({
			modules: { 'test@module': createModule() },
			shared: {
				'test@module': { bag: true }
			} as FateContext['shared']
		})
		const character = createCharacter()
		const onUninstall = vi.fn(async () => {
			await new Promise(resolve => setTimeout(resolve, 10))
			callOrder.push('onUninstall')
			expect(context.shared).toEqual({
				'test@module': { bag: true }
			})
		})

		await uninstallModule(
			createModule({
				shared: { bag: true } as FateModuleManifest['shared'],
				onUninstall
			}),
			context,
			character
		)
		callOrder.push('afterUninstall')

		expect(callOrder).toEqual(['onUninstall', 'afterUninstall'])
		expect(context.shared).toEqual({})
	})

	it('removes shared by module id, not by nested shared keys', async () => {
		const context = createContext({
			shared: {
				'test@module': { skills: new Map() },
				skills: 'must-keep',
				other: true
			} as unknown as FateContext['shared']
		})
		const character = createCharacter()
		const module = createModule({
			shared: { skills: new Map() } as FateModuleManifest['shared']
		})

		await uninstallModule(module, context, character)

		expect(context.shared).toEqual({
			skills: 'must-keep',
			other: true
		})
	})

	it('removes only the uninstalled module components and keeps others', async () => {
		const context = createContext({
			components: [
				{ id: 'keep-a', component: {}, order: 1 },
				{ id: 'remove-me', component: {}, order: 2 },
				{ id: 'keep-b', component: {}, order: 3 }
			]
		})
		const character = createCharacter()
		const module = createModule({
			components: [{ id: 'remove-me', component: {}, order: 2 }]
		})

		await uninstallModule(module, context, character)

		expect(context.components.map(c => c.id)).toEqual(['keep-a', 'keep-b'])
	})

	it('does not touch components when the module has none', async () => {
		const components = [
			{ id: 'keep-a', component: {}, order: 1 },
			{ id: 'keep-b', component: {}, order: 2 }
		]
		const context = createContext({ components: [...components] })
		const character = createCharacter()
		const module = createModule({ components: [] })

		await uninstallModule(module, context, character)

		expect(context.components).toEqual(components)
	})

	it('removes template keys declared by the module and keeps others', async () => {
		const context = createContext({
			templates: {
				character: { id: 0, name: '', _modules: {} },
				customTemplate: { foo: 'bar' },
				other: { keep: true }
			} as unknown as FateContext['templates']
		})
		const character = createCharacter()
		const module = createModule({
			templates: { customTemplate: { foo: 'bar' } } as FateModuleManifest['templates']
		})

		await uninstallModule(module, context, character)

		expect(context.templates).toEqual({
			character: { id: 0, name: '', _modules: {} },
			other: { keep: true }
		})
	})

	it('deletes module-only constants and restores app-level defaults', async () => {
		const context = createContext({
			constants: {
				MAX_TOKENS: 5,
				APP_DEFAULT: 'overridden',
				OTHER: 'keep'
			} as unknown as FateContext['constants']
		})
		const character = createCharacter()
		const module = createModule({
			constants: {
				MAX_TOKENS: 5,
				APP_DEFAULT: 'overridden'
			} as FateModuleManifest['constants']
		})

		await uninstallModule(module, context, character)

		expect(context.constants).toEqual({
			APP_DEFAULT: 'from-app',
			OTHER: 'keep'
		})
	})

	it('unregisters the module from context.modules', async () => {
		const module = createModule()
		const other = createModule({ id: 'other@module' })
		const context = createContext({
			modules: {
				'test@module': module,
				'other@module': other
			}
		})
		const character = createCharacter()

		await uninstallModule(module, context, character)

		expect(context.modules).toEqual({
			'other@module': other
		})
	})

	it('leaves unrelated context intact when module contributes nothing', async () => {
		const context = createContext({
			modules: { 'test@module': createModule() },
			shared: { keep: true } as unknown as FateContext['shared'],
			constants: { keep: 1 } as unknown as FateContext['constants'],
			templates: {
				character: { id: 0, name: '', _modules: {} },
				keep: true
			} as unknown as FateContext['templates'],
			components: [{ id: 'keep', component: {}, order: 1 }]
		})
		const character = createCharacter()
		const module = createModule({
			shared: {},
			constants: {},
			templates: {},
			components: []
		})

		await uninstallModule(module, context, character)

		expect(context.shared).toEqual({ keep: true })
		expect(context.constants).toEqual({ keep: 1 })
		expect(context.templates).toEqual({
			character: { id: 0, name: '', _modules: {} },
			keep: true
		})
		expect(context.components.map(c => c.id)).toEqual(['keep'])
		expect(context.modules['test@module']).toBeUndefined()
	})
})

describe('uninstallModules', () => {
	beforeEach(() => {
		vi.mocked(getModules).mockReset()
	})

	it('uninstalls each provided module sequentially', async () => {
		const order: string[] = []
		const context = createContext({
			modules: {
				'mod-a': createModule({ id: 'mod-a' }),
				'mod-b': createModule({ id: 'mod-b' })
			},
			components: [
				{ id: 'a', component: {}, order: 1 },
				{ id: 'b', component: {}, order: 2 },
				{ id: 'c', component: {}, order: 3 }
			]
		})
		const character = createCharacter()
		const modA = createModule({
			id: 'mod-a',
			components: [{ id: 'a', component: {}, order: 1 }],
			onUninstall: vi.fn(async () => {
				await new Promise(resolve => setTimeout(resolve, 10))
				order.push('mod-a')
			})
		})
		const modB = createModule({
			id: 'mod-b',
			components: [{ id: 'b', component: {}, order: 2 }],
			onUninstall: vi.fn(() => {
				order.push('mod-b')
			})
		})

		await uninstallModules(context, character, [modA, modB])

		expect(order).toEqual(['mod-a', 'mod-b'])
		expect(context.components.map(c => c.id)).toEqual(['c'])
		expect(context.modules).toEqual({})
		expect(modA.onUninstall).toHaveBeenCalledWith(context, character)
		expect(modB.onUninstall).toHaveBeenCalledWith(context, character)
	})

	it('falls back to getModules(character._modules) when modules are omitted', async () => {
		const context = createContext({
			components: [
				{ id: 'remove-me', component: {}, order: 1 },
				{ id: 'keep-me', component: {}, order: 2 }
			]
		})
		const character = createCharacter({
			_modules: { 'test@module': { version: '1.0.0' } }
		})
		const module = createModule({
			components: [{ id: 'remove-me', component: {}, order: 1 }],
			onUninstall: vi.fn()
		})
		vi.mocked(getModules).mockReturnValue([module])

		await uninstallModules(context, character)

		expect(getModules).toHaveBeenCalledWith(character._modules)
		expect(context.components.map(c => c.id)).toEqual(['keep-me'])
		expect(module.onUninstall).toHaveBeenCalledWith(context, character)
	})
})
