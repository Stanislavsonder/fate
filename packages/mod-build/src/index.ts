import vue from '@vitejs/plugin-vue'
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js'
import { defineConfig, type UserConfig } from 'vite'
import { fateSdkShims } from './fateSdkShims.ts'
import { manifestChecks } from './manifestChecks.ts'

/**
 * Host-shared libraries a mod must not bundle its own copy of (decision D2).
 * Keys are the import specifiers a mod author writes; values are the
 * `globalThis.FateSDK` path the host installs before loading any mod.
 */
export const EXTERNALS: Record<string, string> = {
	vue: 'FateSDK.vue',
	'vue-i18n': 'FateSDK.vueI18n',
	'@ionic/vue': 'FateSDK.ionicVue',
	'ionicons/icons': 'FateSDK.ionicons',
	// Experimental (dice capability) — see docs/MOD_API.md. `Dice`/`DiceMaterial`
	// themselves are NOT externalized: import them normally from
	// @fate-app/mod-types, they bundle directly (see that package's dice.ts).
	three: 'FateSDK.dice.three',
	'cannon-es': 'FateSDK.dice.cannonEs'
}

/**
 * The Vite config a mod project's own vite.config.ts hands back:
 * `export default defineModConfig()`. Produces a single-file ESM bundle
 * (`bundle.mjs`) with CSS inlined and injected at load, and the host's
 * shared libraries externalized via fateSdkShims instead of bundled.
 */
export function defineModConfig(overrides: UserConfig = {}): UserConfig {
	return defineConfig({
		plugins: [vue(), fateSdkShims(EXTERNALS), cssInjectedByJsPlugin(), manifestChecks()],
		define: {
			'process.env.NODE_ENV': '"production"',
			__VUE_OPTIONS_API__: 'true',
			__VUE_PROD_DEVTOOLS__: 'false',
			__VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false'
		},
		build: {
			lib: {
				entry: 'bundle.ts',
				formats: ['es'],
				fileName: () => 'bundle.mjs'
			},
			// Deliberately NOT `rollupOptions.external`: that tells the bundler to
			// leave `import ... from 'vue'` as a literal, unresolvable bare
			// specifier in the output (blob-URL `import()` has no bare-specifier
			// resolution). fateSdkShims virtualizes these specifiers into local
			// modules instead, which get bundled normally — the opposite of external.
			rollupOptions: {
				output: { codeSplitting: false }
			},
			cssCodeSplit: false,
			assetsInlineLimit: 1024 * 1024,
			emptyOutDir: true
		},
		...overrides
	})
}
