#!/usr/bin/env node

/**
 * Fails CI if packages/mod-types/registry.schema.json has drifted from the
 * canonical copy in the fate-mods repo (main branch). That repo's own
 * CI (validate-pr.yml/publish.yml) and this app's install-time validation
 * (src/mods/registryClient.ts) both need the exact same schema — see
 * planning/modules-2-0/phase-3-registry-store.md, Decision 2.
 *
 * Usage: node ./scripts/check-registry-schema/index.ts
 */

import fs from 'fs'
import path from 'path'

const CANONICAL_URL = 'https://raw.githubusercontent.com/Stanislavsonder/fate-mods/main/registry.schema.json'
const VENDORED_PATH = path.join(process.cwd(), 'packages', 'mod-types', 'registry.schema.json')

async function main(): Promise<void> {
	const vendored = fs.readFileSync(VENDORED_PATH, { encoding: 'utf-8' })

	const res = await fetch(CANONICAL_URL)
	if (!res.ok) {
		console.error(
			`Could not fetch canonical schema from ${CANONICAL_URL} (${res.status}). If fate-mods hasn't been pushed yet, this check can't run — skip it until Phase 3's registry repo is live.`
		)
		process.exitCode = 1
		return
	}
	const canonical = await res.text()

	if (canonical.trim() !== vendored.trim()) {
		console.error(
			[
				'packages/mod-types/registry.schema.json has drifted from the canonical copy in',
				'https://github.com/Stanislavsonder/fate-mods (registry.schema.json on main).',
				'Update the vendored copy to match, or update the canonical copy first if this change is intentional.'
			].join(' ')
		)
		process.exitCode = 1
		return
	}

	console.log('registry.schema.json matches the canonical copy in fate-mods.')
}

// Setting process.exitCode (not process.exit()) lets Node's event loop drain
// naturally instead of force-killing it mid-fetch — process.exit() right
// after an in-flight fetch() has been observed to crash Node on Windows
// (libuv assertion in src/win/async.c) before this ever reaches CI (Linux).
await main()
