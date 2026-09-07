import type { Component } from 'vue'

/**
 * This file is bundled directly into every mod (like getModData/setModData),
 * NOT externalized via @fate-app/mod-build's EXTERNALS map - unlike vue/ionic,
 * there's no separate real npm package to substitute. Instead, each export
 * below is a lazy live-binding into `globalThis.FateSDK.components`, resolved
 * the moment something actually touches the component (Vue reading its
 * `render`/`setup`/etc. at render time), never captured eagerly at import
 * time. That laziness is required, not just cautious: this same compiled file
 * is also imported by the HOST app itself (src/mods/sdk.ts imports
 * getModData/setModData from this package), and that import happens BEFORE
 * installFateSDK() ever runs - an eager `export const SheetSection =
 * globalThis.FateSDK.components.SheetSection` would permanently capture
 * `undefined` in that context.
 *
 * The real `FateSDK` interface lives in the host app (src/mods/sdk.ts, not
 * importable from here - this package is published standalone). This local
 * shape only needs to describe what this file itself reads off the global.
 */
interface FateSDKComponents {
	SheetSection: Component
}

function fateSdkComponent<K extends keyof FateSDKComponents>(name: K): FateSDKComponents[K] {
	const sdk = (globalThis as { FateSDK?: { components?: Partial<FateSDKComponents> } }).FateSDK
	const component = sdk?.components?.[name]
	if (!component) {
		throw new Error(
			`@fate-app/mod-types: FateSDK.components.${name} is unavailable - this mod needs host SDK ^2.1.0 or newer, ` +
				`and "sheetComponents" in its own manifest.json "capabilities" (that's what triggers the host to load it).`
		)
	}
	return component
}

function lazyHostComponent(name: keyof FateSDKComponents): Component {
	return new Proxy({} as Component, {
		get(_target, prop, receiver) {
			return Reflect.get(fateSdkComponent(name) as object, prop, receiver)
		}
	})
}

/**
 * The host's own sheet-section card: a title bar (uppercase, `header` slot for
 * trailing controls like an add button) over a body (default slot). Use this
 * instead of hand-rolling matching CSS so your mod's sections look identical
 * to the built-ins' and stay that way across future host redesigns.
 *
 * ```vue
 * <script setup lang="ts">
 * import { SheetSection } from '@fate-app/mod-types'
 * </script>
 * <template>
 *   <SheetSection :title="$t('my-mod.label')">
 *     <template #header>
 *       <button @click="add">+</button>
 *     </template>
 *     ...
 *   </SheetSection>
 * </template>
 * ```
 *
 * Requires `"sdk": "^2.1.0"` or newer in manifest.json.
 */
// prettier-ignore
export const SheetSection = /* @__PURE__ */ lazyHostComponent('SheetSection')
