import { defineStore } from 'pinia'
import type { Character, CharacterModules } from '@/types'
import { onMounted, ref, watch } from 'vue'
import { debounce } from '@/utils/helpers/debounce'
import useFate from '@/store/useFate'
import CharacterService from '@/service/character.service'
import { showError } from '@/utils/helpers/dialog'
import { showErrorToast } from '@/utils/helpers/toast'
import i18n from '@/i18n'

const { t } = i18n.global

function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error)
}

const useCharacter = defineStore('character', () => {
	const ID_KEY = 'currentCharacter'
	const { installCharacterModules, changeCharacterModules } = useFate()

	const character = ref<Character>()
	const isLoaded = ref<boolean>(false)
	let saveErrorShown = false

	function resetSaveErrorFlag() {
		saveErrorShown = false
	}

	onMounted(async () => {
		const currentCharacterId = localStorage.getItem(ID_KEY)
		if (currentCharacterId) {
			await loadCharacter(Number(currentCharacterId))
			return
		}

		isLoaded.value = true
	})

	watch(character, debounce(updateCharacter, 300), { deep: true })

	async function loadCharacter(id: number) {
		isLoaded.value = false
		resetSaveErrorFlag()

		try {
			character.value = await CharacterService.getCharacter(id)

			if (!character.value) {
				return
			}

			localStorage.setItem(ID_KEY, id.toString())
			character.value = await installCharacterModules(character.value)
		} catch (error: unknown) {
			localStorage.removeItem(ID_KEY)
			character.value = undefined
			await showError(t('errors.character.load', { error: getErrorMessage(error) }))
		} finally {
			isLoaded.value = true
		}
	}

	async function newCharacter(template: Character) {
		isLoaded.value = false
		resetSaveErrorFlag()

		try {
			const created = await CharacterService.createCharacter(template)
			character.value = await installCharacterModules(created)
			localStorage.setItem(ID_KEY, character.value.id.toString())
		} catch (error: unknown) {
			await showError(t('errors.character.create', { error: getErrorMessage(error) }))
			throw error
		} finally {
			isLoaded.value = true
		}
	}

	async function updateCharacter() {
		if (!character.value) {
			return
		}

		try {
			await CharacterService.updateCharacter(character.value)
			saveErrorShown = false
		} catch (error: unknown) {
			if (!saveErrorShown) {
				saveErrorShown = true
				await showErrorToast('errors.character.save', { error: getErrorMessage(error) })
			}
		}
	}

	async function removeCharacter(id: number) {
		try {
			await CharacterService.removeCharacter(id)
		} catch (error: unknown) {
			await showErrorToast('errors.character.remove', { error: getErrorMessage(error) })
			throw error
		}

		if (character.value?.id === id) {
			localStorage.removeItem(ID_KEY)
			character.value = undefined
		}
	}

	async function reconfigureCharacter(id: number, modules: CharacterModules): Promise<void> {
		isLoaded.value = false
		resetSaveErrorFlag()

		try {
			const dbCharacter = await CharacterService.getCharacter(id)

			if (!dbCharacter) {
				throw new Error('Character not found')
			}

			character.value = await changeCharacterModules(dbCharacter, modules)
			await CharacterService.updateCharacter(character.value)
			localStorage.setItem(ID_KEY, character.value.id.toString())
		} catch (error: unknown) {
			if (error instanceof Error && error.message === 'Character not found') {
				throw error
			}
			await showError(t('errors.character.save', { error: getErrorMessage(error) }))
			throw error
		} finally {
			isLoaded.value = true
		}
	}

	return {
		character,
		loadCharacter,
		newCharacter,
		updateCharacter,
		removeCharacter,
		reconfigureCharacter,
		isLoaded
	}
})

export default useCharacter
