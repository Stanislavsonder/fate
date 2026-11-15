#!/usr/bin/env node

import { createPrivateKey, sign } from 'node:crypto'
import { readFileSync } from 'node:fs'

const APP_ID = '6782209520'
const BUNDLE_ID = 'com.sonder.fatecore'
const API = 'https://api.appstoreconnect.apple.com/v1'
const POLL_INTERVAL_MS = 60_000
const POLL_TIMEOUT_MS = 60 * 60 * 1000
const JWT_TTL_SECONDS = 19 * 60
const JWT_REFRESH_SKEW_SECONDS = 2 * 60
const WHATS_NEW_LIMIT = 4000

const IN_REVIEW_STATES = new Set(['WAITING_FOR_REVIEW', 'IN_REVIEW', 'WAITING_FOR_EXPORT_COMPLIANCE'])
const INFLIGHT_STATES = new Set([
	...IN_REVIEW_STATES,
	'PREPARE_FOR_SUBMISSION',
	'PENDING_DEVELOPER_RELEASE',
	'PENDING_APPLE_RELEASE',
	'PROCESSING_FOR_APP_STORE',
	'PENDING_CONTRACT',
	'DEVELOPER_REJECTED',
	'REJECTED',
	'METADATA_REJECTED',
	'INVALID_BINARY'
])

type Resource<TAttrs extends Record<string, unknown> = Record<string, unknown>> = {
	id: string
	type: string
	attributes?: TAttrs
}

type Collection<T> = { data: T[] }
type Single<T> = { data: T }

type AppAttrs = { bundleId?: string; name?: string }
type VersionAttrs = { versionString?: string; appStoreState?: string; platform?: string }
type BuildAttrs = { version?: string; processingState?: string; expired?: boolean }
type ReviewSubmissionAttrs = { state?: string; platform?: string }
type LocalizationAttrs = { locale?: string; whatsNew?: string | null }

type Jwt = { token: string; exp: number }

class AscError extends Error {
	constructor(
		readonly status: number,
		readonly body: unknown
	) {
		const detail = formatAscErrors(body)
		super(detail ? `ASC ${status}: ${detail}` : `ASC ${status}`)
		this.name = 'AscError'
	}
}

function requireEnv(name: string): string {
	const value = process.env[name]?.trim()
	if (!value) {
		console.error(`Missing required env var ${name}`)
		process.exit(1)
	}
	return value
}

function formatAscErrors(body: unknown): string {
	if (!body || typeof body !== 'object' || !('errors' in body) || !Array.isArray(body.errors)) {
		return ''
	}
	return body.errors.map(formatAscError).join('; ')
}

// ASC puts the actual reasons for STATE_ERROR responses (missing metadata, etc.) in meta.associatedErrors,
// keyed by the resource path they belong to. Without them a 409 says nothing useful.
function formatAscError(error: unknown): string {
	if (!error || typeof error !== 'object') {
		return String(error)
	}
	const record = error as { title?: string; detail?: string; code?: string; meta?: { associatedErrors?: Record<string, unknown[]> } }
	const line = [record.code, record.title, record.detail].filter(Boolean).join(' — ')
	const associated = Object.entries(record.meta?.associatedErrors ?? {}).flatMap(([resource, errors]) =>
		(Array.isArray(errors) ? errors : []).map(inner => `\n    ${resource}: ${formatAscError(inner)}`)
	)
	return line + associated.join('')
}

function normalizePrivateKey(raw: string): string {
	let key = raw.trim().replace(/\\n/g, '\n')
	if (!key.includes('BEGIN')) {
		key = `-----BEGIN PRIVATE KEY-----\n${key}\n-----END PRIVATE KEY-----`
	}
	return key
}

function mintJwt(keyId: string, issuerId: string, privateKeyPem: string): Jwt {
	const now = Math.floor(Date.now() / 1000)
	const exp = now + JWT_TTL_SECONDS
	const header = Buffer.from(JSON.stringify({ alg: 'ES256', kid: keyId, typ: 'JWT' })).toString('base64url')
	const payload = Buffer.from(JSON.stringify({ iss: issuerId, iat: now, exp, aud: 'appstoreconnect-v1' })).toString('base64url')
	const unsigned = `${header}.${payload}`
	const key = createPrivateKey(privateKeyPem)
	const signature = sign('SHA256', Buffer.from(unsigned), { key, dsaEncoding: 'ieee-p1363' })
	return { token: `${unsigned}.${signature.toString('base64url')}`, exp }
}

function sleep(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms))
}

const keyId = requireEnv('ASC_KEY_ID')
const issuerId = requireEnv('ASC_ISSUER_ID')
const privateKey = normalizePrivateKey(requireEnv('ASC_PRIVATE_KEY'))
const version = requireEnv('VERSION')
const buildNumber = requireEnv('BUILD_NUMBER')
const whatsNew = readWhatsNew(requireEnv('WHATS_NEW_PATH'))

