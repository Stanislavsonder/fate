import type { FateModuleManifest } from '@/modules/utils/types'
import type { Character, FateContext } from '@/types'
import constants from '@/utils/config/constants'
import { getModules } from '@/modules/utils/getModules'
import { deleteModData, MOD_ID_PATTERN } from '@fate-app/mod-types'

function asRecord(value: object): Record<string, unknown> {
	return value as unknown as Record<string, unknown>
}

export async function uninstallModule(module: FateModuleManifest, context: FateContext, character: Character) {
	await module.onUninstall(context, character)
	// Whatever the hook left behind under the mod's own prefix goes too.
	if (MOD_ID_PATTERN.test(module.id)) {
		deleteModData(character, module.id)
	}

	if (module.shared && Object.keys(module.shared).length > 0) {
		delete asRecord(context.shared)[module.id]
	}

	if (module.templates && Object.keys(module.templates).length > 0) {
		const templates = asRecord(context.templates)
		for (const key of Object.keys(module.templates)) {
			delete templates[key]
		}
	}

	if (module.constants && Object.keys(module.constants).length > 0) {
		const appConstants = asRecord(constants)
		const contextConstants = asRecord(context.constants)

		for (const key of Object.keys(module.constants)) {
			if (Object.prototype.hasOwnProperty.call(appConstants, key)) {
				contextConstants[key] = appConstants[key]
			} else {
				delete contextConstants[key]
			}
		}
	}

	if (Array.isArray(module.components) && module.components.length > 0) {
		context.components = context.components.filter(component => {
			return !module.components?.find(e => e.id === component.id)
		})
	}

	delete context.modules[module.id]
}

export async function uninstallModules(context: FateContext, character: Character, modules?: FateModuleManifest[]) {
	const modulesToUninstall = modules || getModules(character._modules)

	for (const module of modulesToUninstall) {
		await uninstallModule(module, context, character)
	}
}
