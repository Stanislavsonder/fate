import character from '@/tests/e2e/fixtures/character.json'

function confirmRemoveAlert() {
	cy.get('[data-testid="remove-mod-alert"]').should('be.visible')
	cy.get('[data-testid="remove-mod-confirm"]').click()
}

describe('Mod Store - Remove', () => {
	beforeEach(() => {
		cy.removeAllCharacters()
		cy.visitModStore('registry.v1.json')
		cy.interceptModFiles('e2e@fixture-mod', '1.0.0')

		cy.get('[data-testid="mod-store-entry"][data-testname="e2e@fixture-mod"]').click()
		cy.get('[data-testid="mod-store-install-button"]').click()
		cy.getToast().should('contain.text', '"E2E Fixture Mod" installed')
	})

	it('removes an installed mod from the detail modal after confirming', () => {
		cy.get('[data-testid="mod-store-remove-button"]').click()
		confirmRemoveAlert()
		cy.get('[data-testid="mod-store-install-button"]').should('exist')

		cy.closeModStoreModal()
		cy.switchModStoreTab('installed')
		cy.get('[data-testid="installed-mod-row"][data-testname="e2e@fixture-mod"]').should('not.exist')
	})

	it('keeps the mod installed when the confirmation is cancelled', () => {
		cy.get('[data-testid="mod-store-remove-button"]').click()
		cy.get('[data-testid="remove-mod-cancel"]').click()
		cy.get('[data-testid="mod-store-remove-button"]').should('exist')

		cy.closeModStoreModal()
		cy.switchModStoreTab('installed')
		cy.get('[data-testid="installed-mod-row"][data-testname="e2e@fixture-mod"]').should('exist')
	})

	it("removes an installed mod from the Installed tab's own Remove button", () => {
		cy.closeModStoreModal()
		cy.switchModStoreTab('installed')
		cy.get('[data-testid="installed-mod-row"][data-testname="e2e@fixture-mod"] [data-testid="installed-mod-remove"]').click()
		confirmRemoveAlert()
		cy.get('[data-testid="installed-mod-row"][data-testname="e2e@fixture-mod"]').should('not.exist')
	})

	it('uninstalls the mod from characters that still reference it, then removes it', () => {
		cy.visit('/tabs/character')
		cy.createTestCharacter()
		cy.addCharacterModuleReference(character.name, 'e2e@fixture-mod', '1.0.0')

		cy.visit('/tabs/settings/mods')
		cy.switchModStoreTab('installed')
		cy.get('[data-testid="installed-mod-row"][data-testname="e2e@fixture-mod"] [data-testid="installed-mod-remove"]').click()

		cy.get('[data-testid="remove-mod-alert"]').shadow().should('contain.text', character.name)
		cy.get('[data-testid="remove-mod-confirm"]').click()

		cy.get('[data-testid="installed-mod-row"][data-testname="e2e@fixture-mod"]').should('not.exist')
		cy.getStoredCharacter(character.name).should(stored => {
			expect(stored._modules).not.to.have.property('e2e@fixture-mod')
		})
	})
})
