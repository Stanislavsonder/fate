import { defineFateMod } from '@fate-app/mod-types'
import constants from './src/constants'
import components from './src/components'
import templates from './src/templates'
import { onInstall, onReconfigure, onUninstall } from './src/actions'

export default defineFateMod({
	constants,
	templates,
	components,
	onInstall,
	onReconfigure,
	onUninstall
})
