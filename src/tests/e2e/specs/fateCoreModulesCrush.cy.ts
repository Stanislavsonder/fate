import type { CharacterAspect } from '@/modules/sonder@core-aspects/src/types'
import { CharacterAspectType } from '@/modules/sonder@core-aspects/src/types'

const startCharacter = 'Mister Andersen'
const testAspect: CharacterAspect = {
	name: 'Crush-test',
	description: 'Crush-test description',
	type: CharacterAspectType.Trouble
}

describe('Fate Core Modules crush-test', () => {
	it('Crush-test!', () => {
		cy.removeAllCharacters()
		cy.acceptPrivacyPolicy()
		cy.visit('/tabs/character')
		cy.get('[data-testid="create-character-button"]').click()
		cy.url().should('include', '/tabs/character/create')

		cy.get('[data-testid="character-name-input"]').type(startCharacter)

		// Create only with Aspects, Stress and Tokens
		const toDisable = ['sonder@core-stunts', 'sonder@core-skills', 'sonder@core-identity', 'sonder@core-consequences']
		for (const id of toDisable) {
			cy.get(`ion-checkbox[data-testname="${id}"]`).click()
		}

		// Configure fate points - set max to 5
		cy.get('ion-button[data-testname*="sonder@core-tokens"]').click()
		cy.get('[data-testid="config-option-number"][data-testname="max-tokens"]').type('{backspace}5{esc}')

		// Save
		cy.get('[data-testid="create-character-form-button"]').click()

		// Check that 3 sections are present and correct
		cy.get('[data-testid="sheet-section"]').should('exist').and('have.length', 3)
		cy.get('[data-testid="sheet-section"]').eq(0).contains('Aspects')
		cy.get('[data-testid="sheet-section"]').eq(1).contains('Stress')
		cy.get('[data-testid="sheet-section"]').eq(2).contains('Fate Points')

		// Add an Aspect
		cy.addAspect(testAspect)

		// Add 10 fate points
		for (let i = 0; i < 10; i++) {
			cy.get('[data-testid="add-token"]').click({ force: true })
		}

		// Check that max fate points is 5
		cy.get('[data-testid="token"]').should('have.length', 5)

		// Check is 2 types of stress are presented
		cy.get('[data-testid="stress-section"]').should('have.length', 2)

		// Click 2nd checkbox in physical stress
		cy.checkStressBox('sonder@core-stress.physical', 1)
		cy.stressExists('sonder@core-stress.physical', 1)

		cy.checkStressBox('sonder@core-stress.mental', 1)
		cy.checkStressBox('sonder@core-stress.mental', 2)
		cy.stressExists('sonder@core-stress.mental', 1)
		cy.stressExists('sonder@core-stress.mental', 2)

		// All good. Now reconfigure the character
		cy.openReconfigureWindow()
	})
})
