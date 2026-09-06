import { defineFateMod } from '@fate-app/mod-types'
import constants from './src/constants'
import components from './src/components'
import { onInstall, onReconfigure, onUninstall } from './src/actions'

export default defineFateMod({
	constants,
	components,
	onInstall,
	onReconfigure,
	onUninstall
})
