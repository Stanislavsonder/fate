import { seedE2ELocalStorage } from '../../support/modStore'

describe('External dice mod', () => {
	beforeEach(() => {
		cy.visit('/tabs/roll-dice', { onBeforeLoad: seedE2ELocalStorage })
		cy.seedBuiltMod('example-dice-mod/1.0.0')
		cy.visit('/tabs/roll-dice', { onBeforeLoad: seedE2ELocalStorage })
	})

	it('registers namespaced shape/material, persists selection, and self-heals after removal', () => {
		cy.get('[data-testid="roll-config-open"]').click()

		// External entries appear under namespaced keys; builtins stay unnamespaced
		cy.get('[data-testid="dice-shape-option"][data-testname="Fudge"]').should('exist')
		cy.get('[data-testid="dice-shape-option"][data-testname="sonder@example-dice:D6"]').should('exist').and('contain.text', 'D6')
		cy.get('[data-testid="dice-material-option"][data-testname="sonder@example-dice:Gold"]').should('exist')

		// Select both; the selection is persisted to localStorage
		cy.get('[data-testid="dice-shape-option"][data-testname="sonder@example-dice:D6"]').click()
		cy.get('[data-testid="dice-shape-option"][data-testname="sonder@example-dice:D6"] ion-icon').should('have.class', 'text-accent')
		cy.get('[data-testid="dice-material-option"][data-testname="sonder@example-dice:Gold"]').click()
		cy.get('[data-testid="dice-material-option"][data-testname="sonder@example-dice:Gold"]').should('have.class', 'border-accent!')
		cy.window().should(win => {
			const config = JSON.parse(win.localStorage.getItem('dice-roll-config')!) as { dice: { shape: string; material: string } }
			expect(config.dice.shape).to.equal('sonder@example-dice:D6')
			expect(config.dice.material).to.equal('sonder@example-dice:Gold')
		})

		// Survives a reboot
		cy.visit('/tabs/roll-dice', { onBeforeLoad: seedE2ELocalStorage })
		cy.get('[data-testid="roll-config-open"]').click()
		cy.get('[data-testid="dice-shape-option"][data-testname="sonder@example-dice:D6"] ion-icon').should('have.class', 'text-accent')

		// Removing the mod makes the stale persisted config self-heal to builtins
		cy.deleteInstalledMod('sonder@example-dice')
		cy.visit('/tabs/roll-dice', { onBeforeLoad: seedE2ELocalStorage })
		cy.get('[data-testid="roll-config-open"]').click()
		cy.get('[data-testid="dice-shape-option"][data-testname="sonder@example-dice:D6"]').should('not.exist')
		cy.window().should(win => {
			const config = JSON.parse(win.localStorage.getItem('dice-roll-config')!) as { dice: { shape: string; material: string } }
			expect(config.dice.shape).to.equal('Fudge')
			expect(config.dice.material).to.equal('white')
		})
	})
})
