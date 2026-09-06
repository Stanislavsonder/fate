import { getModData, setModData } from '@fate-app/mod-types'
import type { Character, FateContext } from '@fate-app/mod-types'
import manifest from '../manifest.json'

const NOTE_KEY = 'sonder@example.note'
const CONFIG_KEY = 'max-note-length'
const CONSTANT_KEY = 'sonder@example.maxNoteLength'
const DEFAULT_MAX_LENGTH = 200

function applyConfig(context: FateContext, character: Character): void {
	const config = character._modules[manifest.id]?.config
	const configured = config && Object.hasOwn(config, CONFIG_KEY) ? Number(config[CONFIG_KEY]) : NaN
	context.constants[CONSTANT_KEY] = Number.isFinite(configured) ? configured : DEFAULT_MAX_LENGTH
}

export function onInstall(context: FateContext, character: Character): void {
	applyConfig(context, character)
	// onInstall runs on every character load, not just first install (see
	// docs/MOD_API.md) - only set the default when the key is genuinely unset,
	// exactly like the built-in modules' `character.field = character.field ?? default` pattern.
	setModData(character, NOTE_KEY, getModData<string>(character, NOTE_KEY) ?? '')
}

export function onUninstall(_context: FateContext, character: Character): void {
	delete character[NOTE_KEY]
}

export function onReconfigure(context: FateContext, character: Character): void {
	applyConfig(context, character)
}
