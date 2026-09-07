describe('Mod Store - Update', () => {
	beforeEach(() => {
		cy.removeAllCharacters()
		cy.visitModStore('registry.v1.json')
		cy.interceptModFiles('e2e@fixture-mod', '1.0.0')

		cy.get('[data-testid="mod-store-entry"][data-testname="e2e@fixture-mod"]').click()
		cy.get('[data-testid="mod-store-install-button"]').click()
		cy.getToast().should('contain.text', '"E2E Fixture Mod" installed')
		// The already-open detail modal's `entry` prop is a snapshot taken when the
		// card was clicked — refreshing the registry index doesn't reactively update
		// it. Closing it, then switching tabs away and back, unmounts/remounts the
		// Browse tab (it's behind a v-if, not v-show), forcing a fresh read of
		// whatever's in the cache next time it's opened.
		cy.closeModStoreModal()
		cy.switchModStoreTab('installed')
		cy.get('[data-testid="installed-mod-row"][data-testname="e2e@fixture-mod"]').should('contain.text', 'v1.0.0')
		cy.switchModStoreTab('browse')
	})

	it('updates from the detail modal once a newer compatible version is published', () => {
		cy.interceptRegistry('registry.v2-update.json')
		cy.interceptModFiles('e2e@fixture-mod', '1.0.1')
		cy.triggerModStoreRefresh()

		cy.switchModStoreTab('installed')
		cy.switchModStoreTab('browse')

		cy.get('[data-testid="mod-store-entry"][data-testname="e2e@fixture-mod"]').click()
		cy.get('[data-testid="mod-store-update-button"]').should('contain.text', 'Update').and('contain.text', '1.0.1')
		cy.get('[data-testid="mod-store-update-button"]').click()

		cy.getToast().should('contain.text', '"E2E Fixture Mod" updated')

		cy.closeModStoreModal()
		cy.switchModStoreTab('installed')
		cy.get('[data-testid="installed-mod-row"][data-testname="e2e@fixture-mod"]').should('contain.text', 'v1.0.1')
	})

	it("updates from the Installed tab's own Update button", () => {
		cy.interceptRegistry('registry.v2-update.json')
		cy.interceptModFiles('e2e@fixture-mod', '1.0.1')
		cy.triggerModStoreRefresh()

		cy.switchModStoreTab('installed')
		cy.get('[data-testid="installed-mod-row"][data-testname="e2e@fixture-mod"] [data-testid="installed-mod-update"]').click()

		cy.getToast().should('contain.text', '"Fixture Mod" updated')
		cy.get('[data-testid="installed-mod-row"][data-testname="e2e@fixture-mod"]').should('contain.text', 'v1.0.1')
	})
})
