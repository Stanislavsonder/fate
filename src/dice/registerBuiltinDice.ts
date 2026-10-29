import { ModRegistry } from '@/mods/modRegistry'
import { DICE_SHAPES, DICE_MATERIALS } from './constants'
import SonderDiceFudge from '@/modules/sonder@dice-fudge'
import type { FateModDice } from '@fate-app/mod-types'

const BUILTIN_DICE_MODS = [SonderDiceFudge]

let builtinsRegistered = false

/**
 * Registers the built-in dice mods (unnamespaced keys — currently 'Fudge' — for
 * backward-compat with persisted localStorage['dice-roll-config'] and
 * DEFAULT_DICE_SCENE_CONFIG's hardcoded default) once per app lifetime, then
 * syncs every OTHER loaded mod declaring the 'dice' capability under
 * namespaced `${modId}:${name}` keys — collisions are only possible once
 * arbitrary external code exists, which is exactly what namespacing guards
 * against. Deliberately NOT called from main.ts/initMods(): this module (and
 * the external sync below) touches src/dice/constants.ts, which pulls in
 * three/cannon-es via the default material files — see this file's original
 * doc comment history and src/mods/sdk.ts's loadDiceLibs for the same
 * lazy-loading reasoning. Called once per Roll Dice page visit, from
 * useDiceScene() — RollDicePage isn't kept-alive, so every visit re-syncs
 * against current ModRegistry state, which is what makes a since-removed
 * external die disappear from DICE_SHAPES without needing install/remove
 * hooks elsewhere.
 */
export function registerBuiltinDice(): void {
	if (!builtinsRegistered) {
		builtinsRegistered = true
		for (const manifest of BUILTIN_DICE_MODS) {
			ModRegistry.register({ manifest, source: 'builtin', status: 'loaded' })
			registerDiceEntries(manifest.dice, undefined)
		}
	}
	syncExternalDice()
}

/**
 * Full rebuild of the namespaced (external) portion of DICE_SHAPES/
 * DICE_MATERIALS from current ModRegistry state — authoritative, so a mod
 * that was removed/disabled/errored since the last call doesn't leave stale
 * entries behind. Builtin (unnamespaced) entries are untouched.
 */
export function syncExternalDice(): void {
	for (const key of [...DICE_SHAPES.keys()]) {
		if (key.includes(':')) {
			DICE_SHAPES.delete(key)
		}
	}
	for (const key of [...DICE_MATERIALS.keys()]) {
		if (key.includes(':')) {
			DICE_MATERIALS.delete(key)
		}
	}

	for (const record of ModRegistry.getAll()) {
		if (record.source === 'builtin' || record.status !== 'loaded' || !record.manifest.capabilities?.includes('dice')) {
			continue
		}
		registerDiceEntries(record.manifest.dice, record.manifest.id)
	}
}

function registerDiceEntries(dice: FateModDice | undefined, modId: string | undefined): void {
	if (!dice) {
		return
	}
	const prefix = modId ? `${modId}:` : ''
	for (const shape of dice.shapes ?? []) {
		DICE_SHAPES.set(`${prefix}${shape.name}`, shape)
	}
	for (const material of dice.materials ?? []) {
		DICE_MATERIALS.set(`${prefix}${material.name}`, material)
	}
}
