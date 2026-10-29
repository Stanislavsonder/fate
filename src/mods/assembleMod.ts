import { signRecord } from '@/modules/utils/localizationSigners'
import type { FateModBundle, FateModuleManifest } from '@fate-app/mod-types'

/**
 * Keys the bundle is allowed to contribute. Everything the loader gates on
 * (id, version, sdk, capabilities, dependencies, appVersion) is read from
 * manifest.json *before* the bundle is imported, so letting the bundle spread
 * over the manifest would let a mod pick its identity and capabilities after
 * every gate had already passed. `satisfies` keeps this list in sync with
 * FateModBundle — a new bundle key won't compile until it's listed here.
 */
const BUNDLE_KEYS = {
	components: true,
	constants: true,
	templates: true,
	shared: true,
	onInstall: true,
	onUninstall: true,
	onReconfigure: true,
	patches: true,
	dice: true,
	theme: true
} satisfies Record<keyof FateModBundle, true>

/**
 * Merges a mod's static manifest.json with its executable bundle into one
 * FateModuleManifest. Built-ins call this from their index.ts, the runtime
 * loader calls it for downloaded mods — keep this the single source of truth
 * so the two paths cannot drift.
 */
export function assembleMod<M extends Record<string, unknown>>(manifestJson: M, bundle: FateModBundle): FateModuleManifest {
	const assembled = signRecord(manifestJson, manifestJson.id as string) as Record<string, unknown>

	for (const key of Object.keys(BUNDLE_KEYS) as (keyof FateModBundle)[]) {
		if (bundle[key] !== undefined) {
			assembled[key] = bundle[key]
		}
	}

	return assembled as unknown as FateModuleManifest
}
