import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { Character, CharacterModules } from '@/types'

const mockInstallCharacterModules = vi.fn()
const mockChangeCharacterModules = vi.fn()

vi.mock('@/store/useFate', () => ({
	default: () => ({
		installCharacterModules: mockInstallCharacterModules,
		changeCharacterModules: mockChangeCharacterModules
	})
}))

vi.mock('@/service/character.service', () => ({
	default: {
		getCharacter: vi.fn(),
		createCharacter: vi.fn(),
		updateCharacter: vi.fn(),
		removeCharacter: vi.fn()
	}
}))

vi.mock('@/utils/helpers/toast', () => ({
	showErrorToast: vi.fn()
}))

vi.mock('@/utils/helpers/dialog', () => ({
	showError: vi.fn()
}))

import CharacterService from '@/service/character.service'
import { showErrorToast } from '@/utils/helpers/toast'
import { showError } from '@/utils/helpers/dialog'
import useCharacter from '@/store/useCharacter'

function createTestCharacter(overrides: Partial<Character> = {}): Character {
	return {
		id: 1,
		name: 'Test',
		avatar: '',
		_modules: {},
		...overrides
	}
}

describe('useCharacter', () => {
	beforeEach(() => {
		setActivePinia(createPinia())
		localStorage.clear()
		vi.clearAllMocks()
		mockInstallCharacterModules.mockImplementation(async (character: Character) => character)
		mockChangeCharacterModules.mockImplementation(async (character: Character) => character)
	})

	afterEach(() => {
		localStorage.clear()
	})

	describe('loadCharacter', () => {
		it('shows dialog, clears localStorage, and sets isLoaded on Dexie failure', async () => {
			localStorage.setItem('currentCharacter', '1')
			vi.mocked(CharacterService.getCharacter).mockRejectedValue(new Error('Quota exceeded'))

			const store = useCharacter()
			await store.loadCharacter(1)

			expect(showError).toHaveBeenCalledWith('errors.character.load: {"error":"Quota exceeded"}')
			expect(localStorage.getItem('currentCharacter')).toBeNull()
			expect(store.character).toBeUndefined()
			expect(store.isLoaded).toBe(true)
		})

		it('resets save error dedup when switching characters', async () => {
			const store = useCharacter()
			store.character = createTestCharacter()
			vi.mocked(CharacterService.updateCharacter).mockRejectedValue(new Error('save failed'))

			await store.updateCharacter()
			await store.updateCharacter()
			expect(showErrorToast).toHaveBeenCalledTimes(1)

			const loaded = createTestCharacter({ id: 2, name: 'Other' })
			vi.mocked(CharacterService.getCharacter).mockResolvedValue(loaded)
			await store.loadCharacter(2)

			vi.mocked(CharacterService.updateCharacter).mockRejectedValue(new Error('save failed again'))
			await store.updateCharacter()
			expect(showErrorToast).toHaveBeenCalledTimes(2)
		})
	})

	describe('newCharacter', () => {
		it('shows dialog, sets isLoaded, and rethrows on create failure', async () => {
			vi.mocked(CharacterService.createCharacter).mockRejectedValue(new Error('DB blocked'))

			const store = useCharacter()
			await expect(store.newCharacter(createTestCharacter())).rejects.toThrow('DB blocked')

			expect(showError).toHaveBeenCalledWith('errors.character.create: {"error":"DB blocked"}')
			expect(store.isLoaded).toBe(true)
		})
	})

	describe('updateCharacter', () => {
		it('dedupes save error toasts until a successful save', async () => {
			const store = useCharacter()
			store.character = createTestCharacter()
			vi.mocked(CharacterService.updateCharacter).mockRejectedValue(new Error('save failed'))

			await store.updateCharacter()
			await store.updateCharacter()
			expect(showErrorToast).toHaveBeenCalledTimes(1)
			expect(showErrorToast).toHaveBeenCalledWith('errors.character.save', { error: 'save failed' })

			vi.mocked(CharacterService.updateCharacter).mockResolvedValue(1)
			await store.updateCharacter()

			vi.mocked(CharacterService.updateCharacter).mockRejectedValue(new Error('save failed again'))
			await store.updateCharacter()
			expect(showErrorToast).toHaveBeenCalledTimes(2)
		})
	})

	describe('removeCharacter', () => {
		it('shows toast, rethrows, and keeps in-memory character on delete failure', async () => {
			const store = useCharacter()
			const testCharacter = createTestCharacter()
			store.character = testCharacter
			localStorage.setItem('currentCharacter', '1')
			vi.mocked(CharacterService.removeCharacter).mockRejectedValue(new Error('delete failed'))

			await expect(store.removeCharacter(1)).rejects.toThrow('delete failed')

			expect(showErrorToast).toHaveBeenCalledWith('errors.character.remove', { error: 'delete failed' })
			expect(store.character).toEqual(testCharacter)
			expect(localStorage.getItem('currentCharacter')).toBe('1')
		})
	})

	describe('reconfigureCharacter', () => {
		it('throws without dialog when character is not found', async () => {
			vi.mocked(CharacterService.getCharacter).mockResolvedValue(undefined)

			const store = useCharacter()
			await expect(store.reconfigureCharacter(1, {} as CharacterModules)).rejects.toThrow('Character not found')

			expect(showError).not.toHaveBeenCalled()
			expect(store.isLoaded).toBe(true)
		})

		it('shows dialog, sets isLoaded, and rethrows on persistence failure', async () => {
			const testCharacter = createTestCharacter()
			vi.mocked(CharacterService.getCharacter).mockResolvedValue(testCharacter)
			mockChangeCharacterModules.mockResolvedValue(testCharacter)
			vi.mocked(CharacterService.updateCharacter).mockRejectedValue(new Error('save failed'))

			const store = useCharacter()
			await expect(store.reconfigureCharacter(1, {} as CharacterModules)).rejects.toThrow('save failed')

			expect(showError).toHaveBeenCalledWith('errors.character.save: {"error":"save failed"}')
			expect(store.isLoaded).toBe(true)
		})
	})
})
