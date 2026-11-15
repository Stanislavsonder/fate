import { describe, expect, it } from 'vitest'

// Regression guard: the Modules 2.0 migration dropped `templates`/`constants` from the
// inventory bundle, so `context.templates.item` was undefined and the "add item" form crashed.
// Sources are read as text because the unit-test config does not compile .vue components.
const bundles = import.meta.glob<string>('@/modules/*/bundle.ts', { eager: true, query: '?raw', import: 'default' })
const templateFiles = import.meta.glob('@/modules/*/src/templates.ts')
const constantFiles = import.meta.glob('@/modules/*/src/constants.ts')

const moduleDir = (path: string) => path.split('/modules/')[1].split('/')[0]
const bundleSourceFor = (dir: string) => Object.entries(bundles).find(([path]) => moduleDir(path) === dir)?.[1] ?? ''
const passesToDefineFateMod = (source: string, key: string) => new RegExp(`defineFateMod\\(\\{[^}]*\\b${key}\\b`, 's').test(source)

describe('built-in module bundles', () => {
	it.each(Object.keys(templateFiles).map(moduleDir))('%s passes its templates to defineFateMod', dir => {
		expect(passesToDefineFateMod(bundleSourceFor(dir), 'templates')).toBe(true)
	})

	it.each(Object.keys(constantFiles).map(moduleDir))('%s passes its constants to defineFateMod', dir => {
		expect(passesToDefineFateMod(bundleSourceFor(dir), 'constants')).toBe(true)
	})
})
