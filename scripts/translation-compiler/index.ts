import fs from 'fs'
import path from 'path'
import type { Translation } from '@/types'

// Modules 2.0 (Phase 1): this compiler only bakes CORE app strings into
// languages.json at build time. Each built-in/external mod ships its own
// translations/<lang>.json and merges them into i18n at runtime via
// src/mods/registerModTranslations.ts (see src/mods/builtins.ts) — see
// planning/modules-2-0/phase-1-builtins-migration.md Step 2.
const coreLangDir = path.join(process.cwd(), 'src', 'i18n', 'translations')
const outputLocation = path.join(process.cwd(), 'src', 'i18n')
const outputFilename = 'languages.json'

function loadJson(filePath: string) {
	return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
}

function compileTranslations() {
	if (!fs.existsSync(outputLocation)) {
		console.error('Output location does not exist: ', outputLocation)
		process.exit(1)
	}

	const coreTranslation: Record<string, Translation> = {}

	for (const file of fs.readdirSync(coreLangDir)) {
		const langKey = path.parse(file).name
		const filePath = path.join(coreLangDir, file)
		coreTranslation[langKey] = loadJson(filePath)
	}

	const outputFilePath = path.join(outputLocation, outputFilename)
	fs.writeFileSync(outputFilePath, JSON.stringify(coreTranslation))
}

compileTranslations()
