import { ref, watch } from 'vue'
import useDeveloperMode from './useDeveloperMode'

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
 * The override decides where registry.json, the blocklist, and every pinned
 * artifact hash come from, and it lives in localStorage — which mod code can
 * write, since mods run in the app's own origin. So it is honoured only while
 * Developer Mode is on and only for a transport we can trust: https anywhere,
 * or plain http on loopback for a local staging registry.
 */
function isUsableOverride(value: string): boolean {
	if (!value) {
		return false
	}
	try {
		const { protocol, hostname } = new URL(value)
		return protocol === 'https:' || (protocol === 'http:' && (hostname === 'localhost' || hostname === '127.0.0.1'))
	} catch {
		return false
	}
}

/**
 * Developer Mode escape hatch for pointing the Mod Store at a staging
 * registry instead of the real published one — the override persists like
 * useDeveloperMode.ts's toggle, but is a URL, not a boolean.
 */
export default function useRegistryBase() {
	const { isEnabled } = useDeveloperMode()

	function setRegistryBaseOverride(value: string) {
		override.value = value.trim().replace(/\/+$/, '')
	}

	function getRegistryBase(): string {
		return isEnabled.value && isUsableOverride(override.value) ? override.value : DEFAULT_REGISTRY_BASE
	}

	return { override, setRegistryBaseOverride, getRegistryBase }
}
