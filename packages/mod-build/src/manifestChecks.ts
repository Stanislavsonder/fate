import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'

const SOFT_LIMIT_BYTES = 1 * 1024 * 1024
const HARD_LIMIT_BYTES = 3 * 1024 * 1024
const RECOMMENDED_FIELDS = ['id', 'version', 'name', 'author', 'description', 'loadPriority'] as const

/** Validates manifest.json presence/shape and warns/errors on bundle size (README.md §4 limits). */
export function manifestChecks(): Plugin {
	return {
		name: 'fate-mod-manifest-checks',
		buildStart() {
			const manifestPath = resolve(process.cwd(), 'manifest.json')
			if (!existsSync(manifestPath)) {
				this.error('manifest.json not found in the mod project root — every mod must ship one alongside its bundle.')
			}

			let manifest: Record<string, unknown>
			try {
				manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
			} catch (e) {
				this.error(`manifest.json is not valid JSON: ${e instanceof Error ? e.message : String(e)}`)
				return
			}

			for (const field of RECOMMENDED_FIELDS) {
				if (!(field in manifest)) {
					this.warn(`manifest.json is missing recommended field "${field}"`)
				}
			}
		},
		writeBundle(_options, bundle) {
			for (const [fileName, output] of Object.entries(bundle)) {
				if (!fileName.endsWith('.mjs') && !fileName.endsWith('.js')) {
					continue
				}
				const size = 'code' in output ? Buffer.byteLength(output.code, 'utf-8') : 0
				if (size > HARD_LIMIT_BYTES) {
					this.error(`${fileName} is ${(size / 1024 / 1024).toFixed(2)}MB, over the 3MB hard limit for a mod bundle.`)
				} else if (size > SOFT_LIMIT_BYTES) {
					this.warn(`${fileName} is ${(size / 1024).toFixed(0)}KB, over the 1MB soft limit for a mod bundle — consider trimming assets.`)
				}
			}
		}
	}
}
