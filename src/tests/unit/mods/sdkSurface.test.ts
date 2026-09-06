import { describe, it, expect } from 'vitest'
import { installFateSDK } from '@/mods/sdk'
import * as modTypes from '@fate-app/mod-types'

/**
 * Guards the mod-facing ABI surface: FateSDK's own keys (what a bundle reads
 * off globalThis.FateSDK at runtime) and @fate-app/mod-types' named runtime
 * exports (what a bundle imports at build time). If any of these lists
 * change, SDK_VERSION (src/mods/sdk.ts) must also bump — minor for
 * additions, major for anything removed/renamed — and @fate-app/mod-types /
 * @fate-app/mod-build's own package versions must follow (see both
 * packages' READMEs). Update this test's expected lists in the same PR as
 * the bump, never separately.
 */
describe('mod-facing ABI surface', () => {
	it('FateSDK top-level keys', () => {
		installFateSDK()
		expect(Object.keys(globalThis.FateSDK).sort()).toEqual(['api', 'dice', 'ionicVue', 'ionicons', 'version', 'vue', 'vueI18n'])
	})

	it('FateSDK.api surface', () => {
		installFateSDK()
		expect(Object.keys(globalThis.FateSDK.api).sort()).toEqual(['getModData', 'setModData', 'toast'])
		expect(Object.keys(globalThis.FateSDK.api.toast).sort()).toEqual(['error', 'success'])
	})

	it('@fate-app/mod-types named runtime exports', () => {
		expect(Object.keys(modTypes).sort()).toEqual(['Dice', 'DiceMaterial', 'defineFateMod', 'getModData', 'setModData', 'validateBundleShape'])
	})
})
