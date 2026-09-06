#!/usr/bin/env node

import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'

const WHATSNEW_LIMIT = 500
const root = process.cwd()
const artifactsDir = path.join(root, 'release-artifacts')
const whatsnewDir = path.join(artifactsDir, 'whatsnew')

type NoteGroup = 'features' | 'fixes' | 'other'

const GROUP_HEADINGS: Record<NoteGroup, string> = {
	features: 'Features',
	fixes: 'Fixes',
	other: 'Other'
}

const CONVENTIONAL = /^(feat|fix|perf|refactor|docs|chore|build|ci|test|style|revert)(\([^)]+\))?(!)?:\s*(.+)$/i

function git(command: string): string {
	return execSync(command, { encoding: 'utf-8', cwd: root }).trim()
}

function readVersion(): string {
	const packageJsonPath = path.join(root, 'package.json')
	const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8')) as { version: string }
	if (!packageJson.version) {
		console.error('package.json is missing a version field')
		process.exit(1)
	}
	return packageJson.version
}

function lastTag(): string | null {
	try {
		return git('git describe --tags --abbrev=0 --match "v*"')
	} catch {
		return null
	}
}

function groupOf(type: string): NoteGroup | null {
	switch (type.toLowerCase()) {
		case 'feat':
			return 'features'
		case 'fix':
			return 'fixes'
		case 'perf':
		case 'refactor':
			return 'other'
		default:
			return null
	}
}

function collectNotes(range: string): Record<NoteGroup, string[]> {
	const notes: Record<NoteGroup, string[]> = { features: [], fixes: [], other: [] }
	const log = git(`git log ${range} --pretty=%s`)
	if (!log) {
		return notes
	}

	for (const subject of log.split('\n')) {
		const match = subject.match(CONVENTIONAL)
		if (!match) {
			continue
		}
		const group = groupOf(match[1])
		if (!group) {
			continue
		}
		notes[group].push(match[4].trim())
	}

	return notes
}

function renderMarkdown(version: string, date: string, notes: Record<NoteGroup, string[]>): string {
	const sections: string[] = [`## ${version} (${date})`, '']
	let hasContent = false

	for (const group of ['features', 'fixes', 'other'] as NoteGroup[]) {
		if (notes[group].length === 0) {
			continue
		}
		hasContent = true
		sections.push(`### ${GROUP_HEADINGS[group]}`, '')
		for (const item of notes[group]) {
			sections.push(`- ${item}`)
		}
		sections.push('')
	}

	if (!hasContent) {
		sections.push('No user-facing changes.', '')
	}

	return sections.join('\n')
}

function renderWhatsNew(notes: Record<NoteGroup, string[]>): string {
	const bullets: string[] = []
	for (const group of ['features', 'fixes', 'other'] as NoteGroup[]) {
		for (const item of notes[group]) {
			bullets.push(`- ${item}`)
		}
	}

	if (bullets.length === 0) {
		return 'Bug fixes and improvements.'
	}

	const kept: string[] = []
	for (const line of bullets) {
		const candidate = [...kept, line].join('\n')
		if (candidate.length > WHATSNEW_LIMIT) {
			break
		}
		kept.push(line)
	}

	if (kept.length === 0) {
		return bullets[0].slice(0, WHATSNEW_LIMIT)
	}

	return kept.join('\n')
}

const version = readVersion()
const date = new Date().toISOString().slice(0, 10)
const tag = lastTag()
const range = tag ? `${tag}..HEAD` : 'HEAD'
const notes = collectNotes(range)
const markdown = renderMarkdown(version, date, notes)
const releaseNotes = markdown.endsWith('\n') ? markdown : `${markdown}\n`
const whatsnew = renderWhatsNew(notes)

fs.mkdirSync(whatsnewDir, { recursive: true })
fs.writeFileSync(path.join(artifactsDir, 'RELEASE_NOTES.md'), releaseNotes)
fs.writeFileSync(path.join(whatsnewDir, 'whatsnew-en-US'), whatsnew.endsWith('\n') ? whatsnew : `${whatsnew}\n`)

console.log(`Release notes for ${version} (${tag ? `since ${tag}` : 'full history'})`)
console.log(`Wrote ${path.join(artifactsDir, 'RELEASE_NOTES.md')}`)
console.log(`Wrote ${path.join(whatsnewDir, 'whatsnew-en-US')} (${whatsnew.length} chars)`)
