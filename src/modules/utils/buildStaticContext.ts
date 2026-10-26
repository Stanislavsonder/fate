import type { Character, FateContext } from '@/types'
import type { FateModuleManifest } from '@/modules/utils/types'
import { getModules } from '@/modules/utils/getModules'
import { resolveModules } from '@/modules/utils/resolveModules'
import { markRaw } from 'vue'

/**
 * Merges a module's static contributions (manifest, shared, constants,
 * templates, components) into a context without running any of its hooks.
 */
export function mergeModuleIntoContext(module: FateModuleManifest, context: FateContext): void {
	context.modules[module.id] = module

	if (module.shared && Object.keys(module.shared).length > 0) {
		Object.assign(context.shared, {
			[module.id]: module.shared
		})
	}

	if (module.constants && Object.keys(module.constants).length > 0) {
		Object.assign(context.constants, module.constants)
	}

	if (module.templates && Object.keys(module.templates).length > 0) {
		Object.assign(context.templates, module.templates)
	}

	if (Array.isArray(module.components) && module.components.length > 0) {
		context.components.push(...module.components.map(markRaw))
	}
}

/**
 * Builds the context a character's modules would produce, statically — no
 * patches, no onInstall. For paths that need a realistic context to hand to
 * onUninstall (removing a mod, changing a character's modules) without
 * loading the character.
 */
export function buildStaticContext(context: FateContext, characterModules: Character['_modules']): FateContext {
	for (const module of resolveModules(getModules(characterModules)).resolvedModules) {
		mergeModuleIntoContext(module, context)
	}
	return context
}
