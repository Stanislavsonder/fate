describe('Mod Store - Browse tab', () => {
	beforeEach(() => {
		cy.removeAllCharacters()
		cy.visitModStore('registry.v1.json')
	})

	it('renders the compatible fixture mod by default, hides the incompatible one', () => {
		cy.get('[data-testid="mod-store-entry"][data-testname="e2e@fixture-mod"]')
			.should('exist')
			.and('contain.text', 'E2E Fixture Mod')
			.and('contain.text', 'v1.0.0')
		cy.get('[data-testid="mod-store-entry"][data-testname="e2e@fixture-mod"] [data-testid="mod-store-installed-badge"]').should('not.exist')
		cy.get('[data-testid="mod-store-entry"][data-testname="e2e@incompatible-mod"]').should('not.exist')
	})

	it('reveals the incompatible mod (with its danger badge) when "compatible only" is turned off', () => {
		cy.get('[data-testid="mod-store-compatible-toggle"]').click()
		cy.get('[data-testid="mod-store-entry"][data-testname="e2e@incompatible-mod"]').should('exist').and('contain.text', 'Not compatible with this app version')
	})

	it('filters by search query (id, name, tag)', () => {
		cy.get('[data-testid="mod-store-search"] input').type('nonexistent-query')
		cy.contains('No mods found').should('exist')

		cy.get('[data-testid="mod-store-search"] input').clear().type('fixture')
		cy.get('[data-testid="mod-store-entry"][data-testname="e2e@fixture-mod"]').should('exist')
	})
})
