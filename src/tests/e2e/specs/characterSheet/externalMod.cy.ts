import { seedE2ELocalStorage } from '../../support/modStore'

describe('External mod on the character sheet', () => {
	const characterName = 'External Mod Test'

	beforeEach(() => {
		cy.removeAllCharacters()
		cy.visit('/tabs/character', { onBeforeLoad: seedE2ELocalStorage })
		cy.seedBuiltMod('example-mod/1.0.0')
		// Seeded rows only load on boot (initMods runs before mount) — reboot.
		cy.visit('/tabs/character', { onBeforeLoad: seedE2ELocalStorage })
	})

	it('shows the External badge and manifest config, and round-trips mod data across reloads', () => {
		cy.get('[data-testid="create-character-button"]').click()
		cy.get('[data-testid="character-name-input"]').type(characterName)

		// Listed with its resolved (translated) name
		cy.contains('[data-testid="module-list-item"]', 'Example Mod').should('exist')

		// Its config modal renders from manifest.json, translations resolved, and
		// carries the External badge (ModuleInfo.vue)
		cy.get('[data-testid="module-settings-button"][data-testname="sonder@example"]').click()
		cy.contains('Max note length').should('exist')
		cy.get('ion-modal').find('ion-badge').contains('External').should('exist')
		cy.get('ion-modal ion-buttons[slot="start"] ion-button').click({ force: true })
		cy.get('ion-modal').should('have.class', 'overlay-hidden')

		// Select it and create the character
		cy.get('[data-testid="module-checkbox"][data-testname="sonder@example"]').click({ force: true })
		cy.get('[data-testid="create-character-form-button"]').click()
		cy.url().should('include', '/tabs/character')
		cy.url().should('not.include', '/create')

		// The mod's sheet section rendered, translations resolved
		cy.contains('.example-section', 'Example Section').should('exist')

		// getModData/setModData round-trip: type, autosave (300ms debounce), reboot
		cy.get('.example-section ion-input input').type('remember me')
		cy.get('.example-section ion-input input').should('have.value', 'remember me')
		cy.wait(1000)
		cy.visit('/tabs/character', { onBeforeLoad: seedE2ELocalStorage })
		cy.get('.example-section ion-input input').should('have.value', 'remember me')
	})
})
