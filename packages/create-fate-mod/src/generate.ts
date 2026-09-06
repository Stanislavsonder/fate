import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Tracks the FateSDK ABI (src/mods/sdk.ts's SDK_VERSION in the app repo) —
 * same version-discipline rule as @fate-core/mod-types/@fate-core/mod-build's
 * own READMEs. Bump this in the same PR that bumps SDK_VERSION.
 */
const CURRENT_SDK_VERSION = '1.1.0'

export type Capability = 'sheetComponents' | 'dice' | 'theme' | 'translations'

export interface ScaffoldAnswers {
	id: string
	displayName: string
	authorName: string
	authorGithub: string
	capabilities: Capability[]
	languages: string[]
}

export function generateFiles(root: string, answers: ScaffoldAnswers): void {
	const hasSheet = answers.capabilities.includes('sheetComponents')

	mkdirSync(join(root, 'translations'), { recursive: true })
	if (hasSheet) {
		mkdirSync(join(root, 'src', 'components'), { recursive: true })
	}

	writeFileSync(join(root, 'package.json'), packageJson(answers))
	writeFileSync(join(root, 'manifest.json'), manifestJson(answers))
	writeFileSync(join(root, 'bundle.ts'), bundleTs(answers))
	writeFileSync(join(root, 'vite.config.ts'), `import { defineModConfig } from '@fate-core/mod-build'\n\nexport default defineModConfig()\n`)
	writeFileSync(join(root, 'tsconfig.json'), tsconfigJson())
	writeFileSync(join(root, '.gitignore'), 'node_modules\ndist\n')
	writeFileSync(join(root, 'README.md'), readmeMd(answers))
	writeFileSync(join(root, 'CHANGELOG.md'), '# Changelog\n\n## 1.0.0\n\nInitial release.\n')
	writeFileSync(join(root, 'LICENSE'), licenseMit(answers.authorName))

	for (const language of answers.languages) {
		writeFileSync(join(root, 'translations', `${language}.json`), translationJson(answers))
	}

	if (hasSheet) {
		writeFileSync(join(root, 'src', 'components', 'ExampleSection.vue'), exampleSectionVue())
		writeFileSync(join(root, 'src', 'components', 'index.ts'), componentsIndexTs())
	}
}

function packageJson(answers: ScaffoldAnswers): string {
	const name = answers.id.split('@')[1] ?? answers.id
	const json = {
		name,
		private: true,
		type: 'module',
		scripts: {
			dev: 'fate-mod-build dev',
			build: 'fate-mod-build build'
		},
		dependencies: {
			'@fate-core/mod-types': `^${CURRENT_SDK_VERSION}`
		},
		devDependencies: {
			'@fate-core/mod-build': `^${CURRENT_SDK_VERSION}`,
			'@ionic/vue': '8.8.15',
			'@vitejs/plugin-vue': '6.0.8',
			ionicons: '8.0.13',
			vite: '8.1.5',
			vue: '3.5.40',
			'vue-i18n': '11.4.7'
		}
	}
	return JSON.stringify(json, null, '\t') + '\n'
}

function manifestJson(answers: ScaffoldAnswers): string {
	const json = {
		id: answers.id,
		version: '1.0.0',
		name: 't.name',
		author: {
			name: answers.authorName,
			github: answers.authorGithub
		},
		description: {
			short: 't.description.short',
			full: 't.description.full'
		},
		languages: answers.languages,
		tags: [],
		loadPriority: 100,
		sdk: `^${CURRENT_SDK_VERSION}`,
		entry: 'bundle.mjs',
		capabilities: answers.capabilities,
		config: {
			groups: [],
			options: []
		}
	}
	return JSON.stringify(json, null, '\t') + '\n'
}

function bundleTs(answers: ScaffoldAnswers): string {
	const lines: string[] = ["import { defineFateMod } from '@fate-core/mod-types'"]
	if (answers.capabilities.includes('sheetComponents')) {
		lines.push("import components from './src/components'")
	}
	lines.push('', 'export default defineFateMod({')
	if (answers.capabilities.includes('sheetComponents')) {
		lines.push('\tcomponents,')
	}
	lines.push('\tonInstall() {},', '\tonUninstall() {},', '\tonReconfigure() {},')
	if (answers.capabilities.includes('dice')) {
		lines.push('\tdice: {', '\t\tshapes: [], // add your DiceConstructor exports here', '\t\tmaterials: []', '\t},')
	}
	if (answers.capabilities.includes('theme')) {
		lines.push('\ttheme: {', '\t\tcss: `:root {\n\t\t\t/* --ion-color-primary: #your-color; */\n\t\t}`', '\t},')
	}
	lines.push('})', '')
	return lines.join('\n')
}

function tsconfigJson(): string {
	const json = {
		compilerOptions: {
			// mod-build's own relative imports use explicit .ts extensions (needed
			// for Node's native ESM loader when Vite loads a *consuming* config
			// file) — any project depending on it needs this too.
			allowImportingTsExtensions: true,
			esModuleInterop: true,
			isolatedModules: true,
			jsx: 'preserve',
			lib: ['ESNext', 'DOM'],
			module: 'ESNext',
			moduleResolution: 'bundler',
			noEmit: true,
			resolveJsonModule: true,
			skipLibCheck: true,
			strict: true,
			target: 'ESNext',
			types: ['vite/client'],
			useDefineForClassFields: true
		},
		exclude: ['dist'],
		include: ['**/*.ts', '**/*.vue']
	}
	return JSON.stringify(json, null, '\t') + '\n'
}

function translationJson(answers: ScaffoldAnswers): string {
	const json = {
		name: answers.displayName,
		description: {
			full: 'Full description of the mod (plain text).',
			short: 'Short description of the mod (plain text, ~140 characters).'
		}
	}
	return JSON.stringify(json, null, '\t') + '\n'
}

function exampleSectionVue(): string {
	return `<script setup lang="ts">
import { inject } from 'vue'
import type { Ref } from 'vue'
import type { Character, FateContext } from '@fate-core/mod-types'

const character = defineModel<Character>({ required: true })
const context = inject<Ref<FateContext>>('context')!
</script>

<template>
	<div>
		<!-- Your section's template here -->
	</div>
</template>
`
}

function componentsIndexTs(): string {
	return `import ExampleSection from './ExampleSection.vue'
import type { FateModuleComponent } from '@fate-core/mod-types'

export default [
	{
		id: 'example-section',
		component: ExampleSection,
		order: 1000
	}
] as FateModuleComponent[]
`
}

function readmeMd(answers: ScaffoldAnswers): string {
	return `# ${answers.displayName}

An Assistant for Fate mod (\`${answers.id}\`), scaffolded by \`create-fate-mod\`.

## Developing

\`\`\`
npm install
npm run dev
\`\`\`

Then, in the app: Settings → Developer Mode → enable it → connect to
\`http://localhost:5199\`. Changes to this project live-reload in the app.

## Publishing

See [\`fate-core-mods\`](https://github.com/Stanislavsonder/fate-core-mods)'s
\`SUBMITTING.md\` for how to submit this mod to the public registry once it's
ready. In short: \`npm run build\`, then open a pull request against that repo
adding this folder under \`mods/${answers.id}/\`.

## API reference

See [\`docs/MOD_API.md\`](https://github.com/Stanislavsonder/fate/blob/main/docs/MOD_API.md)
in the app repo for the full contract this mod is built against (manifest
shape, \`window.FateSDK\`, capabilities, lifecycle hooks).
`
}

function licenseMit(authorName: string): string {
	const year = new Date().getFullYear()
	return `MIT License

Copyright (c) ${year} ${authorName}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`
}
