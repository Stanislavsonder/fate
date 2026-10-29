import { describe, it, expect } from 'vitest'
import { installFateSDK, loadFullIconset, loadDiceLibs, SDK_VERSION } from '@/mods/sdk'

describe('FateSDK', () => {
	it('installs frozen, with an empty icon set/dice libs until their loaders run', () => {
		installFateSDK()

		expect(globalThis.FateSDK.version).toBe(SDK_VERSION)
		expect(globalThis.FateSDK.ionicons).toEqual({})
		expect(globalThis.FateSDK.dice).toEqual({})
		expect(Object.isFrozen(globalThis.FateSDK)).toBe(true)
		expect(() => {
			globalThis.FateSDK.version = 'tampered'
		}).toThrow(TypeError) // ESM modules run in strict mode, so writing to a frozen object throws
		expect(globalThis.FateSDK.version).toBe(SDK_VERSION)
	})

	it('cannot be reassigned or redefined by a mod', async () => {
		installFateSDK()
		const original = globalThis.FateSDK

		expect(() => {
			globalThis.FateSDK = { ...original, version: 'proxy' }
		}).toThrow(TypeError)
		expect(() => Object.defineProperty(globalThis, 'FateSDK', { value: {} })).toThrow(TypeError)
		expect(globalThis.FateSDK).toBe(original)

		// The host's own lazy upgrades still land.
		await loadFullIconset()
		expect(globalThis.FateSDK).not.toBe(original)
		expect(Object.keys(globalThis.FateSDK.ionicons).length).toBeGreaterThan(100)
	})

	it('loadFullIconset upgrades FateSDK.ionicons with the full icon set, staying frozen', async () => {
		installFateSDK()

		await loadFullIconset()

		expect(Object.keys(globalThis.FateSDK.ionicons).length).toBeGreaterThan(100)
		expect(Object.isFrozen(globalThis.FateSDK)).toBe(true)
	})

	it('loadDiceLibs upgrades FateSDK.dice with three/cannon-es, staying frozen', async () => {
		installFateSDK()

		await loadDiceLibs()

		expect(globalThis.FateSDK.dice).toHaveProperty('three')
		expect(globalThis.FateSDK.dice).toHaveProperty('cannonEs')
		expect(Object.isFrozen(globalThis.FateSDK)).toBe(true)
		expect(Object.isFrozen(globalThis.FateSDK.dice)).toBe(true)
	})
})
