import type { FatePatch } from '@/types'

/**
 * `avatar` moved from an optional field owned by sonder@core-identity to a
 * required core Character field (packages/mod-types/src/character.ts), so
 * every character — including ones with no modules installed — always has
 * one. Backfills existing characters that predate this change, whether or
 * not they ever had sonder@core-identity installed.
 *
 * sonder@core-identity itself is removed as of this version — name/avatar
 * are the core fields above regardless, and its other fields (race,
 * description) were never anything but plain character data, so they're left
 * alone rather than deleted (a future mod covering the same ground could
 * still pick them up). The only real cleanup needed is the module reference
 * itself: without this, a pre-2.0.0 character (e.g. from 1.4.5) still lists
 * sonder@core-identity in `_modules`, and since the module no longer exists
 * in the registry, `updateModule` (src/modules/utils/updateModules.ts) would
 * error with "module not found" on every load instead of just quietly
 * forgetting about it. This patch runs before installModules/updateModules
 * (see src/store/useFate.ts), so it beats that error to the punch.
 */
const v2_0_0: FatePatch = {
	version: '2.0.0',
	action: async (_context, character) => {
		character.avatar = character.avatar ?? ''
		delete character._modules['sonder@core-identity']
	}
}

export default v2_0_0
