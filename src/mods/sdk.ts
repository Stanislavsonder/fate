import * as vue from 'vue'
import * as vueI18n from 'vue-i18n'
import * as ionicVue from '@ionic/vue'
import type * as ionicons from 'ionicons/icons'
import type * as three from 'three'
import type * as cannonEs from 'cannon-es'
import { getModData, setModData } from '@fate-app/mod-types'
import { showErrorToast, showSuccessToast } from '@/utils/helpers/toast'

/** ABI version. Bump per docs/MOD_API.md rules: minor for additions, major for anything removed/changed. */
export const SDK_VERSION = '2.0.0'

export interface FateSDK {
	version: string
	vue: typeof vue
	vueI18n: typeof vueI18n
	ionicVue: typeof ionicVue
	/**
	 * Empty until loadFullIconset() runs. The full ~1300-icon set (~800KB) is
	 * only dynamically imported when there's actually an external mod to load
	 * (see src/mods/loader.ts) — built-ins import icons normally and never
	 * read this, so most boots never pay for it. Same "don't eagerly bundle
	 * what nobody's using" reasoning as the built-in dice mods (see
	 * src/dice/registerBuiltinDice.ts).
	 */
	ionicons: typeof ionicons | Record<string, never>
	/**
	 * Empty until loadDiceLibs() runs — only when there's an external
	 * dice-capability mod to load (src/mods/loader.ts), same lazy pattern as
	 * ionicons. `Dice`/`DiceMaterial` (the tiny, three/cannon-es-agnostic base
	 * classes) are NOT here — authors get those as real imports from
	 * @fate-app/mod-types, bundled directly into each mod (see
	 * packages/mod-types/src/dice.ts for why that's safe/cheap). Experimental:
	 * a three/cannon-es major bump is an SDK major (docs/MOD_API.md).
	 */
	dice: { three: typeof three; cannonEs: typeof cannonEs } | Record<string, never>
	api: {
		toast: {
			error: typeof showErrorToast
			success: typeof showSuccessToast
		}
		getModData: typeof getModData
		setModData: typeof setModData
	}
}

declare global {
	var FateSDK: FateSDK
}

/** Installs the host API mod bundles are built against. Call before initMods(). */
export function installFateSDK(): void {
	globalThis.FateSDK = Object.freeze({
		version: SDK_VERSION,
		vue,
		vueI18n,
		ionicVue,
		ionicons: {},
		dice: {},
		api: Object.freeze({
			toast: Object.freeze({ error: showErrorToast, success: showSuccessToast }),
			getModData,
			setModData
		})
	})
}

/**
 * Upgrades FateSDK.ionicons from empty to the full icon set. The loader calls
 * this once, only when there's at least one external mod row to load, so the
 * dynamic import (and the chunk Vite splits it into) is skipped entirely for
 * the common case of no external mods installed.
 */
export async function loadFullIconset(): Promise<void> {
	const ionicons = await import('ionicons/icons')
	globalThis.FateSDK = Object.freeze({ ...globalThis.FateSDK, ionicons })
}

/**
 * Upgrades FateSDK.dice from empty to { three, cannonEs }. The loader calls
 * this once, only when there's at least one external dice-capability mod row
 * to load, so three/cannon-es (large) stay out of the main bundle for the
 * common case of no external dice mods. The built-in Fudge die already imports
 * three/cannon-es directly and never reads this.
 */
export async function loadDiceLibs(): Promise<void> {
	const [three, cannonEs] = await Promise.all([import('three'), import('cannon-es')])
	globalThis.FateSDK = Object.freeze({ ...globalThis.FateSDK, dice: Object.freeze({ three, cannonEs }) })
}
