import type { Character as _Character, FateConstants as _FateConstants, FateShared as _FateShared } from '@fate-app/mod-types'

declare module '@fate-app/mod-types' {
	interface Character {
		skills?: {
			[key: string]: number
		}
	}
	interface FateConstants {
		MIN_SKILL_LEVEL?: number
		MAX_SKILL_LEVEL?: number
		SKILL_USAGE_ICON?: UsageIcons
	}
	interface FateShared {
		'sonder@core-skills'?: {
			skills: Map<string, Skill>
		}
	}
}

type UsageIcons = {
	overcome: string
	advantage: string
	attack: string
	defend: string
}

export type SkillUsage = {
	overcome: boolean
	advantage: boolean
	attack: boolean
	defend: boolean
}

export type Skill = {
	id: string
	name: string
	description: string
	usage: SkillUsage
}

export type CharacterSkills = {
	[level: number]: Skill[]
}
