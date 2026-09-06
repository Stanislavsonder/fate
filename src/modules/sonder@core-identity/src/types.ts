import type { Character as _Character, FateConstants as _FateConstants } from '@fate-app/mod-types'

declare module '@fate-app/mod-types' {
	interface Character {
		race?: string
		description?: string
	}
	interface FateConstants {
		MAX_AVATAR_FILE_SIZE?: number
	}
}
