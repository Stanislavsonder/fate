import type { ModuleResolutionIssue } from './types'
import { getToastPositionAnchor, showToast } from '@/utils/helpers/toast'
import { toastController } from '@ionic/vue'
import router, { ROUTES } from '@/router'
import i18n from '@/i18n'

const { t } = i18n.global

/** mod-not-installed gets its own actionable toast (a real "Open Mod Store"
 * button via toastController) rather than being folded into the generic
 * concatenated danger-toast below — it's not an error, it's a "here's
 * something you can do" nudge (README.md Step 8: guided install for a
 * .fchar/character referencing a community mod you don't have yet). */
async function showNotInstalledToast(issue: ModuleResolutionIssue): Promise<void> {
	const toast = await toastController.create({
		message: t('suggestions.modules.notInstalled', { module: issue.moduleId }),
		color: 'warning',
		duration: 6000,
		position: 'top',
		positionAnchor: getToastPositionAnchor(),
		buttons: [
			{
				text: t('suggestions.modules.openModStore'),
				handler: () => {
					router.push(ROUTES.SETTINGS_MODS)
				}
			}
		]
	})
	await toast.present()
}

export function showIssuesMessage(issues: ModuleResolutionIssue[]) {
	let message = ''

	issues.forEach(issue => {
		if (issue.type === 'mod-not-installed') {
			showNotInstalledToast(issue)
			return
		}

		let messageKey: string
		let params: Record<string, unknown> = {}

		switch (issue.type) {
			case 'missing-dependency':
				// Example: "Module 'X' is missing dependency 'Y'."
				messageKey = 'errors.moduleResolution.missingDependency'
				params = {
					module: issue.moduleName,
					dependency: issue.details.dependencyId
				}
				break
			case 'version-mismatch':
				// Example: "Module 'X' requires 'Y' version 'A', but found version 'B'."
				messageKey = 'errors.moduleResolution.versionMismatch'
				params = {
					module: issue.moduleName,
					dependency: issue.details.dependencyName,
					requiredVersion: issue.details.requiredVersion,
					actualVersion: issue.details.actualVersion
				}
				break
			case 'app-version-mismatch':
				// Example: "Module 'X' requires app version 'Y', but current version is 'Z'."
				messageKey = 'errors.moduleResolution.appVersionMismatch'
				params = {
					module: issue.moduleName,
					requiredAppVersion: issue.details.requiredAppVersion,
					currentAppVersion: issue.details.appVersion
				}
				break
			case 'incompatible-modules':
				// Example: "Module 'X' is incompatible with: A, B."
				messageKey = 'errors.moduleResolution.incompatibleModules'
				params = {
					module: issue.moduleName,
					incompatible: issue.details.incompatibleWith?.map(mod => mod.name).join(', ')
				}
				break
			case 'dependency-cycle':
				// Example: "A dependency cycle was detected involving: A, B, C."
				messageKey = 'errors.moduleResolution.dependencyCycle'
				params = {
					modules: issue.details.cycleModules?.map(mod => mod.name).join(', ')
				}
				break
			default:
				messageKey = 'errors.moduleResolution.genericError'
		}

		message += t(messageKey, params) + '\n'
	})

	message && showToast(message, 'danger')
}
