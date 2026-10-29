import { ref, watch } from 'vue'

const STORAGE_KEY = 'debugMode'

function getSavedValue(): boolean {
	return localStorage.getItem(STORAGE_KEY) === 'true'
}

const isDebug = ref<boolean>(getSavedValue())

watch(isDebug, value => {
	if (value) {
		localStorage.setItem(STORAGE_KEY, 'true')
	} else {
		localStorage.removeItem(STORAGE_KEY)
	}
})

/** Persistent — a toggle in Settings -> Developer ("Show debug information"), not the old tap-the-version-5x gesture. */
function useDebug() {
	function setDebugMode(value: boolean) {
		isDebug.value = value
	}

	function debug(message: string, ...args: unknown[]) {
		if (!isDebug.value) {
			return
		}
		console.debug(message, ...args)
	}

	return {
		isDebug,
		debug,
		setDebugMode
	}
}

export default useDebug
