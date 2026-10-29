import type { Plugin } from 'vite'
import { SDK_EXPORTS } from './sdkExports.ts'

const VIRTUAL_PREFIX = '\0fate-sdk-shim:'

/**
 * Rewrites imports of host-shared libraries (vue, vue-i18n, @ionic/vue,
 * ionicons/icons — decision D2 in README.md) into virtual modules that
 * re-export named bindings from `globalThis.FateSDK.*` instead of bundling
 * the library. This is what keeps the mod using the HOST's Vue instance
 * (required for reactivity/provide-inject to work across the bundle
 * boundary) while still letting mod authors write plain
 * `import { ref } from 'vue'`.
 *
 * Export lists come from the pinned `sdkExports.ts` (see
 * scripts/generateSdkExports.ts), not a live `import()` at build time — the
 * latter resolves Node's CJS-interop build of each package (via the "node"
 * export condition) rather than the browser ESM build Vite/the app actually
 * use, producing a polluted/incomplete export list.
 */
export function fateSdkShims(externals: Record<string, string>): Plugin {
	return {
		name: 'fate-sdk-shims',
		enforce: 'pre',
		resolveId(id) {
			return id in externals ? VIRTUAL_PREFIX + id : null
		},
		load(id) {
			if (!id.startsWith(VIRTUAL_PREFIX)) {
				return null
			}

			const specifier = id.slice(VIRTUAL_PREFIX.length)
			const globalPath = externals[specifier]
			const names = SDK_EXPORTS[specifier]
			if (!names) {
				this.error(`No pinned export list for "${specifier}" — add it in sdkExports.ts (see generateSdkExports.ts).`)
			}

			const lines = [`const m = globalThis.${globalPath};`, ...names.map(name => `export const ${name} = m.${name};`)]
			return lines.join('\n')
		}
	}
}
