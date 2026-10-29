import { describe, it, expect } from 'vitest'
import Dexie from 'dexie'

const CHARACTERS_V1_SCHEMA = '++id, _modules, _version, name, race, avatar, tokens, description, aspects, skills, stunts, stress, consequences, inventory'

describe('Dexie v1 -> v2 migration', () => {
	it('preserves existing character data and adds the mods/kv tables', async () => {
		// Simulate a pre-Phase-2 install: only version(1) has ever been declared.
		const legacyDb = new Dexie('CharactersDatabase')
		legacyDb.version(1).stores({ characters: CHARACTERS_V1_SCHEMA })
		await legacyDb.open()
		const id = await legacyDb.table<Record<string, unknown>>('characters').add({ name: 'Legacy Hero', avatar: '', _modules: {}, _version: '1.3.3' })
		legacyDb.close()

		// Now open the app's actual db, which declares version(1) identically and adds version(2).
		const { default: db } = await import('@/db/database')
		const character = await db.characters.get(id as number)

		expect(character).toEqual({ id, name: 'Legacy Hero', avatar: '', _modules: {}, _version: '1.3.3' })
		await expect(db.mods.toArray()).resolves.toEqual([])
		await expect(db.kv.toArray()).resolves.toEqual([])
	})
})
