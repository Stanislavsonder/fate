import { vi } from 'vitest'
import 'fake-indexeddb/auto'

// Mock i18n
vi.mock('@/i18n', () => ({
	default: {
		global: {
			t: (key: string, params?: Record<string, unknown>) => {
				if (params) {
					return `${key}: ${JSON.stringify(params)}`
				}
				return key
			}
		}
	}
}))

// Mock package.json version
vi.mock('../package.json', () => ({
	version: '1.0.0'
}))
