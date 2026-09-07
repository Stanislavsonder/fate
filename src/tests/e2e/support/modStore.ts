/// <reference types="cypress" />
import type { StoredMod } from '@/db/tables/mods'
import type { RegistryIndex } from '@/mods/registryClient'
import { ACTUAL_POLICY_VERSION_DATE } from '@/composables/usePolicy'

/** A synthetic, non-resolving host (`.invalid` is RFC-2606-reserved) used as the
 * registryBaseOverride for every Mod Store spec — if an intercept pattern is
 * ever wrong, requests fail loudly against this host instead of silently
 * falling through to the real production registry. */
export const FIXTURE_REGISTRY_BASE = 'https://fixture-registry.invalid/fate-mods'

/** Seeds privacy-policy acceptance + the registryBaseOverride into localStorage
 * before the app's module graph first evaluates. useRegistryBase's override ref
 * is read once at import time, so this must run via cy.visit's onBeforeLoad —
 * setting it after the SPA has already booted is too late. Exported so specs
 * that need to start somewhere other than the Mod Store page (e.g. notInstalled.cy.ts,
 * which starts on the character list) can still avoid hitting the real registry. */
export function seedE2ELocalStorage(win: Cypress.AUTWindow): void {
	win.localStorage.setItem('privacyPolicyAcceptanceDate', new Date().toISOString())
	win.localStorage.setItem('privacyPolicyVersionDate', ACTUAL_POLICY_VERSION_DATE)
	win.localStorage.setItem('registryBaseOverride', FIXTURE_REGISTRY_BASE)
}

interface StoredCharacterRow {
	id: number
	name: string
	_modules: Record<string, { version: string; config?: Record<string, unknown> }>
}

declare global {
	// eslint-disable-next-line @typescript-eslint/no-namespace
	namespace Cypress {
		interface Chainable {
			/** Intercepts registry.json with a fixture, sets up privacy-policy
			 * acceptance + the registryBaseOverride (before the app's module graph
			 * evaluates, via onBeforeLoad), and visits the Mod Store page. */
			visitModStore(registryFixture: string): Chainable<void>
			/** Re-intercepts registry.json mid-test (for update/blocklist specs that
			 * swap the index after the initial page load). */
			interceptRegistry(registryFixture: string): Chainable<void>
			/** Intercepts a mod version's 3 artifact files against fixture-mod/<version>/*. */
			interceptModFiles(id: string, version: string, fixtureDir?: string): Chainable<void>
			/** Dispatches a synthetic ionRefresh event on the Browse tab's IonRefresher —
			 * real swipe gestures are unreliable in Cypress; IonRefresher only needs the
			 * event plus a callable detail.complete(). */
			triggerModStoreRefresh(): Chainable<void>
			/** Raw IndexedDB write — seeds an "already installed" precondition without
			 * going through the UI. */
			seedInstalledMod(row: StoredMod): Chainable<void>
			/** Seeds a *real built* mod (a `pnpm fixtures:mods` snapshot under
			 * fixtures/mods/<fixtureDir>) as installed+enabled, recomputing the
			 * sha256 in-browser so the loader's integrity gate passes. The row only
			 * takes effect on the NEXT app boot (initMods runs before mount) — follow
			 * with a fresh cy.visit. */
			seedBuiltMod(fixtureDir: string): Chainable<void>
			/** Raw IndexedDB delete of an installed mod row — the "user removed the
			 * mod" precondition without driving the UI (again effective next boot). */
			deleteInstalledMod(id: string): Chainable<void>
			/** Raw IndexedDB write — seeds the cached registry index (and its fetchedAt,
			 * for backdating past the 24h staleness threshold) without a real fetch. */
			seedRegistryCache(index: RegistryIndex, fetchedAt: number): Chainable<void>
			/** Patches an existing character's _modules to reference a mod id/version —
			 * used to trigger the mod-not-installed flow without driving the real
			 * .fchar file-picker (see notInstalled.cy.ts for why). */
			addCharacterModuleReference(characterName: string, moduleId: string, version: string): Chainable<void>
			getStoredCharacter(characterName: string): Chainable<StoredCharacterRow>
			/** ion-toast renders its message/buttons inside a shadow root, not as
			 * slotted light-DOM content — plain `cy.get('ion-toast').should('contain.text', ...)`
			 * always sees empty text because .text() doesn't cross the shadow
			 * boundary. Use this instead of cy.get('ion-toast') for text assertions
			 * (keep using cy.get('ion-toast').should('not.exist') for absence checks). */
			getToast(): Chainable<JQuery<HTMLElement>>
			/** ion-segment-button's `value` prop is not reflected as an HTML
			 * attribute — `ion-segment-button[value="installed"]` never matches
			 * anything. Select by its visible label text instead. */
			switchModStoreTab(tab: 'browse' | 'installed'): Chainable<void>
			/** Dismisses the still-open detail modal via its backdrop (backdropDismiss
			 * defaults true) — needed before interacting with anything behind it
			 * (e.g. the tab segment), which Cypress otherwise reports as covered. */
			closeModStoreModal(): Chainable<void>
		}
	}
}

