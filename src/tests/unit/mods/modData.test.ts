import { describe, it, expect } from 'vitest'
import { deleteModData, getModData, setModData, type Character } from '@fate-app/mod-types'

function character(extra: Record<string, unknown> = {}): Character {
	return { id: 1, name: 'Hero', avatar: '', _modules: {}, ...extra } as Character
}

describe('mod data accessors', () => {
	it('stores data under <modId>.<key>', () => {
		const hero = character()

		setModData(hero, 'author@mod', 'note', 'hi')

		expect(hero['author@mod.note']).toBe('hi')
		expect(getModData<string>(hero, 'author@mod', 'note')).toBe('hi')
	})

	it('cannot reach app fields or a malformed namespace', () => {
		const hero = character()

		expect(() => setModData(hero, 'name', 'x', 'pwned')).toThrow(/not a valid mod id/)
		expect(() => setModData(hero, '', 'name', 'pwned')).toThrow(/not a valid mod id/)
		expect(() => setModData(hero, 'author@mod', '', 'x')).toThrow(/non-empty string/)
		expect(hero.name).toBe('Hero')
	})

	it('deletes one key, or everything the mod stored', () => {
		const hero = character({ 'author@mod.a': 1, 'author@mod.b': 2, 'author@mod-two.a': 3, 'other@mod.a': 4 })

		deleteModData(hero, 'author@mod', 'a')
		expect(Object.keys(hero)).toContain('author@mod.b')
		expect(Object.keys(hero)).not.toContain('author@mod.a')

		deleteModData(hero, 'author@mod')
		expect(hero['author@mod.b']).toBeUndefined()
		expect(hero['author@mod-two.a']).toBe(3)
		expect(hero['other@mod.a']).toBe(4)
	})
})
