#!/usr/bin/env node
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import prompts from 'prompts'
import { generateFiles, type Capability, type ScaffoldAnswers } from './generate.ts'

const ID_PATTERN = /^[a-z0-9-]+@[a-z0-9-]+$/
const GITHUB_PATTERN = /^[A-Za-z0-9-]+$/
const LANGUAGE_PATTERN = /^[a-z]{2}(-[A-Z]{2})?$/

async function main(): Promise<void> {
	const response = await prompts(
		[
			{
				type: 'text',
				name: 'id',
				message: 'Mod id (author@name, lowercase kebab-case)',
				validate: (value: string) => ID_PATTERN.test(value) || 'Must match author@name, e.g. "jsmith@my-mod"'
			},
			{
				type: 'text',
				name: 'displayName',
				message: 'Display name',
				validate: (value: string) => value.trim().length > 0 || 'Required'
			},
			{
				type: 'text',
				name: 'authorName',
				message: 'Your name',
				validate: (value: string) => value.trim().length > 0 || 'Required'
			},
			{
				type: 'text',
				name: 'authorGithub',
				message: 'Your GitHub handle (fate-mods CI verifies this against the PR author)',
				validate: (value: string) => GITHUB_PATTERN.test(value) || 'Must be a valid GitHub username'
			},
			{
				type: 'multiselect',
				name: 'capabilities',
				message: 'Capabilities (space to toggle, enter to confirm)',
				choices: [
					{ title: 'Sheet components (a character sheet section)', value: 'sheetComponents', selected: true },
					{ title: 'Dice (custom roll shapes/materials) — experimental', value: 'dice' },
					{ title: 'Theme (an app skin)', value: 'theme' },
					{ title: 'Translations (a localization pack)', value: 'translations' }
				],
				min: 1,
				instructions: false
			},
			{
				type: 'text',
				name: 'languages',
				message: 'Languages (comma-separated ISO codes)',
				initial: 'en',
				validate: (value: string) =>
					value
						.split(',')
						.map(s => s.trim())
						.every(s => LANGUAGE_PATTERN.test(s)) || 'Each language must look like "en" or "en-US"'
			}
		],
		{ onCancel: () => process.exit(1) }
	)

	const answers: ScaffoldAnswers = {
		id: response.id as string,
		displayName: response.displayName as string,
		authorName: response.authorName as string,
		authorGithub: response.authorGithub as string,
		capabilities: response.capabilities as Capability[],
		languages: (response.languages as string).split(',').map(s => s.trim())
	}

	const dirName = answers.id
	const targetDir = join(process.cwd(), dirName)
	if (existsSync(targetDir)) {
		console.error(`"${dirName}" already exists in the current directory.`)
		process.exit(1)
	}

	mkdirSync(targetDir, { recursive: true })
	generateFiles(targetDir, answers)

	console.log(`\nCreated ${dirName}/`)
	console.log(`\nNext steps:\n  cd ${dirName}\n  npm install\n  npm run dev\n`)
}

main().catch((e: unknown) => {
	console.error(e)
	process.exit(1)
})
