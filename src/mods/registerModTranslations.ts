import i18n from '@/i18n'
import { MOD_MESSAGES_ROOT } from '@/i18n/modMessages'

/**
 * Merges a mod's translations into the app's i18n instance at registration
 * time, namespaced under `mods.<modId>` — never at the top level, so no mod can
 * reach the app's own strings. Components still write `$t('<modId>.key')`;
 * src/i18n/modMessages.ts resolves that into the mods root. Must run after `createI18n` (src/i18n
 * is created at import time, before any mod registers) and before first
 * render of that mod's UI. Reused unchanged by the Phase 2 runtime loader
 * for downloaded mods.
 */
export function registerModTranslations(modId: string, translations: Record<string, Record<string, unknown>>): void {
	for (const [lang, messages] of Object.entries(translations)) {
		i18n.global.mergeLocaleMessage(lang, { [MOD_MESSAGES_ROOT]: { [modId]: messages } })
	}
}
