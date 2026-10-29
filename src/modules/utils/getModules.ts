import { ModRegistry } from '@/mods/modRegistry'
import type { CharacterModules } from '@/types'
import type { FateModuleManifest } from '@/modules/utils/types'

export function getModules(modulesList: CharacterModules): FateModuleManifest[] {
	const Modules = ModRegistry.getLoadedManifests()

	return Object.keys(modulesList)
		.map(id => Modules.get(id))
		.filter(Boolean) as FateModuleManifest[]
}
