#!/usr/bin/env ts-node
import type { FateModuleManifest } from '@/modules/utils/types'
import type { Translation } from '@/types'
import path from 'path'
import fs from 'fs'
import app from '../../package.json' assert { type: 'json' }

const modulesFolder = path.join(process.cwd(), 'src', 'modules')
const moduleId = process.argv[2]

if (!moduleId) {
	console.error('Module ID is required.')
	process.exit(1)
}

if (fs.existsSync(path.join(modulesFolder, moduleId))) {
	console.error(`Module already exists: ${moduleId}`)
	process.exit(1)
}

const languages = ['en']
const moduleRootFolder = path.join(modulesFolder, moduleId)

console.log(`Generating module: ${moduleId}`)
console.log(`Module root folder: ${moduleRootFolder}`)

function generateTypeExtensions() {
	console.log('Generating type extensions...')

	const content = `import type { Character as _Character, FateConstants as _FateConstants } from '@fate-app/mod-types'

declare module '@fate-app/mod-types' {
	interface Character {
		// Add your custom properties here
	}
	interface FateConstants {
		// Add your custom properties here
	}
}

// Export your custom types here
	`

	const typeExtensionsPath = path.join(moduleRootFolder, 'src', 'types.ts')
	fs.writeFileSync(typeExtensionsPath, content)
	console.log('Type extensions generated.')
}

function generateActions() {
	console.log('Generating actions...')

	const content = `import type { Character, FateContext } from '@/types'

export function onInstall(context: FateContext, character: Character): Promise<void> | void {}

export function onUninstall(context: FateContext, character: Character): Promise<void> | void {}

export function onReconfigure(context: FateContext, character: Character): Promise<void> | void {}
`

	const actionsPath = path.join(moduleRootFolder, 'src', 'actions.ts')
	fs.writeFileSync(actionsPath, content)
	console.log('Actions generated.')
}

function generateFolderStructure() {
	console.log('Generating folder structure...')
	const folderStructure = ['src/components', 'translations']

	folderStructure.forEach(folder => {
		const folderPath = path.join(moduleRootFolder, folder)
		console.log(`Creating folder: ${folderPath}`)
		fs.mkdirSync(folderPath, { recursive: true })
	})

	console.log('Folder structure generated.')
}

function generateComponents() {
	console.log('Generating components...')
	const componentContent = `<script setup lang="ts"> 
import { inject } from 'vue'
import type { Ref } from 'vue'
import type { Character, FateContext } from '@/types'

// Character is provided by default
const character = defineModel<Character>({
	required: true
})

// Context is provided by default
const context = inject<Ref<FateContext>>('context')!

</script>

<template>
	<div>
		<!-- Your component template here -->
	</div>
</template>
	`

	const componentPath = path.join(moduleRootFolder, 'src', 'components', 'Example.vue')
	fs.writeFileSync(componentPath, componentContent)
	console.log('Components generated.')

	const indexContent = `import Example from './Example.vue'
import type { FateModuleComponent } from '@/modules/utils/types'

export default [
	{
		id: 'example',
		component: Example,
		order: 1000 // Order in which the component will be displayed. See core components for reference.
	}
] as FateModuleComponent[]
	`
	const indexPath = path.join(moduleRootFolder, 'src', 'components', 'index.ts')
	fs.writeFileSync(indexPath, indexContent)
	console.log('Components index generated.')
}

function generateConstants() {
	console.log('Generating constants...')
	const content = `import type { FateConstants } from '@/types'

const constants: Pick<FateConstants, 'YOUR_CONSTANT_NAME'> = {
	YOUR_CONSTANT_NAME: 'Your constant value'
}

export default constants
	`
	const constantsPath = path.join(moduleRootFolder, 'src', 'constants.ts')
	fs.writeFileSync(constantsPath, content)
	console.log('Constants generated.')
}

function generateTemplates() {
	console.log('Generating templates...')
	const templateContent = `import type { FateTemplates } from '@/types'
	
export default {} as FateTemplates
`

	const templatePath = path.join(moduleRootFolder, 'src', 'templates.ts')
	fs.writeFileSync(templatePath, templateContent)
	console.log('Templates generated.')
}

function generateTranslationFile() {
	console.log('Generating translation file...')

	const translation: Translation = {
		name: 'Your module name',
		description: {
			full: 'Full description of the module (plain text)',
			short: 'Short description of the module (plain text, ~140 characters)'
		}
	}

	const translationPath = path.join(moduleRootFolder, 'translations', 'en.json')
	fs.writeFileSync(translationPath, JSON.stringify(translation, null, 2))

	console.log(`Translation file generated: ${translationPath}`)
}

function generateManifestJson() {
	console.log('Generating manifest.json...')
	const manifestJson: Partial<FateModuleManifest> = {
		appVersion: `^${app.version}`,
		author: {
			name: 'Unknown author',
			url: '',
			email: ''
		},
		dependencies: {},
		incompatibleWith: [],
		description: {
			full: 't.description.full',
			short: 't.description.short'
		},
		id: moduleId,
		languages,
		loadPriority: 1,
		tags: [],
		name: 't.name',
		version: '1.0.0',
		sdk: '^1.0.0',
		entry: 'bundle.mjs',
		capabilities: ['sheetComponents'],
		config: {
			groups: [],
			options: []
		}
	}

	const manifestJsonPath = path.join(moduleRootFolder, 'manifest.json')
	fs.writeFileSync(manifestJsonPath, JSON.stringify(manifestJson, null, 2))
	console.log(`Manifest file generated: ${manifestJsonPath}`)
}

function generateBundleFile() {
	console.log('Generating bundle file...')
	const bundleContent = `import { defineFateMod } from '@fate-app/mod-types'
import constants from './src/constants'
import templates from './src/templates'
import components from './src/components'
import { onInstall, onReconfigure, onUninstall } from './src/actions'

export default defineFateMod({
	constants,
	templates,
	components,
	onInstall,
	onReconfigure,
	onUninstall
})
	`

	const bundlePath = path.join(moduleRootFolder, 'bundle.ts')
	fs.writeFileSync(bundlePath, bundleContent)
	console.log('Bundle file generated.')
}

function generateIndexFile() {
	console.log('Generating index file...')
	// Don't forget to add this module to the BUILTIN_MODS list in src/mods/builtins.ts!
	const indexContent = `import manifest from './manifest.json'
import bundle from './bundle'
import { assembleMod } from '@/mods/assembleMod'

export default assembleMod(manifest, bundle)
	`

	const indexPath = path.join(moduleRootFolder, 'index.ts')
	fs.writeFileSync(indexPath, indexContent)
	console.log('Index file generated.')
}

function generateTranslationsFile() {
	console.log('Generating translations loader...')
	const content = `const files = import.meta.glob<Record<string, unknown>>('./translations/*.json', { eager: true, import: 'default' })

export default Object.fromEntries(Object.entries(files).map(([path, messages]) => [path.match(/([\\w-]+)\\.json$/)![1], messages]))
	`

	const translationsPath = path.join(moduleRootFolder, 'translations.ts')
	fs.writeFileSync(translationsPath, content)
	console.log('Translations loader generated.')
}

function main() {
	console.log('Starting module generation...')

	generateFolderStructure()
	generateManifestJson()
	generateTranslationFile()
	generateTranslationsFile()
	generateTypeExtensions()
	generateActions()
	generateComponents()
	generateConstants()
	generateTemplates()
	generateBundleFile()
	generateIndexFile()

	console.log('Module generation complete.')
}

main()
