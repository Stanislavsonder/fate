import { Capacitor } from '@capacitor/core'

function canUseServiceWorker(): boolean {
	return window.isSecureContext && 'serviceWorker' in navigator
}

async function unregisterServiceWorkers(): Promise<void> {
	if (!canUseServiceWorker()) {
		return
	}

	const registrations = await navigator.serviceWorker.getRegistrations()
	await Promise.all(registrations.map(registration => registration.unregister()))
}

async function deleteCacheStorage(): Promise<void> {
	if (!('caches' in window)) {
		return
	}

	const keys = await caches.keys()
	await Promise.all(keys.map(key => caches.delete(key)))
}

async function registerWebServiceWorker(): Promise<void> {
	if (import.meta.env.DEV || !canUseServiceWorker()) {
		return
	}

	let refreshing = false
	navigator.serviceWorker.addEventListener('controllerchange', () => {
		if (refreshing) {
			return
		}
		refreshing = true
		window.location.reload()
	})

	await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {
		updateViaCache: 'none'
	})
}

export async function setupServiceWorker(): Promise<void> {
	try {
		if (Capacitor.isNativePlatform()) {
			await unregisterServiceWorkers()
			await deleteCacheStorage()
			return
		}

		await registerWebServiceWorker()
	} catch {
		return
	}
}
