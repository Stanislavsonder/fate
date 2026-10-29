import type { CharacterModules } from './character'
import type { FateModuleManifest } from './manifest'

export type ModulesUpdateInstruction = {
	install: CharacterModules
	reconfigure: CharacterModules
	uninstall: CharacterModules
}

export type ModuleResolutionIssue = {
	type: 'missing-dependency' | 'version-mismatch' | 'app-version-mismatch' | 'incompatible-modules' | 'dependency-cycle' | 'mod-not-installed'
	moduleId: string
	moduleName: string
	details: {
		// For missing-dependency
		dependencyId?: string
		// For version-mismatch
		requiredVersion?: string
		actualVersion?: string
		dependencyName?: string
		// For app-version-mismatch
		appVersion?: string
		requiredAppVersion?: string
		// For incompatible-modules
		incompatibleWith?: Array<{ id: string; name: string }>
		// For dependency-cycle
		cycleModules?: Array<{ id: string; name: string }>
	}
	suggestedActions: Array<{
		type: 'enable' | 'disable' | 'update' | 'choose-one' | 'install'
		description: string
		targetModules: string[] // module IDs
	}>
}

export type ModuleResolutionResult = {
	resolvedModules: FateModuleManifest[]
	issues: ModuleResolutionIssue[]
	disabledModules: FateModuleManifest[]
}
