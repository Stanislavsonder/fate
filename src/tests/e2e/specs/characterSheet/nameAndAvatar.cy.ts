import character from '@/tests/e2e/fixtures/character.json'

describe('Character name and avatar (core, module-independent)', () => {
	beforeEach(() => {
		cy.acceptPrivacyPolicy()
		cy.visit('/tabs/character')
		cy.createTestCharacter()
	})

	it('Change character name', () => {
		const newName = 'New name'

		// Change name
		cy.get('[data-testid="character-name-field"]').type('{selectall}{backspace}')
		cy.get('[data-testid="character-name-field"]').type(newName)

		// Validate
		cy.get('[data-testid="character-name-field"]').contains(newName).should('exist')

		// Change back
		cy.get('[data-testid="character-name-field"]').type('{selectall}{backspace}')
		cy.get('[data-testid="character-name-field"]').type(character.name)
		cy.get('[data-testid="character-name-field"]').contains(character.name).should('exist')
	})

	it('Change character image', () => {
		// Upload image
		cy.get('[data-testid="character-image-upload-button"]').attachFile('avatar.jpg')
		cy.get('[data-testid="character-image"]').should('have.attr', 'src').and('include', 'data:image/jpeg;base64')

		// Remove image via the tap-to-open action sheet
		cy.get('[data-testid="character-image-button"]').click()
		cy.get('.avatar-remove-option').click()
		// with no avatar the image is replaced by the full-square upload target
		cy.get('[data-testid="character-image"]').should('not.exist')
		cy.get('[data-testid="character-image-placeholder"]').should('exist')
	})
})