function readWhatsNew(filePath: string): string {
	const text = readFileSync(filePath, 'utf-8').trim()
	if (!text) {
		console.error(`What's New text at ${filePath} is empty`)
		process.exit(1)
	}
	return text.slice(0, WHATS_NEW_LIMIT)
}

let jwt: Jwt = { token: '', exp: 0 }

function token(): string {
	const now = Math.floor(Date.now() / 1000)
	if (!jwt.token || jwt.exp - now < JWT_REFRESH_SKEW_SECONDS) {
		jwt = mintJwt(keyId, issuerId, privateKey)
	}
	return jwt.token
}

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
	const response = await fetch(`${API}${path}`, {
		method,
		headers: {
			Authorization: `Bearer ${token()}`,
			Accept: 'application/json',
			...(body ? { 'Content-Type': 'application/json' } : {})
		},
		body: body ? JSON.stringify(body) : undefined
	})
	const text = await response.text()
	const json: unknown = text ? JSON.parse(text) : {}
	if (!response.ok) {
		throw new AscError(response.status, json)
	}
	return json as T
}

async function assertApp(): Promise<void> {
	const result = await api<Collection<Resource<AppAttrs>>>(`GET`, `/apps?filter[bundleId]=${encodeURIComponent(BUNDLE_ID)}`)
	const app = result.data[0]
	if (!app) {
		throw new Error(`No App Store Connect app found for bundle id ${BUNDLE_ID}`)
	}
	if (app.id !== APP_ID) {
		throw new Error(`Expected app id ${APP_ID} for ${BUNDLE_ID}, got ${app.id}`)
	}
	console.log(`App ${app.attributes?.name ?? BUNDLE_ID} (${app.id})`)
}

async function listIosVersions(): Promise<Resource<VersionAttrs>[]> {
	const result = await api<Collection<Resource<VersionAttrs>>>('GET', `/apps/${APP_ID}/appStoreVersions?filter[platform]=IOS&limit=25`)
	return result.data
}

function skip(message: string): never {
	// Surface as a run annotation: a skipped submit leaves the release green but not in review.
	console.log(`::warning title=App Store submit skipped::${message}`)
	process.exit(0)
}

function guardInflight(versions: Resource<VersionAttrs>[]): Resource<VersionAttrs> | undefined {
	for (const item of versions) {
		const state = item.attributes?.appStoreState ?? ''
		const versionString = item.attributes?.versionString ?? ''
		if (!IN_REVIEW_STATES.has(state)) {
			continue
		}
		if (versionString === version) {
			skip(`version ${version} is already ${state}`)
		}
		skip(`version ${versionString} is ${state}. ASC allows only one version in review; submit ${version} after that version is approved`)
	}

	const inflight = versions.find(item => {
		const state = item.attributes?.appStoreState ?? ''
		const versionString = item.attributes?.versionString ?? ''
		return INFLIGHT_STATES.has(state) && versionString !== version
	})
	if (inflight) {
		skip(`version ${inflight.attributes?.versionString} is ${inflight.attributes?.appStoreState}, so a new version cannot be created yet`)
	}

	return versions.find(item => item.attributes?.versionString === version)
}

async function waitForBuild(): Promise<Resource<BuildAttrs>> {
	const deadline = Date.now() + POLL_TIMEOUT_MS
	while (Date.now() < deadline) {
		const result = await api<Collection<Resource<BuildAttrs>>>(
			'GET',
			`/builds?filter[app]=${APP_ID}&filter[version]=${encodeURIComponent(buildNumber)}&sort=-uploadedDate&limit=5`
		)
		const build = result.data.find(item => !item.attributes?.expired)
		const state = build?.attributes?.processingState
		if (build && state === 'VALID') {
			console.log(`Build ${build.id} (version ${buildNumber}) is VALID`)
			return build
		}
		if (build && (state === 'INVALID' || state === 'FAILED_PROCESSING')) {
			throw new Error(`Build ${build.id} processingState is ${state}`)
		}
		const remaining = Math.max(0, Math.round((deadline - Date.now()) / 1000))
		console.log(`Waiting for build ${buildNumber} to become VALID (state: ${state ?? 'missing'}; ${remaining}s left)`)
		await sleep(POLL_INTERVAL_MS)
	}
	throw new Error(`Timed out waiting for build ${buildNumber} to become VALID`)
}

async function ensureVersion(existing: Resource<VersionAttrs> | undefined): Promise<Resource<VersionAttrs>> {
	if (existing) {
		const state = existing.attributes?.appStoreState ?? ''
		if (state === 'READY_FOR_SALE') {
			skip(`version ${version} is already READY_FOR_SALE`)
		}
		if (IN_REVIEW_STATES.has(state)) {
			skip(`version ${version} is already ${state}`)
		}
		if (state === 'REJECTED' || state === 'METADATA_REJECTED' || state === 'INVALID_BINARY' || state === 'DEVELOPER_REJECTED') {
			throw new Error(`Version ${version} is ${state}; fix it in App Store Connect, then re-run with a bumped version`)
		}
		console.log(`Reusing App Store version ${version} (${existing.id}, ${state})`)
		return existing
	}

	console.log(`Creating App Store version ${version}`)
	const created = await api<Single<Resource<VersionAttrs>>>('POST', '/appStoreVersions', {
		data: {
			type: 'appStoreVersions',
			attributes: {
				platform: 'IOS',
				versionString: version
			},
			relationships: {
				app: { data: { type: 'apps', id: APP_ID } }
			}
		}
	})
	return created.data
}

