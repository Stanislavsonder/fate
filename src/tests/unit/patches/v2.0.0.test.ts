import { describe, it, expect } from 'vitest'
import v2_0_0 from '@/patches/v2.0.0'
import type { Character, FateContext } from '@/types'

function createContext(): FateContext {
	return {
		modules: {},
		constants: {},
		components: [],
		templates: { character: { id: 0, name: '', avatar: '', _modules: {} } },
		shared: {}
	} as unknown as FateContext
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

describe('app patch v2.0.0', () => {
	it('backfills avatar for a pre-2.0.0 character', async () => {
		const character = createCharacter({ avatar: undefined as unknown as string })

		await v2_0_0.action(createContext(), character)

		expect(character.avatar).toBe('')
	})

	it('preserves an existing avatar', async () => {
		const character = createCharacter({ avatar: 'data:image/png;base64,...' })

		await v2_0_0.action(createContext(), character)

		expect(character.avatar).toBe('data:image/png;base64,...')
	})

	it('drops the removed sonder@core-identity module reference, leaving its data alone', async () => {
		const character = createCharacter({
			_modules: { 'sonder@core-identity': { version: '1.1.0' } },
			race: 'Human',
			description: 'A story so far.'
		})

		await v2_0_0.action(createContext(), character)

		expect(character._modules['sonder@core-identity']).toBeUndefined()
		expect(character.race).toBe('Human')
		expect(character.description).toBe('A story so far.')
	})

	it('is a no-op for a character that never had sonder@core-identity installed', async () => {
		const character = createCharacter({ _modules: { 'sonder@core-aspects': { version: '1.0.0' } } })

		await v2_0_0.action(createContext(), character)

		expect(character._modules).toEqual({ 'sonder@core-aspects': { version: '1.0.0' } })
	})
})
