import { describe, it, expect } from 'vitest'
import { createI18n } from 'vue-i18n'
import { MOD_MESSAGES_ROOT, modMessageResolver } from '@/i18n/modMessages'

function createTestI18n() {
	return createI18n({
		legacy: false,
		locale: 'en',
		fallbackLocale: 'en',
		missingWarn: false,
		fallbackWarn: false,
		messages: { en: { settings: { title: 'Settings' } } },
		messageResolver: modMessageResolver
	})
}

function mergeMod(i18n: ReturnType<typeof createTestI18n>, id: string, messages: Record<string, unknown>) {
	i18n.global.mergeLocaleMessage('en', { [MOD_MESSAGES_ROOT]: { [id]: messages } })
}

describe('modMessageResolver', () => {
	it('resolves <modId>.<key> from the mods root, with interpolation', () => {
		const i18n = createTestI18n()
		mergeMod(i18n, 'author@mod', { label: 'Mod label', price: 'Costs {value}' })

		expect(i18n.global.t('author@mod.label')).toBe('Mod label')
		expect(i18n.global.t('author@mod.price', { value: 3 })).toBe('Costs 3')
		expect(i18n.global.t('mods.author@mod.label')).toBe('Mod label')
		expect(i18n.global.te('author@mod.label')).toBe(true)
	})

	it('leaves app keys alone, whatever a mod ships', () => {
		const i18n = createTestI18n()
		mergeMod(i18n, 'evil@mod', { settings: { title: 'Pwned' } })

		expect(i18n.global.t('settings.title')).toBe('Settings')
		expect(i18n.global.t('evil@mod.settings.title')).toBe('Pwned')
	})

	it('never resolves a mod-id path outside the mods root', () => {
		const i18n = createTestI18n()
		i18n.global.mergeLocaleMessage('en', { 'author@mod': { label: 'top-level' } })

		expect(i18n.global.te('author@mod.label')).toBe(false)
	})
})