// DOMException's `.message` is a getter-only accessor — if one escapes as a
// rejection, Cypress's own error-enrichment code (which tries to overwrite
// `.message`) throws a second, more confusing TypeError instead of showing the
// real error. Normalize to a plain Error so failures are readable.
function toPlainError(reason: unknown): Error {
	if (reason instanceof Error && !(reason instanceof DOMException)) {
		return reason
	}
	return new Error(String(reason))
}

function withDatabase<T>(win: Cypress.AUTWindow, run: (db: IDBDatabase) => Promise<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		// Deliberately no version argument — the app's own Dexie connection has
		// already opened (and possibly upgraded) this database earlier in the
		// test. Requesting a hardcoded version here risks a VersionError if it
		// ever drifts from whatever Dexie actually negotiated.
		const request = win.indexedDB.open('CharactersDatabase')
		request.onerror = () => reject(toPlainError(request.error))
		request.onsuccess = () => {
			run(request.result)
				.then(resolve, (reason: unknown) => reject(toPlainError(reason)))
				.finally(() => request.result.close())
		}
	})
}

function putRecord(win: Cypress.AUTWindow, storeName: 'mods' | 'kv' | 'characters', value: unknown): Promise<void> {
	return withDatabase(
		win,
		db =>
			new Promise((resolve, reject) => {
				const tx = db.transaction(storeName, 'readwrite')
				tx.objectStore(storeName).put(value)
				tx.oncomplete = () => resolve()
				tx.onerror = () => reject(toPlainError(tx.error))
			})
	)
}

function getAllRecords<T>(win: Cypress.AUTWindow, storeName: 'mods' | 'kv' | 'characters'): Promise<T[]> {
	return withDatabase(
		win,
		db =>
			new Promise((resolve, reject) => {
				const request = db.transaction(storeName, 'readonly').objectStore(storeName).getAll()
				request.onsuccess = () => resolve(request.result as T[])
				request.onerror = () => reject(toPlainError(request.error))
			})
	)
}

Cypress.Commands.add('interceptRegistry', (registryFixture: string) => {
	cy.intercept('GET', `${FIXTURE_REGISTRY_BASE}/registry.json`, { fixture: `mods/${registryFixture}` }).as('registryIndex')
})

Cypress.Commands.add('interceptModFiles', (id: string, version: string, fixtureDir = 'fixture-mod') => {
	// The ",utf-8" encoding suffix is load-bearing: without it, cy.fixture()
	// auto-parses .json fixtures into an object and Cypress re-serializes it
	// with its own JSON.stringify formatting, silently changing the exact bytes
	// (and therefore the sha256) the browser receives versus what's pinned in
	// the registry fixtures below.
	cy.intercept('GET', `${FIXTURE_REGISTRY_BASE}/mods/${id}/${version}/manifest.json`, { fixture: `mods/${fixtureDir}/${version}/manifest.json,utf-8` })
	cy.intercept('GET', `${FIXTURE_REGISTRY_BASE}/mods/${id}/${version}/bundle.mjs`, { fixture: `mods/${fixtureDir}/${version}/bundle.mjs,utf-8` })
	cy.intercept('GET', `${FIXTURE_REGISTRY_BASE}/mods/${id}/${version}/translations/en.json`, {
		fixture: `mods/${fixtureDir}/${version}/translations/en.json,utf-8`
	})
})

Cypress.Commands.add('visitModStore', (registryFixture: string) => {
	cy.interceptRegistry(registryFixture)
	cy.visit('/tabs/settings/mods', { onBeforeLoad: seedE2ELocalStorage })
})

Cypress.Commands.add('getToast', () => {
	return cy.get('ion-toast').shadow() as unknown as Cypress.Chainable<JQuery<HTMLElement>>
})

Cypress.Commands.add('switchModStoreTab', (tab: 'browse' | 'installed') => {
	// force: true — a still-visible toast in the header area routinely overlaps
	// the segment buttons underneath it.
	cy.contains('ion-segment-button', tab === 'browse' ? 'Browse' : 'Installed').click({ force: true })
})

