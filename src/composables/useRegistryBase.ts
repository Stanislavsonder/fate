import { ref, watch } from 'vue'

const STORAGE_KEY = 'registryBaseOverride'

export const DEFAULT_REGISTRY_BASE = 'https://stanislavsonder.github.io/fate-mods'

function getSavedValue(): string {
	return localStorage.getItem(STORAGE_KEY) ?? ''
}

const override = ref<string>(getSavedValue())

watch(override, value => {
	if (value) {
		localStorage.setItem(STORAGE_KEY, value)
	} else {
		localStorage.removeItem(STORAGE_KEY)
	}
})

/**
 * Developer Mode escape hatch for pointing the Mod Store at a staging
 * registry instead of the real published one — the override persists like
 * useDeveloperMode.ts's toggle, but is a URL, not a boolean.
 */
export default function useRegistryBase() {
	function setRegistryBaseOverride(value: string) {
		override.value = value.trim().replace(/\/+$/, '')
	}

	function getRegistryBase(): string {
		return override.value || DEFAULT_REGISTRY_BASE
	}

	return { override, setRegistryBaseOverride, getRegistryBase }
}
