import { createApp } from 'vue'
import App from './App.vue'
import router from '@/router'
import { IonicVue } from '@ionic/vue'
import '@/styles/index.css'
import i18n from '@/i18n'
import { createPinia } from 'pinia'
import { defineCustomElements } from '@ionic/pwa-elements/loader'
import { setupServiceWorker } from '@/utils/helpers/serviceWorker'
import { showErrorToast } from '@/utils/helpers/toast'
import { initMods } from '@/mods/loader'
import { refreshIndex } from '@/mods/registryClient'
import { applyPersistedSkin } from '@/composables/useSkins'
import { installFateSDK } from '@/mods/sdk'

installFateSDK()

const UNEXPECTED_TOAST_COOLDOWN_MS = 10_000

let lastUnexpectedToastAt = 0
let isReportingUnexpectedError = false

function isIgnorableError(error: unknown): boolean {
	const text = error instanceof Error ? error.message : String(error ?? '')
	return text.includes('ResizeObserver')
}

function reportUnexpectedError(label: string, error: unknown, extra?: unknown): void {
	if (isIgnorableError(error)) {
		return
	}

	if (extra === undefined) {
		console.error(label, error)
	} else {
		console.error(label, error, extra)
	}

	if (isReportingUnexpectedError) {
		return
	}

	const now = Date.now()
	if (now - lastUnexpectedToastAt < UNEXPECTED_TOAST_COOLDOWN_MS) {
		return
	}

	isReportingUnexpectedError = true
	lastUnexpectedToastAt = now

	void showErrorToast('errors.unexpected').finally(() => {
		isReportingUnexpectedError = false
	})
}

void setupServiceWorker()
defineCustomElements(window)
const pinia = createPinia()
const app = createApp(App).use(IonicVue).use(i18n).use(router).use(pinia)

app.config.errorHandler = (err, _instance, info) => {
	reportUnexpectedError('[Vue error]', err, info)
}

window.addEventListener('error', event => {
	if (!event.error && !event.message) {
		return
	}

	if (isIgnorableError(event.message) || isIgnorableError(event.error)) {
		return
	}

	reportUnexpectedError('[Uncaught error]', event.error ?? event.message)
})

window.addEventListener('unhandledrejection', event => {
	reportUnexpectedError('[Unhandled rejection]', event.reason)
})

// initMods() registers built-ins first, then loads any installed external
// mods — every failure along the way is quarantined internally, never thrown,
// but `.finally` here is the last line of defense: even a catastrophic loader
// failure must still mount the app with built-ins only (README.md cross-phase
// rules 2 and 3).
initMods().finally(() => {
	applyPersistedSkin()
	router.isReady().then(() => app.mount('#app'))
	// Registry index refresh is a pure background concern — never awaited,
	// never blocks boot. refreshIndex() itself never throws.
	refreshIndex()
})
