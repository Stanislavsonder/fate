import { MOD_ID_PATTERN } from '@fate-app/mod-types'

/**
 * A mod id doubles as a namespace: its translations are merged into i18n under
 * `mods.<id>` (src/i18n/modMessages.ts), and its data keys are prefixed with
 * it. The shape is therefore enforced rather than conventional — the mandatory
 * `@` is what lets the i18n resolver tell a mod key from an app key, since no
 * app namespace contains one (asserted in src/tests/unit/mods/modId.test.ts).
 *
 * Kept identical to the registry's own `registry.schema.json` id pattern, so a
 * mod that passes review cannot then be refused at install.
 */
export { MOD_ID_PATTERN }

export function isValidModId(id: unknown): id is string {
	return typeof id === 'string' && MOD_ID_PATTERN.test(id)
}

export function invalidModIdMessage(id: unknown): string {
	return `"${String(id)}" is not a valid mod id — expected "author@name", lowercase letters, digits and hyphens on both sides of the @`
}
