import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Character, FateContext, FatePatch } from '@/types'
import { version as appVersion } from '../../../../package.json'
import i18n from '@/i18n'

const mocks = vi.hoisted(() => ({
	patches: [] as FatePatch[],
	showErrorToast: vi.fn(),
	showSuccessToast: vi.fn(),
	showToast: vi.fn()
}))

vi.mock('@/patches', () => ({ default: mocks.patches }))

vi.mock('@/utils/helpers/toast', () => ({
	showErrorToast: mocks.showErrorToast,
	showSuccessToast: mocks.showSuccessToast,
	showToast: mocks.showToast
}))

const { updateApplication } = await import('@/utils/helpers/updateApplication')

const context = {} as FateContext
const createCharacter = (version: string) => ({ _version: version, _modules: {} }) as unknown as Character

describe('updateApplication', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mocks.patches.length = 0
	})

	// Regression: the 2.0.0 patch has no note, which used to show an empty success toast.
	it('shows the generic update message when no applied patch has a note', async () => {
		const action = vi.fn()
		mocks.patches.push({ version: appVersion, action })
		const character = createCharacter('0.0.1')

		expect(await updateApplication(context, character)).toBe(true)

		expect(action).toHaveBeenCalledWith(context, character)
		expect(mocks.showToast).not.toHaveBeenCalled()
		expect(mocks.showSuccessToast).toHaveBeenCalledWith('character.updated', { from: '0.0.1', to: appVersion })
		expect(character._version).toBe(appVersion)
	})

	it('translates each patch note separately', async () => {
		mocks.patches.push({ version: '0.0.2', action: vi.fn(), note: 'character.updated' }, { version: appVersion, action: vi.fn(), note: 'errors.unexpected' })

		await updateApplication(context, createCharacter('0.0.1'))

		const { t } = i18n.global
		expect(mocks.showToast).toHaveBeenCalledWith(`${t('character.updated')}\n${t('errors.unexpected')}`, 'success')
		expect(mocks.showSuccessToast).not.toHaveBeenCalled()
	})

	it('does nothing for a character already on the current version', async () => {
		mocks.patches.push({ version: appVersion, action: vi.fn() })

		expect(await updateApplication(context, createCharacter(appVersion))).toBe(true)

		expect(mocks.showToast).not.toHaveBeenCalled()
		expect(mocks.showSuccessToast).not.toHaveBeenCalled()
	})

	it('never shows an empty error toast for an incompatible patch without a note', async () => {
		mocks.patches.push({ version: appVersion, action: vi.fn(), incompatible: true })

		expect(await updateApplication(context, createCharacter('0.0.1'))).toBe(false)

		expect(mocks.showErrorToast).toHaveBeenCalledWith('errors.unexpected')
	})
})
