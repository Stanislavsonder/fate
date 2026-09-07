<script setup lang="ts">
import { IonBadge, IonButton, IonButtons, IonItem, IonLabel, IonList, IonNote } from '@ionic/vue'
import { onMounted, ref } from 'vue'
import { ModRegistry, type ModSource, type ModStatus } from '@/mods/modRegistry'
import { safeManifest } from '@/mods/loader'
import { registerModTranslations } from '@/mods/registerModTranslations'
import { modsService } from '@/db/tables/mods'
import { checkForUpdates, getCharactersUsingMod, setEnabled, update, updateFromRegistry, remove } from '@/mods/installService'
import { confirmRemoveMod } from '@/utils/helpers/dialog'
import { showErrorToast, showSuccessToast } from '@/utils/helpers/toast'
import useCharacter from '@/store/useCharacter'
import i18n from '@/i18n'

const { t } = i18n.global
const characterStore = useCharacter()

interface ModRow {
	id: string
	name: string
	version: string
	source: ModSource
	status: ModStatus
	error?: string
	blocked?: boolean
	updateAvailable: boolean
}

const rows = ref<ModRow[]>([])
const busyId = ref<string | null>(null)

async function refresh() {
	try {
		const [storedRows, availableUpdates] = await Promise.all([modsService.getAll(), checkForUpdates()])
		const updateIds = new Set(availableUpdates.map(update => update.id))
		rows.value = storedRows.map(stored => {
			const record = ModRegistry.get(stored.id)
			if (record) {
				return {
					id: stored.id,
					name: record.manifest.name || stored.id,
					version: record.manifest.version,
					source: record.source,
					status: record.status,
					error: record.error,
					blocked: stored.blocked,
					updateAvailable: stored.source === 'url' || updateIds.has(stored.id)
				}
			}
			// Not loaded this session (e.g. disabled before this boot) — fall back to the stored manifest for display.
			const fallback = safeManifest(stored)
			try {
				registerModTranslations(stored.id, JSON.parse(stored.translationsJson || '{}'))
			} catch {
				// Malformed stored translations — name display falls back to the raw id.
			}
			return {
				id: stored.id,
				name: fallback.name || stored.id,
				version: fallback.version || stored.version,
				source: stored.source,
				status: 'disabled' as ModStatus,
				blocked: stored.blocked,
				updateAvailable: stored.source === 'url' || updateIds.has(stored.id)
			}
		})
	} catch (e) {
		await showErrorToast('settings.mods.errors.list', { error: e instanceof Error ? e.message : String(e) })
	}
}

onMounted(refresh)
defineExpose({ refresh })

async function toggleEnabled(row: ModRow) {
	busyId.value = row.id
	try {
		const result = await setEnabled(row.id, row.status === 'disabled')
		if (!result.ok) {
			await showErrorToast('settings.mods.errors.action', { error: result.error })
		}
	} finally {
		busyId.value = null
		await refresh()
	}
}

async function retry(row: ModRow) {
	busyId.value = row.id
	try {
		const result = await setEnabled(row.id, true)
		if (!result.ok) {
			await showErrorToast('settings.mods.errors.action', { error: result.error })
		}
	} finally {
		busyId.value = null
		await refresh()
	}
}

async function updateMod(row: ModRow) {
	busyId.value = row.id
	try {
		const result = row.source === 'registry' ? await updateFromRegistry(row.id) : await update(row.id)
		if (result.ok) {
			await showSuccessToast('settings.mods.updateSuccess', { id: t(row.name) })
		} else {
			await showErrorToast('settings.mods.errors.action', { error: result.error })
		}
	} finally {
		busyId.value = null
		await refresh()
	}
}

async function removeMod(row: ModRow) {
	const usedBy = await getCharactersUsingMod(row.id)
	if (
		!(await confirmRemoveMod(
			t(row.name),
			usedBy.map(character => character.name)
		))
	) {
		return
	}

	busyId.value = row.id
	try {
		const result = await remove(row.id)
		if (!result.ok) {
			await showErrorToast('settings.mods.errors.action', { error: result.error })
			return
		}
		const currentId = characterStore.character?.id
		if (currentId != null && usedBy.some(character => character.id === currentId)) {
			await characterStore.loadCharacter(currentId)
		}
	} finally {
		busyId.value = null
		await refresh()
	}
}
</script>

<template>
	<ion-list
		v-if="rows.length"
		:inset="true"
	>
		<ion-item
			v-for="row in rows"
			:key="row.id"
			lines="full"
			data-testid="installed-mod-row"
			:data-testname="row.id"
		>
			<ion-label>
				<h2>{{ $t(row.name) }}</h2>
				<p>{{ row.id }} · v{{ row.version }} · {{ $t(`settings.mods.source.${row.source}`) }}</p>
				<p v-if="row.error">{{ row.error }}</p>
				<p v-if="row.blocked">{{ $t('settings.mods.blocked', { id: row.id }) }}</p>
				<ion-badge :color="row.status === 'loaded' ? 'success' : row.status === 'errored' ? 'danger' : 'medium'">
					{{ $t(`settings.mods.status.${row.status}`) }}
				</ion-badge>
			</ion-label>
			<ion-buttons slot="end">
				<ion-button
					v-if="row.status === 'errored'"
					data-testid="installed-mod-retry"
					:disabled="busyId === row.id"
					@click="retry(row)"
				>
					{{ $t('settings.mods.actions.retry') }}
				</ion-button>
				<ion-button
					v-else
					data-testid="installed-mod-enable-toggle"
					:disabled="busyId === row.id"
					@click="toggleEnabled(row)"
				>
					{{ $t(row.status === 'disabled' ? 'settings.mods.actions.enable' : 'settings.mods.actions.disable') }}
				</ion-button>
				<ion-button
					v-if="row.updateAvailable"
					data-testid="installed-mod-update"
					:disabled="busyId === row.id"
					@click="updateMod(row)"
				>
					{{ $t('settings.mods.actions.update') }}
				</ion-button>
				<ion-button
					color="danger"
					data-testid="installed-mod-remove"
					:disabled="busyId === row.id"
					@click="removeMod(row)"
				>
					{{ $t('settings.mods.actions.remove') }}
				</ion-button>
			</ion-buttons>
		</ion-item>
	</ion-list>
	<ion-note
		v-else
		class="ion-padding block"
	>
		{{ $t('settings.mods.empty') }}
	</ion-note>
</template>
