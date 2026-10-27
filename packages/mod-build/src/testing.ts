import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { validateBundleShape, DiceMaterial, type FateModCapability, type FateContext, type Character, type DiceConstructor } from '@fate-app/mod-types'
// Type-only — fully erased at compile time, so this does NOT trigger vue's
// runtime evaluation (see the ordering note below). Only real `import`
// statements (not `import type`) would.
import type * as VueModule from 'vue'
import type * as VueI18nModule from 'vue-i18n'
import type * as ThreeModule from 'three'
import type * as CannonEsModule from 'cannon-es'

/**
 * `fate-mods`'s CI smoke-load check (see the registry repo's
 * `validate-pr.yml`) imports a freshly built `bundle.mjs` in plain Node and
 * runs it through the exact same `validateBundleShape` gate the app's real
 * loader uses (`src/mods/loader.ts` in the app repo), then mounts every
 * declared sheet component to catch render-time crashes before a human
 * reviewer ever runs the mod. This file is intentionally NOT imported by
 * `./index.ts` (the build-preset entry) — it pulls in `vue`/`vue-i18n`/
 * `jsdom`/`@vue/test-utils`, none of which a mod author's `vite.config.ts`
 * needs, so it's a separate `@fate-app/mod-build/testing` subpath export.
 *
 * `vue`/`vue-i18n` are deliberately imported *dynamically*, never at module
 * top level: `@vue/runtime-dom` captures a reference to `document` the
 * moment it's first evaluated (`const doc = typeof document !== 'undefined'
 * ? document : null`, module-scope, computed once). A static top-level
 * `import 'vue'` in this file would run before `ensureDom()` ever gets a
 * chance to install jsdom's `document` onto `globalThis`, permanently baking
 * in `doc = null` for this module instance — reassigning `globalThis.document`
 * afterwards doesn't retroactively fix an already-captured reference. Every
 * function here that touches Vue imports it lazily, after `ensureDom()`.
 */

/** Loose, duck-typed stand-in for the app's real `FateSDK` shape (`src/mods/sdk.ts`)
 * — deliberately not imported from the app, which isn't reachable from here. */
export interface StubFateSDK {
	version: string
	vue: typeof VueModule
	vueI18n: typeof VueI18nModule
	ionicVue: Record<string, unknown>
	ionicons: Record<string, unknown>
	dice: { three: typeof ThreeModule; cannonEs: typeof CannonEsModule }
	components: { SheetSection: unknown }
	api: {
		toast: { error(key: string, opts?: Record<string, unknown>): Promise<void>; success(key: string, opts?: Record<string, unknown>): Promise<void> }
		getModData<T>(character: unknown, modId: string, key: string): T | undefined
		setModData<T>(character: unknown, modId: string, key: string, value: T): void
		deleteModData(character: unknown, modId: string, key?: string): void
	}
}

/**
 * Every property access on the returned object resolves to *something* valid
 * (a trivial passthrough component, or the property name itself for icons)
 * instead of `undefined` — real `@ionic/vue`/`ionicons` Web Components aren't
 * registered in a plain Node process, and failing a smoke test purely because
 * of that would be a false positive. Genuine bugs in a mod's own render logic
 * still throw normally.
 */
function stubModule(vue: typeof VueModule, kind: 'component' | 'icon'): Record<string, unknown> {
	return new Proxy(
		{},
		{
			get(_target, prop) {
				if (typeof prop !== 'string') return undefined
				if (kind === 'icon') return prop
				return vue.defineComponent({
					name: `Stub_${prop}`,
					setup(_props, { slots }) {
						return () => vue.h('div', slots.default?.())
					}
				})
			}
		}
	)
}

export async function stubFateSDK(): Promise<StubFateSDK> {
	const vue = await import('vue')
	const vueI18n = await import('vue-i18n')
	const three = await import('three')
	const cannonEs = await import('cannon-es')
	return {
		version: '0.0.0-smoke-test',
		vue,
		vueI18n,
		ionicVue: stubModule(vue, 'component'),
		ionicons: stubModule(vue, 'icon'),
		dice: { three, cannonEs },
		// Shared host components (FateSDK.components, SDK >= 2.1.0). A mod's
		// sections render inside them, so the stub must render the default and
		// header slots — a passthrough that dropped them would skip the very
		// markup the smoke-load is meant to exercise.
		components: {
			SheetSection: vue.defineComponent({
				name: 'Stub_SheetSection',
				props: { title: { type: String, default: '' } },
				setup(_props, { slots }) {
					return () => vue.h('section', [slots.header?.(), slots.default?.()])
				}
			})
		},
		api: {
			toast: { error: async () => {}, success: async () => {} },
			getModData: () => undefined,
			setModData: () => {},
			deleteModData: () => {}
		}
	}
}

function stubContext(): FateContext {
	return { modules: {}, constants: {}, templates: { character: {} as never }, shared: {}, components: [] }
}

/** Sheet components receive the character as `defineModel<Character>({ required: true })`
 * — a real mod legitimately expects a non-empty `modelValue` prop, so mounting
 * without one is a smoke-load false positive/negative, not a real bug to catch. */
function stubCharacter(): Character {
	return { id: 0, name: 'Smoke Test', avatar: '', _modules: {} }
}

