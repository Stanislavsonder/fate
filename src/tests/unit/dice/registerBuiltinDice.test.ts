import { describe, it, expect, afterEach } from 'vitest'
import { ModRegistry } from '@/mods/modRegistry'
import { registerBuiltinDice, syncExternalDice } from '@/dice/registerBuiltinDice'
import { DICE_SHAPES, DICE_MATERIALS } from '@/dice/constants'
import { DiceMaterial } from '@fate-app/mod-types'

class FakeShapeA {
	static name = 'FakeShapeA'
	static icon = 'a.svg'
}

class FakeShapeB {
	static name = 'FakeShapeB'
	static icon = 'b.svg'
}

const fakeMaterial = new DiceMaterial('fake', {} as never, {} as never, '#000000')

describe('registerBuiltinDice / syncExternalDice', () => {
	afterEach(() => {
		ModRegistry.remove('author@dice-mod')
		ModRegistry.remove('author@other-mod')
		for (const key of [...DICE_SHAPES.keys()]) {
			if (key.includes(':')) DICE_SHAPES.delete(key)
		}
		for (const key of [...DICE_MATERIALS.keys()]) {
			if (key.includes(':')) DICE_MATERIALS.delete(key)
		}
	})

	it('registers built-in dice under unnamespaced keys', () => {
		registerBuiltinDice()
		expect(DICE_SHAPES.get('Fudge')).toBeDefined()
		expect(DICE_SHAPES.get('D20')).toBeDefined()
	})

	it('syncs a loaded external dice-capability mod under namespaced keys', () => {
		ModRegistry.register({
			manifest: { id: 'author@dice-mod', capabilities: ['dice'], dice: { shapes: [FakeShapeA], materials: [fakeMaterial] } } as never,
			source: 'url',
			status: 'loaded'
		})

		syncExternalDice()

		expect(DICE_SHAPES.get('author@dice-mod:FakeShapeA')).toBe(FakeShapeA)
		expect(DICE_SHAPES.get('FakeShapeA')).toBeUndefined() // never registered unnamespaced
		expect(DICE_MATERIALS.get('author@dice-mod:fake')).toBe(fakeMaterial)
	})

	it('ignores non-loaded or non-dice-capability mods', () => {
		ModRegistry.register({ manifest: { id: 'author@other-mod', capabilities: ['theme'] } as never, source: 'url', status: 'loaded' })
		ModRegistry.register({
			manifest: { id: 'author@dice-mod', capabilities: ['dice'], dice: { shapes: [FakeShapeA] } } as never,
			source: 'url',
			status: 'disabled'
		})

		syncExternalDice()

		expect(DICE_SHAPES.get('author@dice-mod:FakeShapeA')).toBeUndefined()
	})

	it('rebuilds authoritatively — a removed mod stops appearing on the next sync', () => {
		ModRegistry.register({
			manifest: { id: 'author@dice-mod', capabilities: ['dice'], dice: { shapes: [FakeShapeA] } } as never,
			source: 'url',
			status: 'loaded'
		})
		syncExternalDice()
		expect(DICE_SHAPES.get('author@dice-mod:FakeShapeA')).toBeDefined()

		ModRegistry.remove('author@dice-mod')
		syncExternalDice()

		expect(DICE_SHAPES.get('author@dice-mod:FakeShapeA')).toBeUndefined()
	})

	it('never namespaces builtin entries, even across repeated syncs', () => {
		registerBuiltinDice()
		ModRegistry.register({
			manifest: { id: 'author@dice-mod', capabilities: ['dice'], dice: { shapes: [FakeShapeB] } } as never,
			source: 'url',
			status: 'loaded'
		})

		syncExternalDice()
		syncExternalDice()

		expect(DICE_SHAPES.get('Fudge')).toBeDefined()
		expect(DICE_SHAPES.get('author@dice-mod:FakeShapeB')).toBe(FakeShapeB)
	})
})
