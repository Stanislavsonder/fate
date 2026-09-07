import { describe, it, expect } from 'vitest'
import { validateBundleShape } from '@fate-app/mod-types'

describe('validateBundleShape', () => {
	it('accepts a minimal valid bundle', () => {
		expect(() => validateBundleShape({}, undefined)).not.toThrow()
	})

	it('rejects a non-object default export', () => {
		expect(() => validateBundleShape('not an object', undefined)).toThrow(/must be an object/)
		expect(() => validateBundleShape(null, undefined)).toThrow(/must be an object/)
	})

	it('rejects manifest-only keys but allows any other extra key', () => {
		expect(() => validateBundleShape({ id: 'someone@else' }, undefined)).toThrow(/manifest-only key \(id\)/)
		expect(() => validateBundleShape({ id: 'x', capabilities: ['theme'] }, undefined)).toThrow(/manifest-only keys \(id, capabilities\)/)
		expect(() => validateBundleShape({ whateverTheAuthorWants: 42 }, undefined)).not.toThrow()
	})

	it('validates components when sheetComponents is declared', () => {
		expect(() => validateBundleShape({ components: 'nope' }, ['sheetComponents'])).toThrow(/components must be an array/)
		expect(() => validateBundleShape({ components: [{ id: 'x' }] }, ['sheetComponents'])).toThrow(/components\[0\]/)
		expect(() => validateBundleShape({ components: [{ id: 'x', order: 1, component: {} }] }, ['sheetComponents'])).not.toThrow()
	})

	it('ignores components when sheetComponents is not declared', () => {
		expect(() => validateBundleShape({ components: 'nope' }, ['dice'])).not.toThrow()
	})

	it('rejects non-function lifecycle hooks', () => {
		expect(() => validateBundleShape({ onInstall: 'nope' }, undefined)).toThrow(/onInstall must be a function/)
	})

	it('validates patches entries', () => {
		expect(() => validateBundleShape({ patches: [{ version: '1.0.0' }] }, undefined)).toThrow(/patches\[0\]/)
		expect(() => validateBundleShape({ patches: [{ version: '1.0.0', action: () => {} }] }, undefined)).not.toThrow()
	})

	it('validates theme.css when theme is declared', () => {
		expect(() => validateBundleShape({ theme: {} }, ['theme'])).toThrow(/theme.css must be a string/)
		expect(() => validateBundleShape({ theme: { css: '' } }, ['theme'])).not.toThrow()
	})

	it('rejects an oversized theme.css', () => {
		expect(() => validateBundleShape({ theme: { css: 'x'.repeat(101 * 1024) } }, ['theme'])).toThrow(/theme.css is .*over the 100KB limit/)
		expect(() => validateBundleShape({ theme: { css: 'x'.repeat(99 * 1024) } }, ['theme'])).not.toThrow()
	})

	it('validates dice.shapes when dice is declared', () => {
		class ValidShape {
			static name = 'Valid'
			static icon = 'icon.svg'
		}
		expect(() => validateBundleShape({ dice: { shapes: 'nope' } }, ['dice'])).toThrow(/dice.shapes must be an array/)
		expect(() => validateBundleShape({ dice: { shapes: [{}] } }, ['dice'])).toThrow(/dice.shapes\[0\]/)
		expect(() => validateBundleShape({ dice: { shapes: [class {}] } }, ['dice'])).toThrow(/dice.shapes\[0\]/)
		expect(() => validateBundleShape({ dice: { shapes: [ValidShape] } }, ['dice'])).not.toThrow()
	})

	it('validates dice.materials when dice is declared', () => {
		const validMaterial = { name: 'red', faceMaterial: {}, symbolMaterial: {}, previewColor: '#ff0000' }
		expect(() => validateBundleShape({ dice: { materials: 'nope' } }, ['dice'])).toThrow(/dice.materials must be an array/)
		expect(() => validateBundleShape({ dice: { materials: [{ name: 'red' }] } }, ['dice'])).toThrow(/dice.materials\[0\]/)
		expect(() => validateBundleShape({ dice: { materials: [validMaterial] } }, ['dice'])).not.toThrow()
	})

	it('ignores dice when the dice capability is not declared', () => {
		expect(() => validateBundleShape({ dice: { shapes: 'nope' } }, ['theme'])).not.toThrow()
	})
})
