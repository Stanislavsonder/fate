import { describe, it, expect } from 'vitest'
import { isValidModId } from '@/mods/modId'
import en from '@/i18n/translations/en.json'

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
	// A mod's messages are merged under its raw id, so "no app key contains @"
	// is the other half of what makes that collision-proof. If a future app
	// namespace ever needs an @, mod messages must move under their own root
	// first — see M2 (option B) in planning/mods-2-0-audit.
	it('has no app translation namespace containing @', () => {
		expect(Object.keys(en).filter(key => key.includes('@'))).toEqual([])
	})
})
