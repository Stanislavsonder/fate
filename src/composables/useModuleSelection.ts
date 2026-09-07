import { ref, computed, reactive } from 'vue'
import semver from 'semver'
import { version as appVersion } from '../../package.json'
import type { FateModuleManifest } from '@/modules/utils/types'
import { useI18n } from 'vue-i18n'
import type { CharacterModules } from '@/types'

export interface ModuleDisplayState extends FateModuleManifest {
	isSelected: boolean
	disabled: boolean
	reason: string
	configuration: Record<string, unknown>
}

/**
 * A composable that:
 * - Keeps track of which modules the user has selected
 * - Stores a per-module configuration object
 * - Dynamically computes for each module whether it’s disabled (due to appVersion mismatch,
 *   incompatibility, unsatisfied dependencies, or because other modules depend on it)
 */
export function useModuleSelection(allModules: Map<string, FateModuleManifest>, initialConfiguration?: CharacterModules) {
	const { t } = useI18n()

	const selectedIds = ref<Set<string>>(new Set())
	const configMap = reactive<Record<string, Record<string, unknown>>>({})

	if (initialConfiguration) {
		for (const [modId, data] of Object.entries(initialConfiguration)) {
			if (allModules.has(modId)) {
				selectedIds.value.add(modId)
				configMap[modId] = data.config ? { ...data.config } : {}
			}
		}
	}

	function missingDependencies(mod: FateModuleManifest): string[] {
		const deps = mod.dependencies ?? {}
		return Object.keys(deps).filter(depId => !selectedIds.value.has(depId))
	}

	function getModulesThatRequire(modId: string): string[] {
		const requiredBy: string[] = []
		for (const selId of selectedIds.value) {
			if (selId === modId) continue
			const selMod = allModules.get(selId)
			if (selMod?.dependencies && Object.keys(selMod.dependencies).includes(modId)) {
				requiredBy.push(selId)
			}
		}
		return requiredBy
	}

	const modulesForDisplay = computed<ModuleDisplayState[]>(() => {
		return Array.from(allModules.values()).map(mod => {
			const isSelected = selectedIds.value.has(mod.id)
			let disabled = false
			let reason = ''

			if (mod.appVersion && !semver.satisfies(appVersion, mod.appVersion)) {
				disabled = true
				reason = t('errors.module.appVersionMismatch', {
					requiredVersion: mod.appVersion,
					appVersion: appVersion
				})
			}

			if (!isSelected && !disabled) {
				// Incompatibilities
				for (const selId of selectedIds.value) {
					const selMod = allModules.get(selId)!
					if (selMod?.incompatibleWith?.includes(mod.id)) {
						disabled = true
						reason = t('errors.module.incompatible', { anotherModule: t(selMod.name) })
						break
					}
					if (mod.incompatibleWith?.includes(selId)) {
						disabled = true
						reason = t('errors.module.incompatible', { anotherModule: t(selMod.name) })
						break
					}
				}
				// Missing dependencies
				if (!disabled) {
					const missing = missingDependencies(mod)
					if (missing.length > 0) {
						disabled = true
						reason = t('errors.module.missingDependencies', {
							modules: missing.map(e => `"${t(allModules.get(e)!.name)}"`).join(', ')
						})
					}
				}
			}

			if (isSelected && !disabled) {
				const requiredBy = getModulesThatRequire(mod.id)
				if (requiredBy.length > 0) {
					disabled = true
					reason = t('errors.module.otherDependsOn', {
						modules: requiredBy.map(e => `"${t(allModules.get(e)!.name)}"`).join(', ')
					})
				}
			}

			const configuration = configMap[mod.id] || {}

			return {
				...mod,
				isSelected,
				disabled,
				reason,
				configuration
			}
		})
	})

	function toggleModule(modId: string) {
		const modState = modulesForDisplay.value.find(m => m.id === modId)
		if (!modState) {
			alert(t('errors.module.notFound', { module: modId }))
			return
		}
		if (modState.disabled) {
			if (modState.reason) {
				alert(modState.reason)
			}
			return
		}

		if (selectedIds.value.has(modId)) {
			selectedIds.value.delete(modId)
		} else {
			selectedIds.value.add(modId)
			if (!configMap[modId]) {
				configMap[modId] = {}
			}
		}
	}

	function importConfiguration(configuration: CharacterModules) {
		for (const [modId, data] of Object.entries(configuration)) {
			if (allModules.has(modId)) {
				selectedIds.value.add(modId)
				configMap[modId] = { ...data.config }
			}
		}
	}

	function getConfigs(): CharacterModules {
		const finalModules: CharacterModules = {}
		for (const m of modulesForDisplay.value) {
			if (m.isSelected) {
				finalModules[m.id] = {
					version: m.version,
					config: m.configuration
				}
			}
		}

		// Modules that are on the character but not selectable right now (disabled
		// or errored in the registry) stay attached so Update does not strip them.
		if (initialConfiguration) {
			for (const [id, data] of Object.entries(initialConfiguration)) {
				if (!(id in finalModules) && !allModules.has(id)) {
					finalModules[id] = data
				}
			}
		}

		return finalModules
	}

	return {
		selectedIds,
		modulesForDisplay,
		getConfigs,
		toggleModule,
		importConfiguration
	}
}