/**
 * Constructor-level check for a dice-capability bundle: instantiates each
 * declared shape with a real (headless) three/cannon-es material and physics
 * world, catching crashes in createMesh()/createBody(). Deliberately shallow
 * — it never renders (no WebGLRenderer, no canvas) or steps physics; real
 * visual/gameplay behavior is reviewed by a human, same as sheet components
 * are only mounted here, not interacted with.
 */
async function smokeLoadDice(dice: { shapes?: unknown[]; materials?: unknown[] }): Promise<void> {
	const three = await import('three')
	const cannonEs = await import('cannon-es')

	for (const material of (dice.materials ?? []) as Array<Record<string, unknown>>) {
		if (typeof material.name !== 'string' || typeof material.previewColor !== 'string' || !material.faceMaterial || !material.symbolMaterial) {
			throw new Error(`Invalid dice material shape: ${JSON.stringify(Object.keys(material))}`)
		}
	}

	const stubMaterial = new DiceMaterial('smoke-test', new three.MeshStandardMaterial(), new three.MeshStandardMaterial(), '#ffffff')
	const world = new cannonEs.World()

	for (const Shape of (dice.shapes ?? []) as DiceConstructor[]) {
		const instance = new Shape(stubMaterial, 1, 1, 1, world, () => {})
		instance.getResult()
		instance.formatResult(0)
	}
}

// Vue's runtime-dom + Ionic-style components reach for a range of DOM
// constructors, not just document/navigator. Deliberately a curated list,
// not "copy every jsdom window property" — jsdom's window has circular
// self-references (window.self/top/parent all alias back to window itself),
// and eagerly reading those as plain values produces a genuinely circular
// object graph that overflows the stack the moment anything tries to
// traverse it (Vue's reactivity, console.log, etc.).
const DOM_GLOBALS = [
	'document',
	'navigator',
	'Element',
	'HTMLElement',
	'SVGElement',
	'Node',
	'Text',
	'Comment',
	'DocumentFragment',
	'Event',
	'CustomEvent',
	'MouseEvent',
	'KeyboardEvent',
	'MutationObserver',
	'customElements',
	'getComputedStyle',
	'requestAnimationFrame',
	'cancelAnimationFrame'
] as const

/**
 * `@vue/test-utils`'s `mount()` needs `document`/`window` — present under a
 * test runner's own environment (Vitest/Jest), but not in a bare `node
 * scripts/ci/smoke-load.ts` process. Bootstraps a minimal jsdom window onto
 * `globalThis` the first time it's needed so `smokeLoad()` works standalone;
 * a no-op if a DOM global already exists (e.g. this ever runs inside Vitest).
 * Must run — and complete — before `vue` is imported anywhere (see the
 * module-level comment above).
 */
async function ensureDom(): Promise<void> {
	if (typeof document !== 'undefined') return
	const { JSDOM } = await import('jsdom')
	const dom = new JSDOM('<!doctype html><html><body></body></html>')
	const globalTarget = globalThis as Record<string, unknown>
	const domWindow = dom.window as unknown as Record<string, unknown>

	globalTarget.window = dom.window
	for (const key of DOM_GLOBALS) {
		// Node defines a few of these itself (e.g. `navigator`, read-only since
		// Node 21) — defineProperty with configurable:true overrides those too.
		Object.defineProperty(globalTarget, key, { value: domWindow[key], configurable: true, writable: true })
	}
}

export type SmokeLoadResult = { ok: true } | { ok: false; error: string }

/**
 * Imports a built `bundle.mjs`, validates its shape, and mounts every
 * declared sheet component. Returns a result instead of throwing so the CI
 * script can print a clean pass/fail per mod rather than a raw stack trace.
 */
export async function smokeLoad(bundlePath: string, manifest: { capabilities?: FateModCapability[] }): Promise<SmokeLoadResult> {
	await ensureDom()

	const globalTarget = globalThis as Record<string, unknown>
	const previousSDK = globalTarget.FateSDK
	const sdk = await stubFateSDK()
	globalTarget.FateSDK = sdk

	try {
		const imported = (await import(pathToFileURL(resolve(bundlePath)).href)) as { default: unknown }
		const bundle = imported.default as Record<string, unknown>
		validateBundleShape(bundle, manifest.capabilities)

		if (manifest.capabilities?.includes('sheetComponents') && Array.isArray(bundle.components)) {
			const { mount } = await import('@vue/test-utils')
			// A real (empty) i18n instance from the same vue-i18n copy the mod
			// imports through FateSDK.vueI18n, so both $t() in templates and
			// useI18n() in setup work — a missing key simply renders the key.
			const i18n = sdk.vueI18n.createI18n({ legacy: false, locale: 'en', missingWarn: false, fallbackWarn: false, messages: { en: {} } })
			for (const entry of bundle.components as Array<{ id: string; component: unknown }>) {
				// The component's real prop shape isn't known statically (it comes
				// from a dynamically imported, untyped bundle) — `as never` opts out
				// of mount()'s prop-shape checking for both arguments deliberately,
				// not just the component itself.
				mount(
					entry.component as never,
					{
						props: { modelValue: stubCharacter() },
						global: {
							provide: { context: stubContext() },
							plugins: [i18n]
						}
					} as never
				)
			}
		}

		if (manifest.capabilities?.includes('dice') && bundle.dice) {
			await smokeLoadDice(bundle.dice as { shapes?: unknown[]; materials?: unknown[] })
		}

		return { ok: true }
	} catch (e) {
		return { ok: false, error: e instanceof Error ? e.message : String(e) }
	} finally {
		globalTarget.FateSDK = previousSDK
	}
}
