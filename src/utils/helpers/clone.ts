import cloneDeep from 'lodash/cloneDeep'
import { unref } from 'vue'

/**
 * Deep-clones a given value using JSON.parse(JSON.stringify(...)), unwrapping
 * any Vue ref by calling `unref(value)` first. This effectively removes reactivity
 * and returns a plain data structure with identical (serializable) content.
 *
 * **Note:**
 * - Non-serializable values (functions, `undefined`, symbol keys, etc.) are dropped.
 * - Date objects become ISO8601 strings.
 * - Class instances lose their prototype information (become plain objects).
 * - Circular references cause a `TypeError`.
 *
 * @template T The type of the input value.
 * @param {T} value The value to clone. It may be a primitive, object, array, or Vue ref.
 * @returns {T} A new, deeply cloned structure (minus any reactivity).
 */
export function clone<T>(value: T): T {
	return JSON.parse(JSON.stringify(unref(value)))
}

/**
 * Deep-clones a value like `clone()`, but without going through JSON — so `Map`/`Set`
 * instances round-trip correctly instead of turning into `{}`, and functions (e.g. Vue
 * component `setup`/`render`, module lifecycle hooks) are kept by reference instead of
 * being silently dropped.
 *
 * Use this instead of `clone()` for structures that mix plain data with those
 * non-serializable values, such as the Fate module `context`.
 *
 * @template T The type of the input value.
 * @param {T} value The value to clone. It may be a primitive, object, array, or Vue ref.
 * @returns {T} A new, deeply cloned structure (minus any reactivity).
 */
export function safeClone<T>(value: T): T {
	return cloneDeep(unref(value))
}
