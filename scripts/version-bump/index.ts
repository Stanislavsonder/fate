#!/usr/bin/env node

/**
 * Usage (from the project root):
 *   npx ts-node update-version.ts --major | --minor | --patch
 *
 * Example:
 *   npx ts-node update-version.ts --patch
 *
 * This will:
 *  1. Read and bump version from package.json
 *  2. Update MARKETING_VERSION & CURRENT_PROJECT_VERSION in iOS pbxproj
 *  3. Update versionCode & versionName in Android build.gradle
 */

import fs from 'fs'
import path from 'path'
import semver from 'semver'

type BumpFlag = '--major' | '--minor' | '--patch'
type BumpType = 'major' | 'minor' | 'patch'

function getBumpTypeFromArg(arg: string): BumpType | null {
	switch (arg) {
		case '--major':
			return 'major'
		case '--minor':
			return 'minor'
		case '--patch':
			return 'patch'
		default:
			return null
	}
}

// -- Parse CLI args --
const bumpArg = process.argv[2] as BumpFlag
const bumpType = getBumpTypeFromArg(bumpArg)
const root = process.cwd()

if (!bumpType) {
	console.error(`Usage: npx ts-node update-version.ts [--major | --minor | --patch]`)
	process.exit(1)
}

// -- Helpers --
function readFile(filePath: string): string {
	return fs.readFileSync(filePath, { encoding: 'utf-8' })
}

function writeFile(filePath: string, data: string): void {
	fs.writeFileSync(filePath, data, { encoding: 'utf-8' })
	console.log(`Updated file: ${filePath}`)
}

// -- 1) Update package.json version using semver --
const packageJsonPath = path.join(root, 'package.json')

interface PackageJson {
	version: string
	[key: string]: unknown // for other fields in package.json
}

let packageJsonData: PackageJson

try {
	const rawPackageJson = readFile(packageJsonPath)
	packageJsonData = JSON.parse(rawPackageJson) as PackageJson
} catch (err) {
	console.error(`Error reading package.json: ${err}`)
	process.exit(1)
}

const oldPackageVersion = packageJsonData.version
const newPackageVersion = semver.inc(oldPackageVersion, bumpType)

if (!newPackageVersion) {
	console.error(`Error: Could not bump version (invalid semver version: "${oldPackageVersion}")`)
	process.exit(1)
}

// Update the version in memory
packageJsonData.version = newPackageVersion

// Write updated package.json back to disk
writeFile(packageJsonPath, JSON.stringify(packageJsonData, null, '\t') + '\n')
console.log(`package.json version: ${oldPackageVersion} -> ${newPackageVersion}`)

// -- 2) Update iOS .pbxproj (MARKETING_VERSION & CURRENT_PROJECT_VERSION) --
const iosPbxprojPath = path.join(root, 'ios', 'App', 'App.xcodeproj', 'project.pbxproj')

// If your iOS project path differs, change accordingly
if (fs.existsSync(iosPbxprojPath)) {
	let iosData = readFile(iosPbxprojPath)

	// MARKETING_VERSION = X.Y.Z;
	iosData = iosData.replace(/MARKETING_VERSION = ([0-9]+\.[0-9]+\.[0-9]+);/g, (_match, capturedVersion) => {
		console.log(`iOS MARKETING_VERSION: ${capturedVersion} -> ${newPackageVersion}`)
		return `MARKETING_VERSION = ${newPackageVersion};`
	})
	// CURRENT_PROJECT_VERSION = X;
	iosData = iosData.replace(/CURRENT_PROJECT_VERSION = ([0-9]+);/g, (_match, capturedNumber) => {
		const oldIosProjectVersion = parseInt(capturedNumber, 10)
		const newIosProjectVersion = oldIosProjectVersion + 1
		console.log(`iOS CURRENT_PROJECT_VERSION: ${oldIosProjectVersion} -> ${newIosProjectVersion}`)
		return `CURRENT_PROJECT_VERSION = ${newIosProjectVersion};`
	})

	writeFile(iosPbxprojPath, iosData)
} else {
	console.warn(`Warning: iOS .pbxproj file not found at: ${iosPbxprojPath}`)
}

// -- 3) Update Android build.gradle (versionCode & versionName) --
const androidGradlePath = path.join(root, 'android', 'app', 'build.gradle')

if (fs.existsSync(androidGradlePath)) {
	let gradleData = readFile(androidGradlePath)

	// versionCode 5
	const versionCodeRegex = /versionCode\s+(\d+)/
	gradleData = gradleData.replace(versionCodeRegex, (match: string, capturedNumber: string) => {
		const oldVersionCode = parseInt(capturedNumber, 10)
		const newVersionCode = oldVersionCode + 1
		console.log(`Android versionCode: ${oldVersionCode} -> ${newVersionCode}`)
		return `versionCode ${newVersionCode}`
	})

	// versionName "2.1.4"
	const versionNameRegex = /versionName\s+"([\d.]+)"/
	gradleData = gradleData.replace(versionNameRegex, (match: string, capturedVersion: string) => {
		console.log(`Android versionName: ${capturedVersion} -> ${newPackageVersion}`)
		return `versionName "${newPackageVersion}"`
	})

	writeFile(androidGradlePath, gradleData)
} else {
	console.warn(`Warning: Android build.gradle file not found at: ${androidGradlePath}`)
}

console.log('Version bump complete!')
