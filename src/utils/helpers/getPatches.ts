import type { FatePatch } from '@/types'
import semver from 'semver'
import i18n from '@/i18n'

export function getPatches(patches: FatePatch[], fromVersion: string): FatePatch[] {
	// Filter patches that have a version greater than the provided fromVersion.
	const applicablePatches = patches.filter(patch => semver.gt(patch.version, fromVersion))

	if (applicablePatches.length === 0) {
		return []
	}

	// Sort the filtered patches in ascending order based on their version.
	applicablePatches.sort((a, b) => semver.compare(a.version, b.version))

	return applicablePatches
}

/**
 * Translates each patch's `note` on its own (notes are translation keys, so they
 * can't be concatenated before translating) and joins them one per line.
 * Returns an empty string when no patch has a note.
 */
export function getPatchNotes(patches: FatePatch[]): string {
	return patches
		.filter(patch => patch.note)
		.map(patch => i18n.global.t(patch.note!))
		.join('\n')
}
