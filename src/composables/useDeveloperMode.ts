import { ref, watch } from 'vue'

const STORAGE_KEY = 'developerMode'

function getSavedValue(): boolean {
	return localStorage.getItem(STORAGE_KEY) === 'true'
}

const isEnabled = ref<boolean>(getSavedValue())

watch(isEnabled, value => {
	if (value) {
		localStorage.setItem(STORAGE_KEY, 'true')
	} else {
		localStorage.removeItem(STORAGE_KEY)
	}
})

/**
 * Persistent (unlike useDebug.ts's session-only tap-unlock) — gates
 * install-from-URL and dev-mod-server features that a user needs to keep
 * working across restarts to manage what they've already installed.
 */
export default function useDeveloperMode() {
	function setDeveloperMode(value: boolean) {
		isEnabled.value = value
	}

	return { isEnabled, setDeveloperMode }
}
