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

export function getModData<T>(character: Character, key: string): T | undefined {
	return (character as unknown as Record<string, unknown>)[key] as T | undefined
}

export function setModData<T>(character: Character, key: string, value: T): void {
	;(character as unknown as Record<string, unknown>)[key] = value
}
