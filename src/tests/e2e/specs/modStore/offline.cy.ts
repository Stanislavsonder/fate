describe('Mod Store - Offline / cached behavior', () => {
	beforeEach(() => {
		cy.removeAllCharacters()
		cy.visitModStore('registry.v1.json')
		cy.interceptModFiles('e2e@fixture-mod', '1.0.0')

		cy.get('[data-testid="mod-store-entry"][data-testname="e2e@fixture-mod"]').click()
		cy.get('[data-testid="mod-store-install-button"]').click()
		cy.getToast().should('contain.text', '"E2E Fixture Mod" installed')

		cy.closeModStoreModal()
		cy.switchModStoreTab('installed')
		cy.get('[data-testid="installed-mod-row"][data-testname="e2e@fixture-mod"]').should('exist')
	})

	it('keeps the Installed tab working (pure IndexedDB, no network) after the registry becomes unreachable', () => {
		cy.intercept('GET', '**/registry.json', { forceNetworkError: true })
		cy.reload()

		cy.switchModStoreTab('installed')
		cy.get('[data-testid="installed-mod-row"][data-testname="e2e@fixture-mod"]').should('exist').and('contain.text', 'v1.0.0')
	})

	it('shows the stale-cache banner with the last-known entries when the index is unreachable and the cache is old', () => {
		cy.intercept('GET', '**/registry.json', { forceNetworkError: true })
		cy.fixture('mods/registry.v1.json').then(index => {
			cy.seedRegistryCache(index, Date.now() - 25 * 60 * 60 * 1000)
		})
		cy.reload()

		cy.switchModStoreTab('browse')
		cy.contains('Showing cached results - pull to refresh').should('exist')
		cy.get('[data-testid="mod-store-entry"][data-testname="e2e@fixture-mod"]').should('exist')
	})
})
