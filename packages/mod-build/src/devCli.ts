/**
 * Minimal CLI entry for `pnpm dev` in a mod project. Not a published binary
 * in this phase (Decision #6 in the Phase 2 plan — mod-build only needs to
 * work from inside this monorepo). A real mod project runs this directly:
 * `node --experimental-transform-types <path-to>/devCli.ts`.
 */
import { startDevServer } from './dev.ts'

const root = process.cwd()
const port = Number(process.env.PORT) || 5199

startDevServer({ root, port }).catch((e: unknown) => {
	console.error(e)
	process.exit(1)
})
