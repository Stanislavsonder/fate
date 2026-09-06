/**
 * Maintenance script — NOT run at mod-build time. Regenerates
 * src/sdkExports.ts, which pins the named-export list fateSdkShims uses to
 * generate re-export shims for each host-shared library (decision D2).
 *
 * Why pinned data instead of computing this per mod-build at runtime: a
 * plain `await import('vue')` from Node resolves the package's "node"
 * export condition — a CJS-interop wrapper whose synthetic namespace
 * includes junk keys (`module.exports`, `__esModule`) that aren't real named
 * exports. The actual browser ESM entry (what Vite bundles into the app,
 * and therefore what FateSDK.vue really exposes) is reached via the
 * "import" export condition (or the "module"/"main" field for packages
 * without an "exports" map, e.g. @ionic/vue). This script statically parses
 * that file with es-module-lexer (no execution, so no interop pollution),
 * recursively following `export * from` re-export chains (e.g.
 * vue.runtime.esm-bundler.js -> @vue/runtime-dom -> @vue/runtime-core -> ...)
 * to build the real flat list.
 *
 * Run manually (`pnpm --filter @fate-app/mod-build generate-sdk-exports`)
 * whenever SDK_VERSION bumps for a dependency upgrade — see docs/MOD_API.md.
 */
import { init, parse } from 'es-module-lexer'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)

const PACKAGES = ['vue', 'vue-i18n', '@ionic/vue', 'ionicons/icons', 'three', 'cannon-es'] as const

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/

function splitSpecifier(specifier: string): { pkgName: string; subpath: string } {
	const isScoped = specifier.startsWith('@')
	const firstSlash = specifier.indexOf('/')
	const nameEnd = isScoped ? specifier.indexOf('/', firstSlash + 1) : firstSlash
	if (nameEnd === -1) {
		return { pkgName: specifier, subpath: '.' }
	}
	return { pkgName: specifier.slice(0, nameEnd), subpath: `.${specifier.slice(nameEnd)}` }
}

function pickImportCondition(node: unknown, specifier: string): string {
	if (typeof node === 'string') {
		return node
	}
	const obj = node as Record<string, unknown>
	if ('import' in obj) {
		return pickImportCondition(obj.import, specifier)
	}
	if ('default' in obj) {
		return pickImportCondition(obj.default, specifier)
	}
	throw new Error(`No "import"/"default" export condition found for ${specifier}`)
}

/**
 * Finds a package's root directory on disk without relying on its "exports"
 * map allowing a "./package.json" subpath (many packages, e.g. ionicons,
 * deliberately block that). Resolves *some* file inside the package via
 * plain CJS resolution (condition doesn't matter — we only want the
 * directory), then walks up to the nearest package.json.
 */
function findPackageRoot(pkgName: string, fromDir: string): string {
	const someFile = require.resolve(pkgName, { paths: [fromDir] })
	let dir = dirname(someFile)
	while (true) {
		const candidate = join(dir, 'package.json')
		if (existsSync(candidate)) {
			const json = JSON.parse(readFileSync(candidate, 'utf-8')) as { name?: string }
			if (json.name === pkgName) {
				return dir
			}
		}
		const parent = dirname(dir)
		if (parent === dir) {
			throw new Error(`Could not find package.json for "${pkgName}" starting from ${someFile}`)
		}
		dir = parent
	}
}

/** Resolves the real browser ESM entry file — the one Vite bundles into the app — for a package specifier. */
function resolveEntryFile(specifier: string, fromDir: string): string {
	const { pkgName, subpath } = splitSpecifier(specifier)
	const pkgRoot = findPackageRoot(pkgName, fromDir)
	const pkgJson = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf-8')) as {
		exports?: Record<string, unknown>
		module?: string
		main?: string
	}

	const exportsMap = pkgJson.exports?.[subpath]
	if (exportsMap) {
		return join(pkgRoot, pickImportCondition(exportsMap, specifier))
	}
	if (subpath !== '.') {
		return require.resolve(specifier, { paths: [fromDir] })
	}
	const relativeFile = pkgJson.module ?? pkgJson.main
	if (!relativeFile) {
		throw new Error(`${pkgName} has no "exports"/"module"/"main" to resolve an entry from`)
	}
	return join(pkgRoot, relativeFile)
}

/** Recursively collects real named exports, following `export * from '...'` re-export chains. */
function collectExports(filePath: string, visited: Set<string> = new Set()): Set<string> {
	if (visited.has(filePath)) {
		return new Set()
	}
	visited.add(filePath)

	const code = readFileSync(filePath, 'utf-8')
	const [imports, exportsList] = parse(code)

	const names = new Set(exportsList.map(e => e.n).filter(name => name !== 'default' && name !== '__esModule' && IDENTIFIER.test(name)))

	for (const imp of imports) {
		const statement = code.slice(imp.ss, imp.se).trimStart()
		const isWildcardReexport = statement.startsWith('export') && /export\s*\*/.test(statement)
		if (!isWildcardReexport || !imp.n) {
			continue
		}
		const targetFile = resolveEntryFile(imp.n, dirname(filePath))
		for (const name of collectExports(targetFile, visited)) {
			names.add(name)
		}
	}

	return names
}

async function main() {
	await init
	const result: Record<string, string[]> = {}

	for (const pkg of PACKAGES) {
		const file = resolveEntryFile(pkg, fileURLToPath(import.meta.url))
		const names = collectExports(file)
		result[pkg] = [...names].sort()
		console.log(`${pkg}: ${result[pkg].length} named exports (from ${file})`)
	}

	const outPath = new URL('../src/sdkExports.ts', import.meta.url)
	const banner =
		'// GENERATED by scripts/generateSdkExports.ts — do not hand-edit.\n// Regenerate with `pnpm --filter @fate-app/mod-build generate-sdk-exports`.\n\n'
	const body = `export const SDK_EXPORTS: Record<string, string[]> = ${JSON.stringify(result, null, '\t')}\n`
	writeFileSync(outPath, banner + body)
	console.log(`Wrote ${fileURLToPath(outPath)}`)
}

main()
