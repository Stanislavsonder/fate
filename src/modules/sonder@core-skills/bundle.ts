import { defineFateMod } from '@fate-app/mod-types'
import constants from './src/constants'
import components from './src/components'
import { onInstall, onReconfigure, onUninstall } from './src/actions'
import shared from './src/shared'

export default defineFateMod({
	constants,
	components,
	shared,
	onInstall,
	onReconfigure,
	onUninstall
})
