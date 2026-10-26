import type { Character, FateContext } from '@/types'
import type { FateModuleManifest, ModuleResolutionIssue } from '@/modules/utils/types'
import { getModules } from '@/modules/utils/getModules'
import { resolveModules } from '@/modules/utils/resolveModules'
import { showIssuesMessage } from './showIssuesMessage'
import { updateModule } from './updateModules'
import { mergeModuleIntoContext } from './buildStaticContext'
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

/** Restores an object's own keys to a shallow snapshot without replacing the object itself. */
function restoreInPlace(target: object, snapshot: object): void {
	const record = target as Record<string, unknown>
	for (const key of Object.keys(record)) {
		if (!(key in snapshot)) {
			delete record[key]
		}
	}
	Object.assign(record, snapshot)
}

export async function installModule(module: FateModuleManifest, context: FateContext, character: Character) {
	// Patches run with this module already merged into the context, so take a
	// snapshot first: an incompatible patch makes updateModule drop the module
	// from the character, and the context has to follow — otherwise the sheet
	// renders a section for a module the character no longer has.
	const snapshot = {
		constants: { ...context.constants },
		templates: { ...context.templates },
		components: [...context.components]
	}

	mergeModuleIntoContext(module, context)

	if (module.version !== character._modules[module.id].version) {
		const updated = await updateModule(context, character, module.id, character._modules[module.id])
		if (!updated) {
			delete context.modules[module.id]
			delete context.shared[module.id]
			restoreInPlace(context.constants, snapshot.constants)
			restoreInPlace(context.templates, snapshot.templates)
			context.components.splice(0, context.components.length, ...snapshot.components)
			return
		}
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
