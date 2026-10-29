import { describe, it, expect, vi } from 'vitest'
import { registerModTranslations } from '@/mods/registerModTranslations'

const { mergeLocaleMessage } = vi.hoisted(() => ({ mergeLocaleMessage: vi.fn() }))

vi.mock('@/i18n', () => ({
	default: {
		global: {
			mergeLocaleMessage
		}
	}
}))

describe('registerModTranslations', () => {
	it('merges each locale under mods.<id>, never at the top level', () => {
		registerModTranslations('test@mod', { en: { greeting: 'Hello from mod' }, ru: { greeting: 'Привет от мода' } })

		expect(mergeLocaleMessage).toHaveBeenCalledTimes(2)
		expect(mergeLocaleMessage).toHaveBeenCalledWith('en', { mods: { 'test@mod': { greeting: 'Hello from mod' } } })
		expect(mergeLocaleMessage).toHaveBeenCalledWith('ru', { mods: { 'test@mod': { greeting: 'Привет от мода' } } })
	})

	it('does nothing when a mod has no translations', () => {
		mergeLocaleMessage.mockClear()

		registerModTranslations('test@empty-mod', {})

		expect(mergeLocaleMessage).not.toHaveBeenCalled()
	})
})
