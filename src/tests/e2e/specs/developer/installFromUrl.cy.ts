import { seedE2ELocalStorage } from '../../support/modStore'

/** Any URL works — installFromUrl fetches `<base>/manifest.json` etc., and the
 * intercepts serve the committed real-build fixture (see fixtures/mods/README.md). */
const MOD_BASE = 'https://fixture-registry.invalid/hosted/sonder-example'

function seedWithDevMode(win: Cypress.AUTWindow): void {
	seedE2ELocalStorage(win)
	win.localStorage.setItem('developerMode', 'true')
}

describe('Developer Mode - install from URL', () => {
	beforeEach(() => {
		cy.removeAllCharacters()
		cy.intercept('GET', `${MOD_BASE}/manifest.json`, { fixture: 'mods/example-mod/1.0.0/manifest.json,utf-8' })
		cy.intercept('GET', `${MOD_BASE}/bundle.mjs`, { fixture: 'mods/example-mod/1.0.0/bundle.mjs,utf-8' })
		cy.intercept('GET', `${MOD_BASE}/translations/en.json`, { fixture: 'mods/example-mod/1.0.0/translations/en.json,utf-8' })
		cy.visit('/tabs/settings/developer', { onBeforeLoad: seedWithDevMode })
	})

	it('gates the install behind the typed confirmation and lands the mod as installed', () => {
		cy.get('[data-testid="install-url-input"] input').type(MOD_BASE)
		cy.get('[data-testid="install-url-button"]').click()

		// Wrong confirmation text keeps the alert open and installs nothing
		cy.get('ion-alert').should('exist')
		cy.get('ion-alert input').type('wrong-id')
		cy.contains('ion-alert button', 'Confirm').click()
		cy.get('ion-alert').should('exist')

		// The exact mod id confirms
		cy.get('ion-alert input').clear()
		cy.get('ion-alert input').type('sonder@example')
		cy.contains('ion-alert button', 'Confirm').click()

		cy.getToast().should('contain.text', '"sonder@example" installed')

		cy.visit('/tabs/settings/mods', { onBeforeLoad: seedWithDevMode })
		cy.switchModStoreTab('installed')
		cy.get('[data-testid="installed-mod-row"][data-testname="sonder@example"]').should('exist').and('contain.text', 'v1.0.0')
	})

	it('cancelling the typed confirmation installs nothing', () => {
		cy.get('[data-testid="install-url-input"] input').type(MOD_BASE)
		cy.get('[data-testid="install-url-button"]').click()

		cy.get('ion-alert').should('exist')
		cy.contains('ion-alert button', 'Cancel').click()
		cy.get('ion-alert').should('not.exist')

		cy.visit('/tabs/settings/mods', { onBeforeLoad: seedWithDevMode })
		cy.switchModStoreTab('installed')
		cy.get('[data-testid="installed-mod-row"]').should('not.exist')
	})
})
