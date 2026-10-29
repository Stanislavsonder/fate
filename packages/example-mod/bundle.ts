import { defineFateMod } from '@fate-app/mod-types'
import components from './src/components'
import { onInstall, onUninstall, onReconfigure } from './src/actions'

export default defineFateMod({
	components,
	onInstall,
	onUninstall,
	onReconfigure
})
