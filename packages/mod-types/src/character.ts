import type { FateContext } from './context'

export type CharacterModule = {
	version: string
	config?: Record<string, unknown>
}

export type CharacterModules = {
	[id: string]: CharacterModule
}

export interface Character {
	_modules: CharacterModules
	_version?: string
	id: number
	name: string
	/**
	 * Core field, not owned by any module — a character always has one
	 * (defaults to `''`, rendered as a placeholder image) so the character
	 * list card never depends on whether sonder@core-identity is installed.
	 * Existing characters are backfilled by src/patches/v2.0.0.ts.
	 */
	avatar: string
	/**
	 * Mod-owned data. Built-ins currently attach typed fields here via
	 * `declare module '@fate-app/mod-types'` augmentation (see each module's
	 * src/types.ts); external mods (Phase 2+), which compile separately and
	 * cannot augment this package, read/write their slice through
	 * getModData/setModData instead.
	 */
	[modKey: string]: unknown
}

export interface FatePatch {
	version: string
	note?: string
	incompatible?: boolean
	action: (context: FateContext, character: Character) => Promise<void>
}
