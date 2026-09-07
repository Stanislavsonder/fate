import type { Component } from 'vue'
import type { Character, FatePatch } from './character'
import type { FateConstants, FateContext, FateShared, FateTemplates } from './context'
import type { FateModCapability, FateModDice, FateModTheme } from './bundle'

export interface FateModuleComponent {
	id: string
	component: Component
	order: number
}

export interface FateModuleManifest {
	id: string
	name: string
	version: string
	author: {
		name: string
		email?: string
		url?: string
	}
	description: {
		short: string
		full?: string
	}
	image?: string
	languages: string[]
	tags: string[]
	dependencies?: Record<string, string>
	incompatibleWith?: string[]
	appVersion?: string
	loadPriority: number
	/** When false, the mod is omitted from the public registry index and hidden from the Mod Store. Defaults to true when omitted. */
	published?: boolean
	components?: FateModuleComponent[]
	constants?: Partial<FateConstants>
	templates?: Partial<FateTemplates>
	shared?: Partial<FateShared>

	onInstall(context: FateContext, character: Character): Promise<void> | void
	onUninstall(context: FateContext, character: Character): Promise<void> | void
	onReconfigure(context: FateContext, character: Character): Promise<void> | void

	patches?: FatePatch[]
	config?: FateModuleConfig

	/** Host mod-API (ABI) semver range this manifest was built against */
	sdk?: string
	/** Entry file relative to the mod's published directory, e.g. "bundle.mjs" */
	entry?: string
	capabilities?: FateModCapability[]
	/** For 'translations'-capability mods: what the pack translates — "app" and/or other mod ids.
	 * Declarative only for now (schema stub); the runtime merge is not implemented yet. */
	translationTargets?: string[]
	/** Present when capabilities includes 'dice' — spread onto the manifest by assembleMod() from the bundle */
	dice?: FateModDice
	/** Present when capabilities includes 'theme' — spread onto the manifest by assembleMod() from the bundle */
	theme?: FateModTheme

	extra?: {
		[key: string]: unknown
	}
}

export interface FateModuleConfig {
	groups: FateModuleConfigGroup[]
	options: FateModuleConfigOption[]
}

export type FateModuleConfigGroup = {
	id: string
	name: string
	description: string
}

export type FateModuleConfigField = {
	id: string
	name: string
	tooltip?: string
	type: 'string' | 'number' | 'select' | 'custom-list' | 'boolean' | 'range'
	multiple?: boolean
	default: unknown
	limits?: {
		min?: number
		max?: number
		step?: number
	}
	options?: {
		value: string
		label: string
	}[]
	itemTemplate?: {
		fields: FateModuleConfigField[]
	}
}

export type FateModuleConfigOption = {
	id: string
	groupId?: string
	name: string
	tooltip?: string
	type: 'number' | 'string' | 'boolean' | 'select' | 'range' | 'custom-list'
	multiple?: boolean
	default: unknown
	limits?: {
		min?: number
		max?: number
		step?: number
	}
	options?: {
		value: string
		label: string
	}[]
	itemTemplate?: {
		fields: FateModuleConfigField[]
	}
}
