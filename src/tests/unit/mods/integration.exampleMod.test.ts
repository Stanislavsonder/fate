/// <reference types="node" />
import { describe, it, expect, vi, beforeAll } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import type { Character, FateContext } from '@/types'

/**
 * Integration test for the Phase 2 loader against a REAL built mod, not a
 * hand-written fixture: packages/example-mod's actual manifest.json +
 * dist/bundle.mjs (built via the @fate-app/mod-build preset) + translations.
 *
 * The one thing this CANNOT verify in this environment: transport via a real
 * blob: URL — Node's module loader doesn't support importing blob: URLs
 * (confirmed directly; `data:` URLs work and are used here as a substitute),
 * only real browsers/WebViews do. That mechanism is what Phase 0's spike
 * (planning/modules-2-0/phase-0-spike-results.md) exists to prove, on web,
 * iOS, and Android. Everything else in the pipeline — real bundle code
 * executing against a real installed FateSDK, the shims actually resolving,
 * shape validation, translation merging, assembleMod, onInstall/
 * onReconfigure touching real character/context objects — is exercised here
 * for real.
 */

const EXAMPLE_MOD_DIR = path.resolve(process.cwd(), 'packages/example-mod')

const { registerModTranslations } = vi.hoisted(() => ({ registerModTranslations: vi.fn() }))
vi.mock('@/mods/registerModTranslations', () => ({ registerModTranslations }))

// loader.ts imports registerBuiltinMods at module top level, which transitively
// pulls in every built-in module's real .vue SFCs — irrelevant to this test
// (which only exercises loadExternalMod) and vitest.config.ts has no Vue
// plugin registered (every other test avoids this by never importing the
// real loader.ts unmocked with real builtins in the chain).
vi.mock('@/mods/builtins', () => ({ registerBuiltinMods: vi.fn() }))

vi.mock('@/mods/importBlobModule', () => ({
	async importBlobModule(code: string) {
		const url = 'data:text/javascript;charset=utf-8,' + encodeURIComponent(code)
		const mod: { default: unknown } = await import(/* @vite-ignore */ url)
		return mod.default
	}
}))

import { installFateSDK } from '@/mods/sdk'
import { loadExternalMod } from '@/mods/loader'
import type { StoredMod } from '@/db/tables/mods'

async function sha256(text: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
	return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

describe('example-mod integration (real built bundle, real FateSDK)', () => {
	beforeAll(() => {
		const bundlePath = path.join(EXAMPLE_MOD_DIR, 'dist/bundle.mjs')
		if (!existsSync(bundlePath)) {
			throw new Error(`${bundlePath} not found — run "pnpm --filter example-mod build" before running this test`)
		}
		installFateSDK()
	})

	it('loads the real example-mod bundle through the real loader pipeline', async () => {
		const manifestJson = readFileSync(path.join(EXAMPLE_MOD_DIR, 'manifest.json'), 'utf-8')
		const bundleCode = readFileSync(path.join(EXAMPLE_MOD_DIR, 'dist/bundle.mjs'), 'utf-8')
		const translations = JSON.parse(readFileSync(path.join(EXAMPLE_MOD_DIR, 'translations/en.json'), 'utf-8'))

		const row: StoredMod = {
			id: 'sonder@example',
			version: '1.0.0',
			source: 'url',
			enabled: true,
			manifestJson,
			bundleCode,
			translationsJson: JSON.stringify({ en: translations }),
			sha256: await sha256(bundleCode),
			sourceUrl: 'https://example.com/mods/sonder@example',
			installedAt: 0,
			updatedAt: 0
		}

		const manifest = await loadExternalMod(row)

		expect(manifest.id).toBe('sonder@example')
		expect(manifest.components).toHaveLength(1)
		expect(manifest.components?.[0].id).toBe('sonder@example-section')
		expect(manifest.components?.[0].order).toBe(900)
		expect(typeof manifest.onInstall).toBe('function')
		expect(registerModTranslations).toHaveBeenCalledWith('sonder@example', { en: expect.objectContaining({ title: 'Example Section' }) })

		const character = { id: 1, name: 'Test', avatar: '', _modules: { 'sonder@example': { version: '1.0.0' } } } as Character
		const context = { constants: {}, templates: {}, shared: {}, components: [], modules: [] } as unknown as FateContext

		await manifest.onInstall(context, character)

		expect((character as unknown as Record<string, unknown>)['sonder@example.note']).toBe('')
		expect((context.constants as Record<string, unknown>)['sonder@example.maxNoteLength']).toBe(200)

		await manifest.onUninstall(context, character)
		expect(Object.hasOwn(character, 'sonder@example.note')).toBe(false)
	})
})
