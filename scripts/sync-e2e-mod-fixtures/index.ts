import { execSync } from 'node:child_process'
import { cpSync, mkdirSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Rebuilds the committed Cypress fixture copies of the example mod packages.
 *
 * The e2e suite installs mods from fixture files (served via cy.intercept or
 * seeded straight into IndexedDB) rather than spawning @fate-app/mod-build
 * during the run — so the fixtures are snapshots of real build output and can
 * drift when mod-build's shim/CSS-injection behavior or SDK_VERSION changes.
 * Re-run `pnpm fixtures:mods` (and commit the diff) whenever that happens.
 */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const FIXTURES = join(ROOT, 'src', 'tests', 'e2e', 'fixtures', 'mods')

const PACKAGES = ['example-mod', 'example-dice-mod'] as const

for (const name of PACKAGES) {
	console.log(`Building ${name}...`)
	execSync(`pnpm --filter ${name} build`, { cwd: ROOT, stdio: 'inherit' })

	const packageDir = join(ROOT, 'packages', name)
	const targetDir = join(FIXTURES, name, '1.0.0')

	rmSync(targetDir, { recursive: true, force: true })
	mkdirSync(join(targetDir, 'translations'), { recursive: true })
	cpSync(join(packageDir, 'dist', 'bundle.mjs'), join(targetDir, 'bundle.mjs'))
	cpSync(join(packageDir, 'manifest.json'), join(targetDir, 'manifest.json'))
	cpSync(join(packageDir, 'translations', 'en.json'), join(targetDir, 'translations', 'en.json'))
	console.log(`Synced ${name} -> ${targetDir}`)
}
