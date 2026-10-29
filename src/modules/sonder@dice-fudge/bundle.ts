import { defineFateMod } from '@fate-app/mod-types'
import FudgeDice from './src/fudge'

// Dice mods are app-level (registered by src/dice/registerBuiltinDice.ts,
// never installed on a character), so the character-lifecycle hooks are
// unused no-ops — kept only because FateModuleManifest currently requires them.
export default defineFateMod({
	onInstall() {},
	onUninstall() {},
	onReconfigure() {},
	dice: {
		shapes: [FudgeDice]
	}
})
