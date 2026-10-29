import db from '../database'

const kv = db.kv

/** Small generic key/value store, reserved in the Phase 2 schema for exactly
 * this — currently only registryClient.ts's cached registry.json index. */
export const kvService = {
	async get<T>(key: string): Promise<T | undefined> {
		const row = await kv.get(key)
		return row?.value as T | undefined
	},
	async set<T>(key: string, value: T): Promise<void> {
		await kv.put({ key, value })
	}
}

export default kv
