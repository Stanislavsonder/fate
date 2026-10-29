import type { Character, FatePatch } from './character'
import type { FateContext, FateConstants, FateTemplates } from './context'
import type { FateModuleComponent } from './manifest'
import type { DiceConstructor, DiceMaterial } from './dice'

/** The executable half of a mod — the default export of bundle.mjs */
export interface FateModBundle {
	components?: FateModuleComponent[]
	constants?: Partial<FateConstants>
	templates?: Partial<FateTemplates>
	shared?: Record<string, unknown>
	onInstall?(context: FateContext, character: Character): Promise<void> | void
	onUninstall?(context: FateContext, character: Character): Promise<void> | void
	onReconfigure?(context: FateContext, character: Character): Promise<void> | void
	patches?: FatePatch[]
	/** Capability sections. */
	dice?: FateModDice
	theme?: FateModTheme
}

export interface FateModDice {
	shapes?: DiceConstructor[]
	materials?: DiceMaterial[]
}

export interface FateModTheme {
	css: string
}

/** Every capability the host understands. A manifest declaring anything else is refused at load. */
export const FATE_MOD_CAPABILITIES = ['sheetComponents', 'dice', 'theme'] as const

export type FateModCapability = (typeof FATE_MOD_CAPABILITIES)[number]

/** Identity helper that gives mod authors typing + future validation hook */
export function defineFateMod<_TData = unknown>(bundle: FateModBundle): FateModBundle {
	return bundle
}

/**
 * The `author@name` mod id shape. Kept identical to the registry's
 * `registry.schema.json` id pattern; the host app enforces it at install and
 * at load.
 */
export const MOD_ID_PATTERN = /^[a-z0-9-]+@[a-z0-9-]+$/

/**
 * Mod data lives on the character as top-level `<modId>.<key>` fields. Taking
 * the id and the key separately makes the prefix structural: a mod cannot
 * write `name`, `avatar`, `_modules` or another app field through this API,
 * and the host can find (and clean up) everything a mod stored.
 */
function modDataKey(modId: string, key: string): string {
	if (!MOD_ID_PATTERN.test(modId)) {
		throw new Error(`"${String(modId)}" is not a valid mod id — expected "author@name"`)
	}
	if (typeof key !== 'string' || key.length === 0) {
		throw new Error('mod data key must be a non-empty string')
	}
	return `${modId}.${key}`
}

export function getModData<T>(character: Character, modId: string, key: string): T | undefined {
	return (character as unknown as Record<string, unknown>)[modDataKey(modId, key)] as T | undefined
}

export function setModData<T>(character: Character, modId: string, key: string, value: T): void {
	;(character as unknown as Record<string, unknown>)[modDataKey(modId, key)] = value
}

/** Deletes one key of a mod's data, or — with no key — everything the mod stored on the character. */
export function deleteModData(character: Character, modId: string, key?: string): void {
	const record = character as unknown as Record<string, unknown>
	if (key !== undefined) {
		delete record[modDataKey(modId, key)]
		return
	}
	const prefix = modDataKey(modId, '_').slice(0, -1)
	for (const field of Object.keys(record)) {
		if (field.startsWith(prefix)) {
			delete record[field]
		}
	}
}
