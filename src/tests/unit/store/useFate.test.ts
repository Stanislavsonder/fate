import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { Character } from '@/types'

vi.mock('@/utils/helpers/updateApplication', () => ({
	updateApplication: vi.fn().mockResolvedValue(true)
}))

vi.mock('@/modules/utils/installModules', () => ({
	installModules: vi.fn()
}))

vi.mock('@/modules/utils/buildStaticContext', () => ({
	buildStaticContext: vi.fn(context => context)
}))

vi.mock('@/modules/utils/updateModules', () => ({
	updateModules: vi.fn().mockResolvedValue(undefined)
}))

vi.mock('@/modules/utils/getModules', () => ({
	getModules: vi.fn().mockReturnValue([])
}))

vi.mock('@/modules/utils/uninstallModules', () => ({
	uninstallModules: vi.fn()
}))

vi.mock('@/modules/utils/modulesDiff', () => ({
	modulesDiff: vi.fn().mockReturnValue({ install: {}, uninstall: {}, reconfigure: {} })
}))

vi.mock('@/utils/helpers/mergeComponents', () => ({
	mergeComponents: vi.fn().mockReturnValue([])
}))

vi.mock('@/service/character.service', () => ({
	default: {
		updateCharacter: vi.fn()
	}
}))

vi.mock('@/utils/helpers/toast', () => ({
	showErrorToast: vi.fn()
}))

vi.mock('@/utils/helpers/dialog', () => ({
	showError: vi.fn()
}))

import characterService from '@/service/character.service'
import { showErrorToast } from '@/utils/helpers/toast'
import { showError } from '@/utils/helpers/dialog'
import useFate from '@/store/useFate'

describe('useFate installCharacterModules', () => {
	beforeEach(() => {
		setActivePinia(createPinia())
		vi.clearAllMocks()
	})

	it('shows save toast not revert dialog when install succeeds but save fails', async () => {
		vi.mocked(characterService.updateCharacter).mockRejectedValue(new Error('quota'))

		const store = useFate()
		const character: Character = { id: 1, name: 'Test', avatar: '', _modules: {} }
		const result = await store.installCharacterModules(character)

		expect(showErrorToast).toHaveBeenCalledWith('errors.character.save', { error: 'quota' })
		expect(showError).not.toHaveBeenCalled()
		expect(result).toEqual(character)
		expect(store.isReady).toBe(true)
	})
})
