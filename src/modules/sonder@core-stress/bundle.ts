import { defineFateMod } from '@fate-app/mod-types'
import constants from './src/constants'
import components from './src/components'
import { onInstall, onReconfigure, onUninstall } from './src/actions'
import patches from './src/patches'

export default defineFateMod({
	constants,
	components,
	patches,
	onInstall,
	onReconfigure,
	onUninstall
})
