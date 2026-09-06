import { ModRegistry } from '@/mods/modRegistry'
import type { FateModuleManifest } from '@fate-app/mod-types'

/**
 * Loaded mods that can be installed on a character sheet — excludes
 * app-level mods (dice, theme) which register at boot but are never part of
 * a character's _modules. A manifest with no `capabilities` at all is
 * treated as a sheet module for backwards compatibility.
 */
export function getSheetModules(): Map<string, FateModuleManifest> {
	return new Map([...ModRegistry.getLoadedManifests()].filter(([, manifest]) => !manifest.capabilities || manifest.capabilities.includes('sheetComponents')))
}
