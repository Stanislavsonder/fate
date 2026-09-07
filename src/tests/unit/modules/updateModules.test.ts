import { describe, it, expect, vi, beforeEach } from 'vitest'
import { updateModule, updateModules } from '@/modules/utils/updateModules'
import type { FateModuleManifest } from '@/modules/utils/types'
import type { Character, FateContext } from '@/types'

const mocks = vi.hoisted(() => ({
	patchAction: vi.fn(),
	showErrorToast: vi.fn(),
	showSuccessToast: vi.fn(),
	showWarningToast: vi.fn()
}))

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
						patches: [{ version: '2.0.0', action: mocks.patchAction, note: 'Updated' }]
					},
					source: 'builtin',
					status: 'loaded'
				}
			],
			[
				'test@incompatible',
				{
					manifest: {
						id: 'test@incompatible',
						name: 'Incompatible Module',
						version: '2.0.0',
						patches: [
							{ version: '1.5.0', action: mocks.patchAction, note: 'Partial' },
							{ version: '2.0.0', action: mocks.patchAction, incompatible: true, note: 'Broken' }
						]
					},
					source: 'builtin',
					status: 'loaded'
				}
			],
			[
				'off@mod',
				{
					manifest: { id: 'off@mod', name: 'Off', version: '2.0.0' },
					source: 'url',
					status: 'disabled'
				}
			],
			[
				'broken@mod',
				{
					manifest: { id: 'broken@mod', name: 'Broken', version: '2.0.0' },
					source: 'url',
					status: 'errored',
					error: 'load failed'
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
	showErrorToast: mocks.showErrorToast,
	showSuccessToast: mocks.showSuccessToast,
	showWarningToast: mocks.showWarningToast
}))

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

describe('updateModule', () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it('preserves character data when the module is not in the registry', async () => {
		const context = createContext()
		const character = createCharacter({
			_modules: {
				'missing@module': { version: '1.0.0', config: { keep: true } }
			}
		})

		const result = await updateModule(context, character, 'missing@module', character._modules['missing@module'])

		expect(result).toBe(false)
		expect(character._modules['missing@module']).toEqual({ version: '1.0.0', config: { keep: true } })
		expect(mocks.showErrorToast).toHaveBeenCalledWith('errors.module.notFound', { module: 'missing@module' })
	})

	it('applies version patches for a registered module', async () => {
		const context = createContext({
			modules: {
				'test@module': { id: 'test@module', name: 'Test Module', version: '1.0.0' } as FateModuleManifest
			}
		})
		const character = createCharacter({
			_modules: { 'test@module': { version: '1.0.0' } }
		})

		const result = await updateModule(context, character, 'test@module', character._modules['test@module'])

		expect(result).toBe(true)
		expect(mocks.patchAction).toHaveBeenCalledWith(context, character)
		expect(character._modules['test@module'].version).toBe('2.0.0')
		expect(context.modules['test@module'].version).toBe('2.0.0')
		expect(mocks.showSuccessToast).toHaveBeenCalled()
	})

	it('skips all patch actions and removes the module when a patch is incompatible', async () => {
		const context = createContext({
			modules: {
				'test@incompatible': { id: 'test@incompatible', name: 'Incompatible Module', version: '1.0.0' } as FateModuleManifest
			}
		})
		const character = createCharacter({
			_modules: { 'test@incompatible': { version: '1.0.0' } }
		})

		const result = await updateModule(context, character, 'test@incompatible', character._modules['test@incompatible'])

		expect(result).toBe(false)
		expect(mocks.patchAction).not.toHaveBeenCalled()
		expect(character._modules['test@incompatible']).toBeUndefined()
		expect(context.modules['test@incompatible'].version).toBe('1.0.0')
		expect(mocks.showWarningToast).toHaveBeenCalledWith('modules.incompatibleVersion', {
			module: 'Incompatible Module',
			version: '2.0.0'
		})
		expect(mocks.showSuccessToast).not.toHaveBeenCalled()
	})

	it('skips quietly when the module is installed but disabled', async () => {
		const context = createContext()
		const character = createCharacter({
			_modules: { 'off@mod': { version: '1.0.0', config: { keep: true } } }
		})

		const result = await updateModule(context, character, 'off@mod', character._modules['off@mod'])

		expect(result).toBe(true)
		expect(character._modules['off@mod']).toEqual({ version: '1.0.0', config: { keep: true } })
		expect(mocks.showErrorToast).not.toHaveBeenCalled()
		expect(mocks.patchAction).not.toHaveBeenCalled()
	})

	it('skips quietly when the module is registered but errored', async () => {
		const context = createContext()
		const character = createCharacter({
			_modules: { 'broken@mod': { version: '1.0.0' } }
		})

		const result = await updateModule(context, character, 'broken@mod', character._modules['broken@mod'])

		expect(result).toBe(true)
		expect(character._modules['broken@mod']).toEqual({ version: '1.0.0' })
		expect(mocks.showErrorToast).not.toHaveBeenCalled()
	})
})

describe('updateModules', () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it('preserves unrecognized modules while updating recognized ones', async () => {
		const context = createContext({
			modules: {
				'test@module': { id: 'test@module', name: 'Test Module', version: '1.0.0' } as FateModuleManifest
			}
		})
		const character = createCharacter({
			_modules: {
				'test@module': { version: '1.0.0' },
				'missing@module': { version: '1.0.0', config: { keep: true } }
			}
		})

		const result = await updateModules(context, character)

		expect(result).toBe(true)
		expect(character._modules['missing@module']).toEqual({ version: '1.0.0', config: { keep: true } })
		expect(character._modules['test@module'].version).toBe('2.0.0')
		expect(mocks.showErrorToast).toHaveBeenCalledWith('errors.module.notFound', { module: 'missing@module' })
	})
})
