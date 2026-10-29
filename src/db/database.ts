import Dexie, { type EntityTable } from 'dexie'
import type { Character } from '@/types'
import type { StoredMod } from './tables/mods'

export interface KVRow {
	key: string
	value: unknown
}

const db = new Dexie('CharactersDatabase') as Dexie & {
	characters: EntityTable<Character, 'id'>
	mods: EntityTable<StoredMod, 'id'>
	kv: EntityTable<KVRow, 'key'>
}

db.version(1).stores({
	characters: '++id, _modules, _version, name, race, avatar, tokens, description, aspects, skills, stunts, stress, consequences, inventory'
})

// Modules 2.0 Phase 2: adds external-mod storage (`mods`) and a small key/value
// table reserved for Phase 3's registry index cache (`kv`). No upgrade() callback
// needed — no data transform, only new tables and a slimmed `characters` index
// list (Dexie migrates indexes automatically; whole objects are still stored
// regardless of which fields are indexed).
// `enabled` is intentionally not indexed: IndexedDB keys must be number/string/
// Date/binary/Array — booleans are not a valid key type, so Dexie can't index
// them. The mods table stays small (a handful of installed mods at most), so
// modsService.getAllEnabled() filters in JS after a full toArray() instead.
db.version(2).stores({
	characters: '++id, name, _version',
	mods: 'id, source',
	kv: 'key'
})

export default db
