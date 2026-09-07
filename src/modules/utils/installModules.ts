import type { Character, FateContext } from '@/types'
import type { FateModuleManifest, ModuleResolutionIssue } from '@/modules/utils/types'
import { getModules } from '@/modules/utils/getModules'
import { markRaw } from 'vue'
import { resolveModules } from '@/modules/utils/resolveModules'
import { showIssuesMessage } from './showIssuesMessage'
import { updateModule } from './updateModules'
import { ModRegistry } from '@/mods/modRegistry'
import { getIndex, isEntryPublished } from '@/mods/registryClient'
import i18n from '@/i18n'

const { t } = i18n.global

/**
 * `character._modules` ids that resolved to nothing (getModules() silently
 * drops ids it can't find a loaded manifest for) but are present in the
 * cached registry index — i.e. "not a typo, just not installed yet" rather
 * than a genuinely unknown/removed mod. Cache-only read (registryClient.getIndex()
 * never fetches), so this never blocks a character load. Ids already known to
 * ModRegistry (disabled/errored, not just missing) are left alone — that's a
 * different, already-surfaced-elsewhere state, not "not installed".
 */
async function findNotInstalledIssues(characterModuleIds: string[], resolvedIds: Set<string>): Promise<ModuleResolutionIssue[]> {
	const missingIds = characterModuleIds.filter(id => !resolvedIds.has(id) && !ModRegistry.get(id))
	if (missingIds.length === 0) {
		return []
	}

	const { index } = await getIndex()
	if (!index) {
		return []
	}

	return missingIds
		.filter(id => index.mods.some(entry => entry.id === id && isEntryPublished(entry)))
		.map(id => ({
			type: 'mod-not-installed',
			moduleId: id,
			moduleName: id,
			details: {},
			suggestedActions: [
				{
					type: 'install',
					description: t('suggestions.modules.install'),
					targetModules: [id]
				}
			]
		}))
}

export async function installModule(module: FateModuleManifest, context: FateContext, character: Character) {
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

	if (module.version !== character._modules[module.id].version) {
		await updateModule(context, character, module.id, character._modules[module.id])
	}

	await module.onInstall(context, character)
}

export async function installModules(context: FateContext, character: Character, modules?: FateModuleManifest[]) {
	const modulesToInstall = modules || getModules(character._modules)
	const result = resolveModules(modulesToInstall)

	// Only meaningful when resolving from the character's own _modules (the
	// "open/load a character" path) — callers that pass an explicit modules
	// list have already resolved what they care about.
	const notInstalledIssues = modules ? [] : await findNotInstalledIssues(Object.keys(character._modules), new Set(modulesToInstall.map(m => m.id)))

	showIssuesMessage([...result.issues, ...notInstalledIssues])

	for (const module of result.resolvedModules) {
		await installModule(module, context, character)
	}
}
