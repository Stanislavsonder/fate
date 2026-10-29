import { describe, it, expect } from 'vitest'
import { isValidModId } from '@/mods/modId'
import en from '@/i18n/translations/en.json'
import { MOD_MESSAGES_ROOT } from '@/i18n/modMessages'

describe('isValidModId', () => {
	it('accepts author@name ids', () => {
		expect(isValidModId('sonder@core-skills')).toBe(true)
		expect(isValidModId('a1@b2')).toBe(true)
	})

	it('rejects ids that could shadow an app translation namespace', () => {
		expect(isValidModId('settings')).toBe(false)
		expect(isValidModId('errors')).toBe(false)
		expect(isValidModId('')).toBe(false)
		expect(isValidModId(undefined)).toBe(false)
	})

	it('rejects malformed ids', () => {
		expect(isValidModId('Sonder@Core')).toBe(false)
		expect(isValidModId('sonder@core@extra')).toBe(false)
		expect(isValidModId('sonder@')).toBe(false)
		expect(isValidModId('sonder@core.skills')).toBe(false)
	})
})

describe('i18n namespace safety', () => {
	// Mod messages are merged under the mods root (src/i18n/modMessages.ts), so
	// the app must never claim that root for itself.
	it('leaves the mods root to mods', () => {
		expect(Object.keys(en)).not.toContain(MOD_MESSAGES_ROOT)
	})

	// The resolver routes any path whose first segment is a mod id into the
	// mods root; an app namespace containing @ would be unreachable.
	it('has no app translation namespace containing @', () => {
		expect(Object.keys(en).filter(key => key.includes('@'))).toEqual([])
	})
})
