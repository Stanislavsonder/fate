import type { FateModuleManifest } from '@fate-app/mod-types'

export type ModSource = 'builtin' | 'registry' | 'url' | 'dev'
export type ModStatus = 'loaded' | 'errored' | 'disabled'

export interface ModRecord {
	manifest: FateModuleManifest // for built-ins this is the full merged module
	source: ModSource
	status: ModStatus
	error?: string // present when status === 'errored'
}

const records = new Map<string, ModRecord>()

export const ModRegistry = {
	register(record: ModRecord): void {
		records.set(record.manifest.id, record)
	},
	get(id: string): ModRecord | undefined {
		return records.get(id)
	},
	/** Only mods usable for resolution/installation */
	getLoadedManifests(): Map<string, FateModuleManifest> {
		return new Map([...records].filter(([, r]) => r.status === 'loaded').map(([id, r]) => [id, r.manifest]))
	},
	getAll(): ModRecord[] {
		return [...records.values()]
	},
	remove(id: string): void {
		records.delete(id)
	}
}