Cypress.Commands.add('closeModStoreModal', () => {
	// The header's "X" close button (ModalWindow.vue's ion-buttons[slot="start"]),
	// not the backdrop — clicking the backdrop with {force: true} didn't reliably
	// trigger Ionic's dismiss gesture in headless runs. Note the ion-modal element
	// itself is NOT removed from the DOM on close (ModStoreBrowseTab.vue never
	// clears `selectedEntry`, so <ModStoreDetailModal> stays mounted) — Ionic just
	// marks it hidden (`overlay-hidden` class), so assert on that instead of
	// DOM removal.
	cy.get('ion-modal ion-buttons[slot="start"] ion-button').click({ force: true })
	cy.get('ion-modal').should('have.class', 'overlay-hidden')
})

Cypress.Commands.add('triggerModStoreRefresh', () => {
	cy.get('[data-testid="mod-store-refresher"]').then($el => {
		$el[0].dispatchEvent(new CustomEvent('ionRefresh', { detail: { complete: () => {} } }))
	})
	// Dispatching the event only starts refreshIndex()'s async chain — wait for
	// the actual request so callers can rely on the cache (and any side effects
	// like applyBlocklist's DB writes) being settled before reading state that
	// doesn't reactively update itself (e.g. the Installed tab's one-shot
	// onMounted read).
	cy.wait('@registryIndex')
})

Cypress.Commands.add('seedInstalledMod', (row: StoredMod) => {
	cy.window().then(win => putRecord(win, 'mods', row))
})

Cypress.Commands.add('seedBuiltMod', (fixtureDir: string) => {
	// null encoding => Cypress returns raw Buffers, never auto-parsing/re-
	// serializing JSON — the same exact-bytes concern as interceptModFiles'
	// ",utf-8" suffix, load-bearing here because the loader recomputes the
	// bundle's sha256 and refuses to load on any mismatch.
	cy.fixture(`mods/${fixtureDir}/manifest.json`, null).then((manifestBuf: Uint8Array) => {
		cy.fixture(`mods/${fixtureDir}/bundle.mjs`, null).then((bundleBuf: Uint8Array) => {
			cy.fixture(`mods/${fixtureDir}/translations/en.json`, null).then((translationsBuf: Uint8Array) => {
				cy.window().then(async win => {
					const decoder = new TextDecoder()
					const manifestJson = decoder.decode(manifestBuf)
					const bundleCode = decoder.decode(bundleBuf)
					const manifest = JSON.parse(manifestJson) as { id: string; version: string }

					const digest = await win.crypto.subtle.digest('SHA-256', new TextEncoder().encode(bundleCode))
					const sha256 = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')

					const now = Date.now()
					await putRecord(win, 'mods', {
						id: manifest.id,
						version: manifest.version,
						source: 'url',
						enabled: true,
						manifestJson,
						bundleCode,
						translationsJson: JSON.stringify({ en: JSON.parse(decoder.decode(translationsBuf)) }),
						sha256,
						sourceUrl: `${FIXTURE_REGISTRY_BASE}/mods/${manifest.id}/${manifest.version}`,
						installedAt: now,
						updatedAt: now
					} satisfies StoredMod)
				})
			})
		})
	})
})

Cypress.Commands.add('deleteInstalledMod', (id: string) => {
	cy.window().then(win =>
		withDatabase(
			win,
			db =>
				new Promise<void>((resolve, reject) => {
					const tx = db.transaction('mods', 'readwrite')
					tx.objectStore('mods').delete(id)
					tx.oncomplete = () => resolve()
					tx.onerror = () => reject(toPlainError(tx.error))
				})
		)
	)
})

Cypress.Commands.add('seedRegistryCache', (index: RegistryIndex, fetchedAt: number) => {
	cy.window().then(win => putRecord(win, 'kv', { key: 'registryIndex', value: { fetchedAt, index } }))
})

Cypress.Commands.add('addCharacterModuleReference', (characterName: string, moduleId: string, version: string) => {
	cy.window().then(async win => {
		const characters = await getAllRecords<StoredCharacterRow>(win, 'characters')
		const character = characters.find(c => c.name === characterName)
		if (!character) {
			throw new Error(`No character named "${characterName}" found in IndexedDB`)
		}
		character._modules = { ...character._modules, [moduleId]: { version } }
		await putRecord(win, 'characters', character)
	})
})

Cypress.Commands.add('getStoredCharacter', (characterName: string) => {
	cy.window().then(async win => {
		const characters = await getAllRecords<StoredCharacterRow>(win, 'characters')
		const character = characters.find(c => c.name === characterName)
		if (!character) {
			throw new Error(`No character named "${characterName}" found in IndexedDB`)
		}
		return character
	})
})
