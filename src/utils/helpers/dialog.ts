import { Dialog } from '@capacitor/dialog'
import { alertController } from '@ionic/vue'
import i18n from '@/i18n'
const { t } = i18n.global

export async function confirmRemove(name?: string): Promise<boolean> {
	const { value } = await Dialog.confirm({
		title: t('common.actions.confirm'),
		message: name ? t('common.messages.remove-named', { value: name }) : t('common.messages.remove'),
		okButtonTitle: t('common.actions.remove'),
		cancelButtonTitle: t('common.actions.cancel')
	})
	return value
}

/** Ionic confirm for uninstalling a stored mod. Names characters that still reference it. */
export async function confirmRemoveMod(name: string, characterNames: string[]): Promise<boolean> {
	const inUse = characterNames.length > 0
	const parts = [t('common.messages.remove-named', { value: name })]
	if (inUse) {
		parts.push(t('settings.mods.removeConfirm.inUse', { characters: characterNames.join(', ') }))
		parts.push(t('settings.mods.removeConfirm.willUninstall'))
	}

	let confirmed = false
	const alert = await alertController.create({
		header: t('common.actions.confirm'),
		message: parts.join('\n\n'),
		cssClass: 'remove-mod-alert',
		htmlAttributes: { 'data-testid': 'remove-mod-alert' },
		buttons: [
			{
				text: t('common.actions.cancel'),
				role: 'cancel',
				htmlAttributes: { 'data-testid': 'remove-mod-cancel' }
			},
			{
				text: t(inUse ? 'settings.mods.actions.removeAnyway' : 'common.actions.remove'),
				role: 'destructive',
				handler: () => {
					confirmed = true
				},
				htmlAttributes: { 'data-testid': 'remove-mod-confirm' }
			}
		]
	})

	await alert.present()
	await alert.onDidDismiss()
	return confirmed
}

/**
 * Typed-confirmation gate before installing code from outside the reviewed
 * registry (README.md decision D10). Uses alertController rather than
 * @capacitor/dialog's Dialog.confirm because the latter has no text-input
 * support — the alert stays open (handler returns false) until the user
 * types the mod id or "install" exactly.
 */
export async function confirmInstallFromUrl(id: string): Promise<boolean> {
	let confirmed = false

	const alert = await alertController.create({
		header: t('settings.developer.installFromUrl.confirmTitle'),
		message: t('settings.developer.installFromUrl.confirmMessage', { id }),
		inputs: [{ name: 'confirmation', type: 'text', placeholder: t('settings.developer.installFromUrl.confirmPlaceholder') }],
		buttons: [
			{ text: t('common.actions.cancel'), role: 'cancel' },
			{
				text: t('common.actions.confirm'),
				handler: (data: { confirmation?: string }) => {
					if (data.confirmation === id || data.confirmation === 'install') {
						confirmed = true
						return true
					}
					return false
				}
			}
		]
	})

	await alert.present()
	await alert.onDidDismiss()
	return confirmed
}

export async function showError(message: string, title?: string): Promise<void> {
	console.error(message)
	await Dialog.alert({
		title,
		message,
		buttonTitle: t('common.actions.confirm')
	})
}
