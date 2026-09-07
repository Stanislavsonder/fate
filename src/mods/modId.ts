/**
 * A mod id doubles as a namespace: its translations are merged into i18n under
 * it, and its data/constant keys are prefixed with it. The shape is therefore
 * enforced rather than conventional — the mandatory `@` is what makes a
 * collision with one of the app's own translation namespaces impossible, since
 * none of those contain one (asserted in src/tests/unit/mods/modId.test.ts).
 *
 * Kept identical to the registry's own `registry.schema.json` id pattern, so a
 * mod that passes review cannot then be refused at install.
 */
export const MOD_ID_PATTERN = /^[a-z0-9-]+@[a-z0-9-]+$/

export function isValidModId(id: unknown): id is string {
	return typeof id === 'string' && MOD_ID_PATTERN.test(id)
}

export function invalidModIdMessage(id: unknown): string {
	return `"${String(id)}" is not a valid mod id — expected "author@name", lowercase letters, digits and hyphens on both sides of the @`
}
