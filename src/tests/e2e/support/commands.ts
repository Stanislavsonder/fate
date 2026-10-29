/// <reference types="cypress" />
// ***********************************************
// This example commands.ts shows you how to
// create various custom commands and overwrite
// existing commands.
//
// For more comprehensive examples of custom
// commands please read more here:
// https://on.cypress.io/custom-commands
// ***********************************************
import character from '@/tests/e2e/fixtures/character.json'
import { ACTUAL_POLICY_VERSION_DATE } from '@/composables/usePolicy'
import './core'
import './modStore'

declare global {
	// eslint-disable-next-line @typescript-eslint/no-namespace
	namespace Cypress {
		interface Chainable {
			acceptPrivacyPolicy(): Chainable<void>
			createTestCharacter(): Chainable<void>
			removeAllCharacters(): Chainable<void>
		}
	}
}

Cypress.Commands.add('acceptPrivacyPolicy', () => {
	cy.window().then(win => {
		win.localStorage.setItem('privacyPolicyAcceptanceDate', new Date().toISOString())
		win.localStorage.setItem('privacyPolicyVersionDate', ACTUAL_POLICY_VERSION_DATE)
	})
})

Cypress.Commands.add('removeAllCharacters', () => {
	// Must actually wait for the delete to finish — the old version fired
	// deleteDatabase() and moved on immediately, so a following cy.visit()
	// could navigate (and the new page's Dexie connection could open, cache
	// a fresh registry index, etc.) before the delete had actually completed,
	// racing the new page's own writes.
	cy.window().then(
		win =>
			new Promise<void>((resolve, reject) => {
				const request = win.indexedDB.deleteDatabase('CharactersDatabase')
				request.onsuccess = () => resolve()
				request.onerror = () => reject(request.error)
				// onblocked fires while another connection is still open — deliberately
				// not resolving here; onsuccess still fires once that connection closes.
			})
	)
})

Cypress.Commands.add('createTestCharacter', () => {
	cy.get('[data-testid="create-character-button"]').click()
	cy.url().should('include', '/tabs/character/create')

	// Set name
	cy.get('[data-testid="character-name-input"]').type(character.name)

	// Create
	cy.get('[data-testid="create-character-form-button"]').click()
})
