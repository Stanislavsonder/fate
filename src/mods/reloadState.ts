import { readonly, ref } from 'vue'
import { alertController } from '@ionic/vue'
import i18n from '@/i18n'

const { t } = i18n.global

const reloadRequired = ref(false)
let promptOpen = false

/**
 * Installing, removing, enabling or disabling a mod is only fully applied by a
 * restart: an imported bundle cannot be unloaded, and sheet modules, skins and
 * any timers a mod started are all captured at boot. So every such change asks
 * to restart straight away; "Later" keeps the Mod Store's restart banner up.
 */
export function markModReloadRequired(): void {
	reloadRequired.value = true
	void promptModReload()
}

export function useModReloadRequired() {
	return readonly(reloadRequired)
}

export function reloadApp(): void {
	window.location.reload()
}

async function promptModReload(): Promise<void> {
	if (promptOpen) {
		return
	}
	promptOpen = true
	try {
		const alert = await alertController.create({
			header: t('settings.mods.reloadPrompt.title'),
			message: t('settings.mods.reloadPrompt.message'),
			htmlAttributes: { 'data-testid': 'mod-reload-alert' },
			buttons: [
				{
					text: t('settings.mods.reloadPrompt.later'),
					role: 'cancel',
					htmlAttributes: { 'data-testid': 'mod-reload-later' }
				},
				{
					text: t('settings.mods.reloadPrompt.now'),
					handler: reloadApp,
					htmlAttributes: { 'data-testid': 'mod-reload-now' }
				}
			]
		})
		await alert.present()
		await alert.onDidDismiss()
	} finally {
		promptOpen = false
	}
}
