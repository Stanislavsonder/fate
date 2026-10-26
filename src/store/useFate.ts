import { defineStore } from 'pinia'
import type { Character, CharacterModules, FateContext } from '@/types'
import { ref } from 'vue'
import { templates, constants } from '@/utils/config'
import { modulesDiff } from '@/modules/utils/modulesDiff'
import { installModules } from '@/modules/utils/installModules'
import { buildStaticContext } from '@/modules/utils/buildStaticContext'
import { uninstallModules } from '@/modules/utils/uninstallModules'
import { getModules } from '@/modules/utils/getModules'
import { mergeComponents } from '@/utils/helpers/mergeComponents'
import { showError } from '@/utils/helpers/dialog'
import { showErrorToast } from '@/utils/helpers/toast'
import { clone, safeClone } from '@/utils/helpers/clone'
import { updateModules } from '@/modules/utils/updateModules'
import characterService from '@/service/character.service'
import { updateApplication } from '@/utils/helpers/updateApplication'

const EMPTY_FATE_CONTEXT: FateContext = {
	modules: {},
	constants,
	templates,
	shared: {},
	components: []
}

function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error)
}

const useFate = defineStore('fate', () => {
	const context = ref<FateContext>(clone(EMPTY_FATE_CONTEXT))
	const isReady = ref<boolean>(true)

	async function installCharacterModules(character: Character): Promise<Character> {
		isReady.value = false
		const contextBackup = getContextClone()
		const characterBackup = clone(character)
		let installedCharacter: Character | undefined

		try {
			const ctx = clone(EMPTY_FATE_CONTEXT)

			const isAppUpdated = await updateApplication(ctx, character)

			if (!isAppUpdated) {
				return characterBackup
			}

			await installModules(ctx, character)
			await updateModules(ctx, character)

			context.value = ctx
			installedCharacter = character
		} catch (error: unknown) {
			const errorMessage = getErrorMessage(error)
			await showError(`Error installing character modules: ${errorMessage}. Reverting changes.`)
			context.value = contextBackup
			return characterBackup
		} finally {
			isReady.value = true
		}

		if (installedCharacter) {
			try {
				await characterService.updateCharacter(installedCharacter)
			} catch (error: unknown) {
				await showErrorToast('errors.character.save', { error: getErrorMessage(error) })
			}
		}

		return installedCharacter ?? characterBackup
	}

	async function changeCharacterModules(character: Character, newModules: CharacterModules): Promise<Character> {
		isReady.value = false
		const characterBackup = structuredClone(character)
		const contextBackup = getContextClone()

		try {
			const char = { ...character, _modules: newModules }
			const ctx = clone(EMPTY_FATE_CONTEXT)

			// Get change instructions
			const diff = modulesDiff(character._modules, newModules)

			// Uninstall removed modules against the context the character's
			// current modules produce, so onUninstall sees the same shared /
			// constants it would on the sheet. Only character data matters here;
			// the context itself is rebuilt below.
			const uninstallCtx = buildStaticContext(safeClone(EMPTY_FATE_CONTEXT), character._modules)
			await uninstallModules(uninstallCtx, char, getModules(diff.uninstall))

			// Rebuild context from defaults for all remaining modules
			await installModules(ctx, char)

			// Apply config-only changes on top of the fresh context
			for (const m of getModules(diff.reconfigure)) {
				m.onReconfigure(ctx, char)
			}
			context.value = ctx
			return char
		} catch (error: unknown) {
			const errorMessage = getErrorMessage(error)
			await showError(`Error changing character modules: ${errorMessage}. Reverting changes.`)
			context.value = contextBackup
			return characterBackup
		} finally {
			isReady.value = true
		}
	}

	function getModuleComponents() {
		return mergeComponents(context.value.components)
	}

	function getContextClone() {
		return safeClone(context.value)
	}

	return {
		context,
		isReady,
		installCharacterModules,
		changeCharacterModules,
		getModuleComponents
	}
})

export default useFate
