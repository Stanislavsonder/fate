import type { FateModBundle, FateModCapability } from './bundle'

const LIFECYCLE_FNS = ['onInstall', 'onUninstall', 'onReconfigure'] as const

// A legitimate skin overrides a handful of CSS custom properties/selectors —
// sonder@theme-pink's real CSS is well under 1KB. This is generous headroom,
// not a real ceiling on styling ambition: it exists only to bound the worst
// case (a bloated or malicious stylesheet), since raw CSS can't execute
// script and the existing whole-bundle size limit (manifestChecks.ts)
// already covers the general case indirectly.
const THEME_CSS_MAX_BYTES = 100 * 1024

// Manifest-owned keys the loader gates on (ABI range, capabilities, identity)
// before the bundle is ever imported. assembleMod copies an allowlist off the
// bundle, so these are inert there — rejected rather than silently ignored so
// an author who puts them in the wrong file finds out at build/PR time, and so
// a bundle attempting to pick its own identity after the gates is quarantined.
// Any other extra key is left alone; a bundle may export whatever it likes.
const MANIFEST_ONLY_KEYS = ['id', 'version', 'sdk', 'capabilities', 'dependencies', 'incompatibleWith', 'appVersion', 'published', 'entry'] as const

/**
 * Cheap structural checks run on a freshly `import()`ed external bundle before
 * anything (assembleMod, translations, the character sheet) trusts its shape.
 * Throws a descriptive error on the first violation found — the app's loader
 * catches it and quarantines the mod rather than letting a malformed bundle
 * crash the app; the registry's CI smoke-load check runs the exact same
 * function so the two never drift.
 */
export function validateBundleShape(bundle: unknown, capabilities: FateModCapability[] | undefined): asserts bundle is FateModBundle {
	if (!bundle || typeof bundle !== 'object') {
		throw new Error('bundle default export must be an object')
	}

	const b = bundle as Record<string, unknown>

	const manifestOnly = MANIFEST_ONLY_KEYS.filter(key => key in b)
	if (manifestOnly.length > 0) {
		throw new Error(`bundle must not declare manifest-only ${manifestOnly.length > 1 ? 'keys' : 'key'} (${manifestOnly.join(', ')}) — move them to manifest.json`)
	}

	if (capabilities?.includes('sheetComponents') && b.components !== undefined) {
		if (!Array.isArray(b.components)) {
			throw new Error('bundle.components must be an array')
		}
		b.components.forEach((component, index) => {
			const c = component as Record<string, unknown> | null
			if (!c || typeof c !== 'object' || typeof c.id !== 'string' || typeof c.order !== 'number' || !c.component) {
				throw new Error(`bundle.components[${index}] must be { id: string, component, order: number }`)
			}
		})
	}

	for (const fn of LIFECYCLE_FNS) {
		if (b[fn] !== undefined && typeof b[fn] !== 'function') {
			throw new Error(`bundle.${fn} must be a function`)
		}
	}

	if (b.patches !== undefined) {
		if (!Array.isArray(b.patches)) {
			throw new Error('bundle.patches must be an array')
		}
		b.patches.forEach((patch, index) => {
			const p = patch as Record<string, unknown> | null
			if (!p || typeof p !== 'object' || typeof p.version !== 'string' || typeof p.action !== 'function') {
				throw new Error(`bundle.patches[${index}] must be { version: string, action: function }`)
			}
		})
	}

	if (capabilities?.includes('theme') && b.theme !== undefined) {
		const theme = b.theme as Record<string, unknown> | null
		if (!theme || typeof theme.css !== 'string') {
			throw new Error('bundle.theme.css must be a string')
		}
		if (theme.css.length > THEME_CSS_MAX_BYTES) {
			throw new Error(`bundle.theme.css is ${(theme.css.length / 1024).toFixed(0)}KB, over the ${THEME_CSS_MAX_BYTES / 1024}KB limit for a theme mod`)
		}
	}

	if (capabilities?.includes('dice') && b.dice !== undefined) {
		const dice = b.dice as Record<string, unknown> | null
		if (!dice || typeof dice !== 'object') {
			throw new Error('bundle.dice must be an object')
		}

		if (dice.shapes !== undefined) {
			if (!Array.isArray(dice.shapes)) {
				throw new Error('bundle.dice.shapes must be an array')
			}
			dice.shapes.forEach((shape, index) => {
				const s = shape as Record<string, unknown> | null
				if (typeof shape !== 'function' || typeof s?.name !== 'string' || typeof s?.icon !== 'string') {
					throw new Error(`bundle.dice.shapes[${index}] must be a class with static name/icon strings`)
				}
			})
		}

		if (dice.materials !== undefined) {
			if (!Array.isArray(dice.materials)) {
				throw new Error('bundle.dice.materials must be an array')
			}
			dice.materials.forEach((material, index) => {
				const m = material as Record<string, unknown> | null
				if (!m || typeof m !== 'object' || typeof m.name !== 'string' || typeof m.previewColor !== 'string' || !m.faceMaterial || !m.symbolMaterial) {
					throw new Error(`bundle.dice.materials[${index}] must be { name: string, faceMaterial, symbolMaterial, previewColor: string }`)
				}
			})
		}
	}
}
