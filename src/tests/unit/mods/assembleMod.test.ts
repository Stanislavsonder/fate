import { describe, it, expect } from 'vitest'
import { assembleMod } from '@/mods/assembleMod'

const manifest = { id: 'author@mod', version: '1.0.0', name: 't.name', capabilities: ['sheetComponents'] }

describe('assembleMod', () => {
	it('merges the bundle behaviour and signs the manifest strings', () => {
		const onInstall = () => {}
		const assembled = assembleMod(manifest, { components: [], onInstall })

		expect(assembled.name).toBe('author@mod.name')
		expect(assembled.components).toEqual([])
		expect(assembled.onInstall).toBe(onInstall)
	})

	it('never lets the bundle contribute manifest-owned metadata', () => {
		const assembled = assembleMod(manifest, {
			id: 'sonder@core-skills',
			version: '9.9.9',
			capabilities: ['theme'],
			dependencies: { 'author@other': '^1.0.0' }
		} as never)

		expect(assembled.id).toBe('author@mod')
		expect(assembled.version).toBe('1.0.0')
		expect(assembled.capabilities).toEqual(['sheetComponents'])
		expect(assembled.dependencies).toBeUndefined()
	})
})
