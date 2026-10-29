import { ModRegistry } from '@/mods/modRegistry'
import type { FateContext, Character, CharacterModule } from '@/types'
import semver from 'semver'
import { getPatches } from '@/utils/helpers/getPatches'
import { showErrorToast, showSuccessToast, showWarningToast } from '@/utils/helpers/toast'
import i18n from '@/i18n'

const { t } = i18n.global

export async function updateModule(context: FateContext, character: Character, id: string, module: CharacterModule): Promise<boolean> {
	const record = ModRegistry.get(id)

	if (!record) {
		showErrorToast(`errors.module.notFound`, { module: id })
		return false
	}

	// Disabled/errored mods stay on the character; don't patch or toast.
	if (record.status !== 'loaded') {
		return true
	}

	const moduleManifest = record.manifest

	const latestVersion = moduleManifest.version
	const installedVersion = module.version

	if (installedVersion && semver.neq(installedVersion, latestVersion)) {
		const patches = getPatches(moduleManifest.patches || [], installedVersion)

		if (patches.length > 0) {
			const incompatiblePatch = patches.find(patch => patch.incompatible)
			if (incompatiblePatch) {
				showWarningToast(`modules.incompatibleVersion`, { module: t(moduleManifest.name), version: incompatiblePatch.version })
				delete character._modules[id]
				return false
			}

			let notes = ''
			for (const patch of patches) {
				await patch.action?.(context, character)
				notes += patch.note || ''
			}

			notes && showSuccessToast(notes)
		}

		context.modules[id] = {
			...context.modules[id],
			version: latestVersion
		}

		character._modules[id] = {
			...character._modules[id],
			version: latestVersion
		}

		showSuccessToast(`modules.updated`, { module: t(moduleManifest.name), version: latestVersion })
	}

	return true
}

export async function updateModules(context: FateContext, character: Character): Promise<boolean> {
	try {
		const chracterModules = Object.entries(character._modules)

		for (const [id, module] of chracterModules) {
			await updateModule(context, character, id, module)
		}
	} catch (error) {
		showErrorToast(`Error updating modules: ${error}`)
		return false
	}

	return true
}
