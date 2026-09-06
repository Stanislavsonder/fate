#!/usr/bin/env node

import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'

const root = process.cwd()
const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/

const ANDROID_GRADLE = 'android/app/build.gradle'
const IOS_PBXPROJ = 'ios/App/App.xcodeproj/project.pbxproj'

type Triple = [number, number, number]

interface AppVersion {
	semver: string
	androidName: string
	iosName: string
	androidCode: number
	iosBuild: number
}

function gitShow(ref: string, filePath: string): string {
	try {
		return execSync(`git show ${ref}:${filePath}`, { encoding: 'utf-8', cwd: root })
	} catch {
		console.error(`Could not read ${filePath} from ${ref}`)
		process.exit(1)
	}
}

function parseSemver(version: string, source: string): Triple {
	const match = SEMVER.exec(version)
	if (!match) {
		console.error(`Invalid version "${version}" in ${source} (expected X.Y.Z)`)
		process.exit(1)
	}
	return [Number(match[1]), Number(match[2]), Number(match[3])]
}

function isGreater(a: Triple, b: Triple): boolean {
	for (let i = 0; i < 3; i++) {
		if (a[i] > b[i]) {
			return true
		}
		if (a[i] < b[i]) {
			return false
		}
	}
	return false
}

function firstMatch(content: string, pattern: RegExp, label: string): string {
	const match = pattern.exec(content)
	if (!match?.[1]) {
		console.error(`Could not find ${label}`)
		process.exit(1)
	}
	return match[1]
}

function readVersion(packageJson: string, gradle: string, pbxproj: string, source: string): AppVersion {
	const semver = (JSON.parse(packageJson) as { version?: string }).version
	if (!semver) {
		console.error(`package.json in ${source} is missing a version field`)
		process.exit(1)
	}

	return {
		semver,
		androidName: firstMatch(gradle, /versionName\s+"([^"]+)"/, `Android versionName in ${source}`),
		iosName: firstMatch(pbxproj, /MARKETING_VERSION = ([^;]+);/, `iOS MARKETING_VERSION in ${source}`),
		androidCode: Number(firstMatch(gradle, /versionCode\s+(\d+)/, `Android versionCode in ${source}`)),
		iosBuild: Number(firstMatch(pbxproj, /CURRENT_PROJECT_VERSION = (\d+);/, `iOS CURRENT_PROJECT_VERSION in ${source}`))
	}
}

function readCurrent(): AppVersion {
	return readVersion(
		fs.readFileSync(path.join(root, 'package.json'), 'utf-8'),
		fs.readFileSync(path.join(root, ANDROID_GRADLE), 'utf-8'),
		fs.readFileSync(path.join(root, IOS_PBXPROJ), 'utf-8'),
		'HEAD'
	)
}

function readFromGit(ref: string): AppVersion {
	return readVersion(gitShow(ref, 'package.json'), gitShow(ref, ANDROID_GRADLE), gitShow(ref, IOS_PBXPROJ), ref)
}

function resolveBaseRef(): string {
	if (process.argv[2]) {
		return process.argv[2]
	}
	try {
		execSync('git rev-parse --verify origin/main', { cwd: root, stdio: 'pipe' })
		return 'origin/main'
	} catch {
		return 'main'
	}
}

function assertConsistent(version: AppVersion, source: string): void {
	if (version.androidName !== version.semver) {
		console.error(`Android versionName '${version.androidName}' does not match package.json version '${version.semver}' (${source})`)
		process.exit(1)
	}
	if (version.iosName !== version.semver) {
		console.error(`iOS MARKETING_VERSION '${version.iosName}' does not match package.json version '${version.semver}' (${source})`)
		process.exit(1)
	}
	if (version.androidCode !== version.iosBuild) {
		console.error(`Android versionCode '${version.androidCode}' does not match iOS CURRENT_PROJECT_VERSION '${version.iosBuild}' (${source})`)
		process.exit(1)
	}
}

const baseRef = resolveBaseRef()
const current = readCurrent()
const base = readFromGit(baseRef)

assertConsistent(current, 'HEAD')
assertConsistent(base, baseRef)

const errors: string[] = []

if (!isGreater(parseSemver(current.semver, 'HEAD'), parseSemver(base.semver, baseRef))) {
	errors.push(`package.json version ${current.semver} is not greater than ${base.semver}`)
}
if (!(current.androidCode > base.androidCode)) {
	errors.push(`Android versionCode ${current.androidCode} is not greater than ${base.androidCode}`)
}

if (errors.length > 0) {
	console.error(`Version was not bumped relative to ${baseRef}:`)
	for (const error of errors) {
		console.error(`  - ${error}`)
	}
	console.error('Run pnpm version-bump:patch|minor|major on the release branch before merging to main.')
	process.exit(1)
}

console.log(`Version bumped: ${base.semver} (${base.androidCode}) -> ${current.semver} (${current.androidCode})`)
