import SonderCoreIdentity from '@/modules/sonder@core-identity'
import SonderCoreIdentityTranslations from '@/modules/sonder@core-identity/translations'
import SonderCoreAspects from '@/modules/sonder@core-aspects'
import SonderCoreAspectsTranslations from '@/modules/sonder@core-aspects/translations'
import SonderCoreSkills from '@/modules/sonder@core-skills'
import SonderCoreSkillsTranslations from '@/modules/sonder@core-skills/translations'
import SonderCoreStunts from '@/modules/sonder@core-stunts'
import SonderCoreStuntsTranslations from '@/modules/sonder@core-stunts/translations'
import SonderCoreStress from '@/modules/sonder@core-stress'
import SonderCoreStressTranslations from '@/modules/sonder@core-stress/translations'
import SonderCoreConsequences from '@/modules/sonder@core-consequences'
import SonderCoreConsequencesTranslations from '@/modules/sonder@core-consequences/translations'
import SonderCoreTokens from '@/modules/sonder@core-tokens'
import SonderCoreTokensTranslations from '@/modules/sonder@core-tokens/translations'
import SonderNotebook from '@/modules/sonder@notebook'
import SonderNotebookTranslations from '@/modules/sonder@notebook/translations'
import SonderInventory from '@/modules/sonder@inventory'
import SonderInventoryTranslations from '@/modules/sonder@inventory/translations'
import SonderThemePink from '@/modules/sonder@theme-pink'
import { ModRegistry } from '@/mods/modRegistry'
import { registerModTranslations } from '@/mods/registerModTranslations'
import type { FateModuleManifest } from '@fate-app/mod-types'

interface BuiltinMod {
	manifest: FateModuleManifest
	translations?: Record<string, Record<string, unknown>>
}

// prettier-ignore
const BUILTIN_MODS: BuiltinMod[] = [
	{ manifest: SonderCoreIdentity, translations: SonderCoreIdentityTranslations },
	{ manifest: SonderCoreAspects, translations: SonderCoreAspectsTranslations },
	{ manifest: SonderCoreSkills, translations: SonderCoreSkillsTranslations },
	{ manifest: SonderCoreStunts, translations: SonderCoreStuntsTranslations },
	{ manifest: SonderCoreStress, translations: SonderCoreStressTranslations },
	{ manifest: SonderCoreConsequences, translations: SonderCoreConsequencesTranslations },
	{ manifest: SonderCoreTokens, translations: SonderCoreTokensTranslations },
	{ manifest: SonderNotebook, translations: SonderNotebookTranslations },
	{ manifest: SonderInventory, translations: SonderInventoryTranslations },
	{ manifest: SonderThemePink },
]

/**
 * Registers every built-in mod EXCEPT the dice mods into ModRegistry and
 * merges their translations. Called once from main.ts, before app.mount().
 * Phase 2's initMods() will call this first, then load external mods on top
 * — see planning/modules-2-0/phase-1-builtins-migration.md.
 *
 * The built-in Fudge dice mod is deliberately NOT here: its Three.js/cannon-es
 * code is only loaded when the lazy-routed Roll Dice page is visited. Importing
 * it from this eagerly-loaded file would pull that ~300KB into every app boot.
 * It registers itself instead, from
 * src/dice/registerBuiltinDice.ts, imported only by
 * src/dice/composables/useDiceScene.ts — see that file's comment.
 */
export function registerBuiltinMods(): void {
	for (const { manifest, translations } of BUILTIN_MODS) {
		ModRegistry.register({ manifest, source: 'builtin', status: 'loaded' })
		if (translations) {
			registerModTranslations(manifest.id, translations)
		}
	}
}
