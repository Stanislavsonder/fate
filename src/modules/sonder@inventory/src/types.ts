import type { Character as _Character, FateConstants as _FateConstants, FateTemplates as _FateTemplates } from '@fate-app/mod-types'

declare module '@fate-app/mod-types' {
	interface Character {
		inventory?: Item[]
	}
	interface FateConstants {
		COLORS_OPTIONS?: string[]
		MAX_ITEM_QUANTITY?: number
	}
	interface FateTemplates {
		item?: Item
	}
}

export type Item = {
	name: string
	description: string
	quantity: number
	icon: string
	iconColor: string | undefined
}
