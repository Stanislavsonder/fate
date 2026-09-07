import character from '@/tests/e2e/fixtures/character.json'
import { seedE2ELocalStorage } from '@/tests/e2e/support/modStore'

describe('Mod Store - mod-not-installed guided install', () => {
	beforeEach(() => {
		cy.removeAllCharacters()
		// Not visiting the Mod Store directly here (this spec starts on the
		// character list) — still needs the registryBaseOverride seeded before
		// the app boots so a later visit to the Mod Store never hits the real
		// production registry.
		cy.visit('/tabs/character', { onBeforeLoad: seedE2ELocalStorage })
		cy.createTestCharacter()
		cy.addCharacterModuleReference(character.name, 'e2e@fixture-mod', '1.0.0')
		// findNotInstalledIssues cross-references the character's modules against
		// the CACHED registry index only (it never fetches) — without this, the
		// missing mod isn't classified as 'mod-not-installed' at all, and only
		// the older, unrelated updateModules() "Module not found" toast fires.
		cy.fixture('mods/registry.v1.json').then(index => cy.seedRegistryCache(index, Date.now()))
	})

	it('shows a guided-install toast for a referenced-but-not-installed mod, then stops once installed', () => {
		cy.visit('/tabs/character/list')
		cy.get(`[data-testid="character-select"][data-testname="${character.name}"]`).click()

		// Loading a character whose module isn't resolvable also runs the
		// (separate, older) updateModules() error toast for the same id — so
		// two ion-toast elements can legitimately coexist here. Target the one
		// with the "Open Mod Store" action specifically rather than asserting
		// on whichever toast cy.get('ion-toast') happens to match first.
		cy.getToast().contains('button', 'Open Mod Store').should('exist')
		cy.getToast().contains('Open Mod Store').click({ force: true })
		cy.url().should('include', '/tabs/settings/mods')
		// Let both toasts from the previous step fully clear before installing —
		// otherwise their still-present text gets swept into the next
		// contain.text check against whichever ion-toast cy.get() first matches.
		cy.get('ion-toast', { timeout: 8000 }).should('not.exist')

		cy.interceptRegistry('registry.v1.json')
		cy.interceptModFiles('e2e@fixture-mod', '1.0.0')
		cy.get('[data-testid="mod-store-entry"][data-testname="e2e@fixture-mod"]').click()
		cy.get('[data-testid="mod-store-install-button"]').click()
		cy.getToast().should('contain.text', '"E2E Fixture Mod" installed')

		cy.visit('/tabs/character/list')
		cy.get(`[data-testid="character-select"][data-testname="${character.name}"]`).click()
		cy.url().should('include', '/tabs/character')
		// Negative assertion — there's no positive signal to wait on for "the toast
		// that would have fired already didn't", so this gives installModules'
		// async resolution a moment to finish before checking its absence.
		cy.wait(500)
		cy.get('ion-toast').should('not.exist')
	})
})
