<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { IonList, IonItem, IonLabel, IonNote, IonSearchbar, IonToggle, IonSpinner, IonRefresher, IonRefresherContent, IonBadge } from '@ionic/vue'
import { getIndex, refreshIndex, type RegistryModEntry } from '@/mods/registryClient'
import { isEntryCompatible, isEntryPublished } from '@/mods/installService'
import { modsService } from '@/db/tables/mods'
import ModStoreDetailModal from './ModStoreDetailModal.vue'

const { locale } = useI18n()

const entries = ref<RegistryModEntry[]>([])
const installedIds = ref(new Set<string>())
const stale = ref(false)
const loading = ref(true)
const loadError = ref<string | null>(null)

const searchQuery = ref('')
const compatibleOnly = ref(true)

const selectedEntry = ref<RegistryModEntry | null>(null)
const isDetailOpen = ref(false)

async function fetchCatalog() {
	// Forced, not throttled: opening the Mod Store is a deliberate user action
	// (per the Phase 3 design — throttling is only meant to limit main.ts's
	// automatic background refresh), and relying on that earlier fire-and-forget
	// call to have already populated the cache is a race — it may not have
	// completed yet if the store is opened shortly after app boot.
	const [refreshResult, stored] = await Promise.all([refreshIndex(true), modsService.getAll()])
	const { index, stale: cacheStale } = await getIndex()
	entries.value = index?.mods ?? []
	installedIds.value = new Set(stored.map(row => row.id))
	stale.value = cacheStale
	loadError.value = !refreshResult.ok && entries.value.length === 0 ? refreshResult.error : null
}

async function load() {
	loading.value = true
	await fetchCatalog()
	loading.value = false
}

async function onRefresh(event: CustomEvent) {
	await fetchCatalog()
	;(event.target as unknown as { complete(): void }).complete()
}

onMounted(load)
defineExpose({ load })

function displayStrings(entry: RegistryModEntry): { name: string; short: string } {
	return entry.strings[locale.value] ?? entry.strings.en ?? Object.values(entry.strings)[0] ?? { name: entry.id, short: '' }
}

const filteredEntries = computed(() => {
	const query = searchQuery.value.trim().toLowerCase()
	return entries.value.filter(entry => {
		if (!isEntryPublished(entry)) {
			return false
		}
		if (compatibleOnly.value && !isEntryCompatible(entry)) {
			return false
		}
		if (!query) {
			return true
		}
		const strings = displayStrings(entry)
		return (
			entry.id.toLowerCase().includes(query) ||
			strings.name.toLowerCase().includes(query) ||
			strings.short.toLowerCase().includes(query) ||
			entry.tags.some(tag => tag.toLowerCase().includes(query))
		)
	})
})

function openDetail(entry: RegistryModEntry) {
	selectedEntry.value = entry
	isDetailOpen.value = true
}
</script>

<template>
	<ion-refresher
		slot="fixed"
		data-testid="mod-store-refresher"
		@ion-refresh="onRefresh"
	>
		<ion-refresher-content />
	</ion-refresher>

	<ion-list :inset="true">
		<ion-item lines="none">
			<ion-searchbar
				v-model="searchQuery"
				data-testid="mod-store-search"
				:placeholder="$t('settings.mods.browse.searchPlaceholder')"
			/>
		</ion-item>
		<ion-item lines="none">
			<ion-toggle
				v-model="compatibleOnly"
				data-testid="mod-store-compatible-toggle"
			>
				{{ $t('settings.mods.browse.compatibleOnly') }}
			</ion-toggle>
		</ion-item>
	</ion-list>

	<ion-note
		v-if="stale"
		class="ion-padding block"
	>
		{{ $t('settings.mods.browse.stale') }}
	</ion-note>

	<div
		v-if="loading"
		class="ion-padding flex justify-center"
	>
		<ion-spinner />
	</div>
	<ion-note
		v-else-if="loadError"
		class="ion-padding block"
	>
		{{ $t('settings.mods.browse.loadError', { error: loadError }) }}
	</ion-note>
	<ion-list
		v-else-if="filteredEntries.length"
		:inset="true"
	>
		<ion-item
			v-for="entry in filteredEntries"
			:key="entry.id"
			button
			data-testid="mod-store-entry"
			:data-testname="entry.id"
			@click="openDetail(entry)"
		>
			<ion-label>
				<h2>{{ displayStrings(entry).name }}</h2>
				<p>{{ entry.id }} · v{{ entry.latestVersion }}</p>
				<p>{{ displayStrings(entry).short }}</p>
				<div class="mt-1 flex flex-wrap gap-1">
					<ion-badge
						v-if="installedIds.has(entry.id)"
						color="success"
						data-testid="mod-store-installed-badge"
					>
						{{ $t('settings.mods.detail.installed') }}
					</ion-badge>
					<ion-badge
						v-if="!isEntryCompatible(entry)"
						color="danger"
					>
						{{ $t('settings.mods.browse.incompatible') }}
					</ion-badge>
				</div>
			</ion-label>
		</ion-item>
	</ion-list>
	<ion-note
		v-else
		class="ion-padding block"
	>
		{{ $t('settings.mods.browse.empty') }}
	</ion-note>

	<ModStoreDetailModal
		v-if="selectedEntry"
		v-model="isDetailOpen"
		:entry="selectedEntry"
		@changed="fetchCatalog"
	/>
</template>
