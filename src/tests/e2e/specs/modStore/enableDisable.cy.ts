import { seedE2ELocalStorage } from '../../support/modStore'

describe('Installed mods - enable/disable', () => {
	const characterName = 'Toggle Test'

	beforeEach(() => {
		cy.removeAllCharacters()
		cy.visit('/tabs/character', { onBeforeLoad: seedE2ELocalStorage })
		cy.seedBuiltMod('example-mod/1.0.0')
		cy.visit('/tabs/character', { onBeforeLoad: seedE2ELocalStorage })

		cy.get('[data-testid="create-character-button"]').click()
		cy.get('[data-testid="character-name-input"]').type(characterName)
		cy.get('[data-testid="module-checkbox"][data-testname="sonder@example"]').click({ force: true })
		cy.get('[data-testid="create-character-form-button"]').click()
		cy.contains('.example-section', 'Example Section').should('exist')
	})

	it('disabling removes the sheet section in-session; re-enabling brings it back', () => {
		cy.visit('/tabs/settings/mods', { onBeforeLoad: seedE2ELocalStorage })
		cy.switchModStoreTab('installed')

		cy.get('[data-testid="installed-mod-row"][data-testname="sonder@example"] [data-testid="installed-mod-enable-toggle"]').click()

		// Client-side navigation (no reboot) — the section must already be gone
		// ion-tab-button's `tab` prop is not reflected as an HTML attribute (same
		// quirk as ion-segment-button — see switchModStoreTab) — match by label.
		cy.contains('ion-tab-button', 'Character').click({ force: true })
		cy.url().should('include', '/tabs/character')
		cy.get('.example-section').should('not.exist')
		cy.get('ion-toast').should('not.exist')

		// Re-enable loads it back in-session (this boot started with it disabled,
		// so setEnabled(true) must live-load the bundle, not rely on a reboot)
		cy.visit('/tabs/settings/mods', { onBeforeLoad: seedE2ELocalStorage })
		cy.switchModStoreTab('installed')
		cy.get('[data-testid="installed-mod-row"][data-testname="sonder@example"] [data-testid="installed-mod-enable-toggle"]').click()

		// ion-tab-button's `tab` prop is not reflected as an HTML attribute (same
		// quirk as ion-segment-button — see switchModStoreTab) — match by label.
		cy.contains('ion-tab-button', 'Character').click({ force: true })
		cy.url().should('include', '/tabs/character')
		cy.contains('.example-section', 'Example Section').should('exist')
	})
})
