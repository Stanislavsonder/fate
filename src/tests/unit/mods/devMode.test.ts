import { describe, it, expect, vi, beforeEach } from 'vitest'

const { fetchManifest, fetchBundleAndTranslations } = vi.hoisted(() => ({
	fetchManifest: vi.fn(),
	fetchBundleAndTranslations: vi.fn()
}))
vi.mock('@/mods/installService', () => ({ fetchManifest, fetchBundleAndTranslations }))

const { loadExternalMod } = vi.hoisted(() => ({ loadExternalMod: vi.fn() }))
vi.mock('@/mods/loader', () => ({ loadExternalMod }))

const { putMod, getMod } = vi.hoisted(() => ({ putMod: vi.fn().mockResolvedValue(undefined), getMod: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/db/tables/mods', () => ({ modsService: { put: putMod, get: getMod } }))

const { reconfigureCharacter, characterRef } = vi.hoisted(() => ({
	reconfigureCharacter: vi.fn(),
	characterRef: { value: undefined as unknown }
}))
vi.mock('@/store/useCharacter', () => ({
	default: () => ({
		get character() {
			return characterRef.value
		},
		reconfigureCharacter
	})
}))

class FakeEventSource {
	static instances: FakeEventSource[] = []
	url: string
	onmessage: ((event: MessageEvent) => void) | null = null
	onerror: ((event: Event) => void) | null = null
	closed = false

	constructor(url: string) {
		this.url = url
		FakeEventSource.instances.push(this)
	}

	close() {
		this.closed = true
	}

	emit() {
		this.onmessage?.(new MessageEvent('message'))
	}
}

vi.stubGlobal('EventSource', FakeEventSource)

import { ModRegistry } from '@/mods/modRegistry'
import { connectDevMod, disconnectDevMod, isDevModConnected } from '@/mods/devMode'

function mockHappyFetch(id: string) {
	fetchManifest.mockResolvedValue({ ok: true, data: { id, version: '1.0.0', languages: [] } })
	fetchBundleAndTranslations.mockResolvedValue({
		ok: true,
		data: { manifest: { id, version: '1.0.0' }, bundleCode: 'export default {}', translationsJson: '{}', sha256: 'irrelevant' }
	})
	loadExternalMod.mockResolvedValue({ id, version: '1.0.0' })
}

beforeEach(() => {
	vi.clearAllMocks()
	FakeEventSource.instances = []
	characterRef.value = undefined
})

describe('connectDevMod', () => {
	it('loads the mod as source "dev" and opens an EventSource to <url>/events', async () => {
		mockHappyFetch('author@dev-mod')

		const result = await connectDevMod('http://192.168.1.20:5199')

		expect(result).toEqual({ ok: true, id: 'author@dev-mod' })
		expect(loadExternalMod).toHaveBeenCalledWith(expect.objectContaining({ id: 'author@dev-mod', source: 'dev' }))
		expect(putMod).not.toHaveBeenCalled()
		expect(ModRegistry.get('author@dev-mod')).toEqual({
			manifest: { id: 'author@dev-mod', version: '1.0.0' },
			source: 'dev',
			status: 'loaded'
		})
		expect(isDevModConnected('author@dev-mod')).toBe(true)
		expect(FakeEventSource.instances).toHaveLength(1)
		expect(FakeEventSource.instances[0].url).toBe('http://192.168.1.20:5199/events')
	})

	it('refuses to connect over a built-in id', async () => {
		ModRegistry.register({ manifest: { id: 'builtin@mod', version: '1.0.0' } as never, source: 'builtin', status: 'loaded' })
		mockHappyFetch('builtin@mod')

		const result = await connectDevMod('http://192.168.1.20:5199')

		expect(result).toEqual({ ok: false, error: '"builtin@mod" conflicts with a built-in mod' })
		expect(FakeEventSource.instances).toHaveLength(0)
	})

	it('refuses to connect over an installed mod', async () => {
		getMod.mockResolvedValueOnce({ id: 'author@dev-mod', source: 'registry' })
		mockHappyFetch('author@dev-mod')

		const result = await connectDevMod('http://192.168.1.20:5199')

		expect(result).toEqual({ ok: false, error: '"author@dev-mod" is installed — remove it before connecting a dev build of it' })
		expect(loadExternalMod).not.toHaveBeenCalled()
		expect(FakeEventSource.instances).toHaveLength(0)
	})

	it('reconnecting to the same id closes the previous EventSource', async () => {
		mockHappyFetch('author@dev-mod')

		await connectDevMod('http://192.168.1.20:5199')
		const first = FakeEventSource.instances[0]
		await connectDevMod('http://192.168.1.20:5199')

		expect(first.closed).toBe(true)
		expect(FakeEventSource.instances).toHaveLength(2)
		expect(isDevModConnected('author@dev-mod')).toBe(true)
	})

	it('surfaces a fetch failure without opening a connection', async () => {
		fetchManifest.mockResolvedValue({ ok: false, error: 'network error' })

		const result = await connectDevMod('http://192.168.1.20:5199')

		expect(result).toEqual({ ok: false, error: 'network error' })
		expect(FakeEventSource.instances).toHaveLength(0)
	})
})

describe('disconnectDevMod', () => {
	it('closes the connection and stops tracking it', async () => {
		mockHappyFetch('author@dev-mod')
		await connectDevMod('http://192.168.1.20:5199')

		disconnectDevMod('author@dev-mod')

		expect(FakeEventSource.instances[0].closed).toBe(true)
		expect(isDevModConnected('author@dev-mod')).toBe(false)
	})
})

describe('hot-reimport on rebuild', () => {
	it('re-registers the mod and reconfigures the currently open character through the existing store action', async () => {
		mockHappyFetch('author@dev-mod')
		await connectDevMod('http://192.168.1.20:5199')

		const character = { id: 1, name: 'Hero', avatar: '', _modules: { 'author@dev-mod': { version: '1.0.0' } } }
		characterRef.value = character
		reconfigureCharacter.mockResolvedValue(undefined)

		loadExternalMod.mockResolvedValue({ id: 'author@dev-mod', version: '1.0.1' })
		FakeEventSource.instances[0].emit()
		await vi.waitFor(() => expect(reconfigureCharacter).toHaveBeenCalledTimes(1))

		// Deliberately going through reconfigureCharacter (id + modules), not a raw
		// changeCharacterModules(character, ...) call — passing the live reactive
		// character object directly into changeCharacterModules throws
		// DataCloneError from its internal structuredClone() backup; this was
		// caught by manual browser testing, not by this test's earlier version,
		// which mocked changeCharacterModules directly and never exercised the
		// real store interaction.
		expect(reconfigureCharacter).toHaveBeenCalledWith(1, character._modules)
		expect(ModRegistry.get('author@dev-mod')?.manifest.version).toBe('1.0.1')
	})

	it('does nothing to the open character when it does not use the reloaded mod', async () => {
		mockHappyFetch('author@dev-mod')
		await connectDevMod('http://192.168.1.20:5199')

		characterRef.value = { id: 1, name: 'Hero', avatar: '', _modules: {} }

		FakeEventSource.instances[0].emit()
		await vi.waitFor(() => expect(loadExternalMod).toHaveBeenCalledTimes(2))

		expect(reconfigureCharacter).not.toHaveBeenCalled()
	})
})
