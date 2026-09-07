describe('Mod Store - Blocklist', () => {
	beforeEach(() => {
		cy.removeAllCharacters()
		cy.visitModStore('registry.v1.json')
		cy.interceptModFiles('e2e@fixture-mod', '1.0.0')

		cy.get('[data-testid="mod-store-entry"][data-testname="e2e@fixture-mod"]').click()
		cy.get('[data-testid="mod-store-install-button"]').click()
		cy.getToast().should('contain.text', '"E2E Fixture Mod" installed')
	})

	it('auto-disables an installed mod whose version is blocklisted, then clears the explanation once unblocked', () => {
		cy.interceptRegistry('registry.v3-blocklisted.json')
		cy.triggerModStoreRefresh()

		cy.getToast().should('contain.text', '"e2e@fixture-mod" was disabled').and('contain.text', 'flagged as unsafe')

		cy.closeModStoreModal()
		cy.switchModStoreTab('installed')
		cy.get('[data-testid="installed-mod-row"][data-testname="e2e@fixture-mod"]').should('contain.text', 'flagged as unsafe')

		// Per applyBlocklist's actual behavior: un-blocking only clears the blocked
		// flag/explanation, it does NOT re-enable the mod — that stays a manual
		// action (the Enable button), so this deliberately does not assert the mod
		// becomes enabled again.
		//
		// Re-intercept BEFORE switching tabs, not after: switching to Browse
		// remounts it, and its own onMounted forces a refresh already (see
		// ModStoreBrowseTab.vue's load()) — intercepting first means that
		// mount-triggered fetch (not a second, separately-dispatched one) is the
		// one that lands, avoiding a race over which fetch cy.wait would consume.
		cy.interceptRegistry('registry.v4-unblocked.json')
		cy.switchModStoreTab('browse')
		cy.wait('@registryIndex')

		cy.switchModStoreTab('installed')
		cy.get('[data-testid="installed-mod-row"][data-testname="e2e@fixture-mod"]').should('not.contain.text', 'flagged as unsafe')
	})
})
