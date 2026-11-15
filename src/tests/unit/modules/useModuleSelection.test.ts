import { describe, it, expect, vi } from 'vitest'
import type { FateModuleManifest } from '@/modules/utils/types'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

const { useModuleSelection } = await import('@/composables/useModuleSelection')

const mod = (id: string, version: string) => ({ id, name: id, version }) as FateModuleManifest

describe('useModuleSelection.getConfigs', () => {
	// Regression: saving the configuration stamped every module with its latest version,
	// so pending mod patches were skipped and the new code ran on old-format data.
	it('keeps the character version of modules it already has and uses the latest for new ones', () => {
		const modules = new Map([
			['a@installed', mod('a@installed', '2.0.0')],
			['b@new', mod('b@new', '1.5.0')]
		])
		const { getConfigs, toggleModule } = useModuleSelection(modules, { 'a@installed': { version: '1.0.0', config: {} } })

		toggleModule('b@new')

		const configs = getConfigs()
		expect(configs['a@installed'].version).toBe('1.0.0')
		expect(configs['b@new'].version).toBe('1.5.0')
	})
})
