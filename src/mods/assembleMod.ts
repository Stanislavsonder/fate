import { signRecord } from '@/modules/utils/localizationSigners'
import type { FateModBundle, FateModuleManifest } from '@fate-app/mod-types'

/**
 * Merges a mod's static manifest.json with its executable bundle into one
 * FateModuleManifest. Built-ins call this from their index.ts today; the
 * Phase 2 runtime loader will call the same function for downloaded mods —
 * keep this the single source of truth so the two paths cannot drift.
 */
export function assembleMod<M extends Record<string, unknown>>(manifestJson: M, bundle: FateModBundle): FateModuleManifest {
	return {
		...signRecord(manifestJson, manifestJson.id as string),
		...bundle
	} as unknown as FateModuleManifest
}
