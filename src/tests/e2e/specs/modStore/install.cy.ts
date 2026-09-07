describe('Mod Store - Install', () => {
	beforeEach(() => {
		cy.removeAllCharacters()
		cy.visitModStore('registry.v1.json')
		cy.interceptModFiles('e2e@fixture-mod', '1.0.0')
	})

	it('installs a mod when every downloaded file matches the registry index hash', () => {
		cy.get('[data-testid="mod-store-entry"][data-testname="e2e@fixture-mod"]').click()
		cy.get('[data-testid="mod-store-install-button"]').click()

		cy.getToast().should('contain.text', '"E2E Fixture Mod" installed')

		cy.closeModStoreModal()
		cy.get('[data-testid="mod-store-entry"][data-testname="e2e@fixture-mod"] [data-testid="mod-store-installed-badge"]').should('contain.text', 'Installed')
		cy.switchModStoreTab('installed')
		cy.get('[data-testid="installed-mod-row"][data-testname="e2e@fixture-mod"]').should('exist').and('contain.text', 'v1.0.0')
	})

	it('installs a selected older hash-pinned version', () => {
		cy.visitModStore('registry.v2-update.json')
		cy.interceptModFiles('e2e@fixture-mod', '1.0.0')

		cy.get('[data-testid="mod-store-entry"][data-testname="e2e@fixture-mod"]').click()
		cy.get('[data-testid="mod-store-version-button"]').click()
		cy.get('[data-testid="mod-store-version-1.0.0"]').click()
		cy.get('[data-testid="mod-store-install-button"]').should('contain.text', 'v1.0.0').click()

		cy.getToast().should('contain.text', '"E2E Fixture Mod" installed')

		cy.closeModStoreModal()
		cy.switchModStoreTab('installed')
		cy.get('[data-testid="installed-mod-row"][data-testname="e2e@fixture-mod"]').should('exist').and('contain.text', 'v1.0.0')
	})

	it('downgrades an installed mod through the version selector', () => {
		cy.visitModStore('registry.v2-update.json')
		cy.interceptModFiles('e2e@fixture-mod', '1.0.1')
		cy.interceptModFiles('e2e@fixture-mod', '1.0.0')

		cy.get('[data-testid="mod-store-entry"][data-testname="e2e@fixture-mod"]').click()
		cy.get('[data-testid="mod-store-install-button"]').click()
		cy.getToast().should('contain.text', '"E2E Fixture Mod" installed')

		cy.get('[data-testid="mod-store-version-button"]').click()
		cy.get('[data-testid="mod-store-version-1.0.0"]').click()
		cy.get('[data-testid="mod-store-update-button"]').should('contain.text', 'Downgrade').click()

		cy.closeModStoreModal()
		cy.switchModStoreTab('installed')
		cy.get('[data-testid="installed-mod-row"][data-testname="e2e@fixture-mod"]').should('contain.text', 'v1.0.0')
	})

	it('refuses to install when the downloaded bundle does not match the registry index hash (tampering)', () => {
		// Overrides just the bundle.mjs intercept above with content that doesn't match
		// registry.v1.json's pinned hash for it — indistinguishable, from the app's
		// point of view, from a file corrupted/tampered with in transit.
		cy.intercept('GET', '**/mods/e2e@fixture-mod/1.0.0/bundle.mjs', '// tampered\nexport default { onInstall() {}, onUninstall() {}, onReconfigure() {} }\n')

		cy.get('[data-testid="mod-store-entry"][data-testname="e2e@fixture-mod"]').click()
		cy.get('[data-testid="mod-store-install-button"]').click()

		cy.getToast().should('contain.text', 'refusing to install (possible tampering)')

		cy.closeModStoreModal()
		cy.switchModStoreTab('installed')
		cy.get('[data-testid="installed-mod-row"][data-testname="e2e@fixture-mod"]').should('not.exist')
	})
})
