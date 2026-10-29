// ***********************************************************
// This example support/e2e.ts is processed and
// loaded automatically before your test files.
//
// This is a great place to put global configuration and
// behavior that modifies Cypress.
//
// You can change the location of this file or turn off
// automatically serving support files with the
// 'supportFile' configuration option.
//
// You can read more here:
// https://on.cypress.io/configuration
// ***********************************************************

// Import commands.js using ES2015 syntax:
import './commands'
import 'cypress-file-upload'

// Ionic's MD refresher occasionally throws this internally during its own
// gesture setup right after a fast cy.reload() — intermittent, benign, and
// unrelated to anything under test (nothing in this app registers that
// listener itself). Letting it fail tests would make otherwise-passing specs
// flaky for a reason outside the app's or the spec's control.
Cypress.on('uncaught:exception', err => {
	if (err.message.includes('__zone_symbol__addEventListener')) {
		return false
	}
})

// Alternatively you can use CommonJS syntax:
// require('./commands')
