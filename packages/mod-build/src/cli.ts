#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { startDevServer } from './dev.ts'

/**
 * Published as the `fate-mod-build` binary (package.json `bin`). A real mod
 * project (outside this monorepo, e.g. one scaffolded by `create-fate-mod`)
 * runs this via its own `package.json` scripts: `"dev": "fate-mod-build dev"`,
 * `"build": "fate-mod-build build"`. Inside this monorepo, `example-mod`
 * still invokes `dev.ts`'s `startDevServer` directly via `devCli.ts` — kept
 * as-is rather than migrated, since it predates this bin and works fine.
 */
async function main(): Promise<void> {
	const [, , command] = process.argv
	const root = process.cwd()

	if (command === 'dev') {
		const port = Number(process.env.PORT) || 5199
		await startDevServer({ root, port })
		return
	}

	if (command === 'build') {
		await runBuild(root)
		return
	}

	console.error(`Unknown command "${command ?? ''}". Usage: fate-mod-build <dev|build>`)
	process.exit(1)
}

/**
 * Shells `vite build` (no --watch) once. See dev.ts's startDevServer for why
 * this spawns the CLI (shell:true, a fixed non-interpolated command string)
 * rather than Vite's programmatic build() API or an argv array.
 */
function runBuild(root: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawn('npx vite build', { cwd: root, stdio: 'inherit', shell: true })
		child.on('exit', code => (code === 0 ? resolve() : reject(new Error(`vite build exited with code ${code}`))))
		child.on('error', reject)
	})
}

main().catch((e: unknown) => {
	console.error(e)
	process.exit(1)
})
