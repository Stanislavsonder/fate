import { resolveValue } from '@intlify/core-base'
import { isValidModId } from '@/mods/modId'

/**
 * Every mod's translations — built-in or external — live under this root, never
 * at the top level beside the app's own namespaces. A mod therefore cannot
 * overwrite an app string however its messages are shaped; the id check
 * (src/mods/modId.ts) is a second line, not the only one.
 */
export const MOD_MESSAGES_ROOT = 'mods'

/**
 * vue-i18n message resolver that lets `<modId>.<key>` stand for
 * `mods.<modId>.<key>`. Mods (and the built-ins' own components) write keys
 * relative to their id, and saved characters already hold keys in that form
 * (e.g. a stress track's name), so the short form keeps working without a
 * data migration — it just can never resolve outside the mods root.
 */
export function modMessageResolver(obj: unknown, path: string): unknown {
	const dot = path.indexOf('.')
	const head = dot === -1 ? path : path.slice(0, dot)
	return resolveValue(obj, isValidModId(head) ? `${MOD_MESSAGES_ROOT}.${path}` : path)
}