async function attachBuild(versionId: string, buildId: string): Promise<void> {
	console.log(`Attaching build ${buildId} to version ${versionId}`)
	await api('PATCH', `/appStoreVersions/${versionId}/relationships/build`, {
		data: { type: 'builds', id: buildId }
	})
}

// Updates require "What's New" in every locale of the version, or ASC rejects the review item with
// STATE_ERROR.ENTITY_STATE_INVALID. One text is used for all locales (release notes are English-only).
async function setWhatsNew(versionId: string): Promise<void> {
	const result = await api<Collection<Resource<LocalizationAttrs>>>('GET', `/appStoreVersions/${versionId}/appStoreVersionLocalizations?limit=50`)
	if (result.data.length === 0) {
		throw new Error(`Version ${versionId} has no localizations to write What's New into`)
	}
	for (const localization of result.data) {
		console.log(`Setting What's New for ${localization.attributes?.locale ?? localization.id}`)
		await api('PATCH', `/appStoreVersionLocalizations/${localization.id}`, {
			data: { type: 'appStoreVersionLocalizations', id: localization.id, attributes: { whatsNew } }
		})
	}
}

// A previous failed run leaves an unsubmitted submission behind, and ASC allows only one open per platform.
async function findOpenSubmission(): Promise<Resource<ReviewSubmissionAttrs> | undefined> {
	const result = await api<Collection<Resource<ReviewSubmissionAttrs>>>(
		'GET',
		`/reviewSubmissions?filter[app]=${APP_ID}&filter[platform]=IOS&filter[state]=READY_FOR_REVIEW&limit=5`
	)
	return result.data[0]
}

async function submissionHasVersion(submissionId: string, versionId: string): Promise<boolean> {
	const result = await api<Collection<Resource & { relationships?: { appStoreVersion?: { data?: { id: string } | null } } }>>(
		'GET',
		`/reviewSubmissions/${submissionId}/items?include=appStoreVersion&limit=50`
	)
	return result.data.some(item => item.relationships?.appStoreVersion?.data?.id === versionId)
}

async function submitForReview(versionId: string): Promise<void> {
	const open = await findOpenSubmission()
	if (open) {
		console.log(`Reusing open review submission ${open.id}`)
		if (!(await submissionHasVersion(open.id, versionId))) {
			await addSubmissionItem(open.id, versionId)
		}
		await confirmSubmission(open.id)
		return
	}

	console.log('Creating review submission')
	let submission: Resource<ReviewSubmissionAttrs>
	try {
		const created = await api<Single<Resource<ReviewSubmissionAttrs>>>('POST', '/reviewSubmissions', {
			data: {
				type: 'reviewSubmissions',
				attributes: { platform: 'IOS' },
				relationships: {
					app: { data: { type: 'apps', id: APP_ID } }
				}
			}
		})
		submission = created.data
	} catch (error) {
		if (error instanceof AscError && error.status === 409) {
			throw new Error(`An open review submission already exists. ${error.message}`, { cause: error })
		}
		throw error
	}

	await addSubmissionItem(submission.id, versionId)
	await confirmSubmission(submission.id)
}

async function addSubmissionItem(submissionId: string, versionId: string): Promise<void> {
	console.log(`Adding version ${versionId} to submission ${submissionId}`)
	await api('POST', '/reviewSubmissionItems', {
		data: {
			type: 'reviewSubmissionItems',
			relationships: {
				reviewSubmission: { data: { type: 'reviewSubmissions', id: submissionId } },
				appStoreVersion: { data: { type: 'appStoreVersions', id: versionId } }
			}
		}
	})
}

async function confirmSubmission(submissionId: string): Promise<void> {
	console.log(`Submitting ${submissionId}`)
	await api('PATCH', `/reviewSubmissions/${submissionId}`, {
		data: {
			type: 'reviewSubmissions',
			id: submissionId,
			attributes: { submitted: true }
		}
	})
}

async function main(): Promise<void> {
	console.log(`Submitting ${version} (build ${buildNumber}) to App Store Connect`)
	await assertApp()
	const versions = await listIosVersions()
	const existing = guardInflight(versions)
	const build = await waitForBuild()
	const storeVersion = await ensureVersion(existing)
	await attachBuild(storeVersion.id, build.id)
	await setWhatsNew(storeVersion.id)
	await submitForReview(storeVersion.id)
	console.log(`Submitted ${version} (build ${buildNumber}) for review`)
}

main().catch((error: unknown) => {
	console.error(error instanceof Error ? error.message : error)
	process.exit(1)
})
