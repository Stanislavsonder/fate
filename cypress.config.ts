import { defineConfig } from 'cypress'

export default defineConfig({
	e2e: {
		supportFile: 'src/tests/e2e/support/e2e.{js,jsx,ts,tsx}',
		specPattern: ['src/tests/e2e/specs/**/*.cy.{js,jsx,ts,tsx}', 'src/modules/**/tests/e2e/specs/**/*.cy.{js,jsx,ts,tsx}'],
		videosFolder: 'src/tests/e2e/videos',
		fixturesFolder: 'src/tests/e2e/fixtures',
		screenshotsFolder: 'src/tests/e2e/screenshots',
		baseUrl: 'http://localhost:5173',
		viewportWidth: 375,
		viewportHeight: 667,
		video: true,
		includeShadowDom: true,
		setupNodeEvents(_on, _config) {
			// implement node event listeners here
		}
	}
})
