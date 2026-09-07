<script setup lang="ts">
import semver from 'semver'
import { chevronDown } from 'ionicons/icons'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { IonBadge, IonButton, IonChip, IonIcon, IonItem, IonLabel, IonList, IonNote, IonPopover } from '@ionic/vue'
import ModalWindow from '@/components/ui/ModalWindow.vue'
import useRegistryBase from '@/composables/useRegistryBase'
import { modsService } from '@/db/tables/mods'
import i18n from '@/i18n'
import {
	changeRegistryVersion,
	fallbackModStoreImage,
	getModStoreImageUrl,
	getRegistryRelease,
	installFromRegistry,
	isRegistryReleaseCompatible,
	isRegistryVersionBlocked,
	getCharactersUsingMod,
	remove
} from '@/mods/installService'
import { getIndex, type RegistryModEntry } from '@/mods/registryClient'
import { confirmRemoveMod } from '@/utils/helpers/dialog'
import { showErrorToast, showSuccessToast } from '@/utils/helpers/toast'
import useCharacter from '@/store/useCharacter'

const { entry } = defineProps<{ entry: RegistryModEntry }>()
const emit = defineEmits<{ changed: [] }>()
const isOpen = defineModel<boolean>({ default: false })

const { locale } = useI18n()
const { t } = i18n.global
const { getRegistryBase } = useRegistryBase()
const characterStore = useCharacter()

const busy = ref(false)
const installedVersion = ref<string | null>(null)
const selectedVersion = ref(entry.latestVersion)
const blocklist = ref<Record<string, string[]>>({})
const versionPopover = ref<InstanceType<typeof IonPopover>>()

const strings = computed<RegistryModEntry['strings'][string]>(
	() => entry.strings[locale.value] ?? entry.strings.en ?? Object.values(entry.strings)[0] ?? { name: entry.id, short: '' }
)
const description = computed(
	() => strings.value.full ?? (entry.description.full?.startsWith('t.') ? strings.value.short : entry.description.full) ?? strings.value.short
)
const versions = computed(() => entry.versions.filter(version => getRegistryRelease(entry, version)).sort(semver.rcompare))
const selectedIsBlocked = computed(() => isRegistryVersionBlocked(blocklist.value, entry.id, selectedVersion.value))
const selectedIsCompatible = computed(() => isRegistryReleaseCompatible(entry, selectedVersion.value))
const selectedIsInstalled = computed(() => selectedVersion.value === installedVersion.value)
const imageUrl = computed(() => getModStoreImageUrl(entry, getRegistryBase()))

const actionKey = computed(() => {
	if (!installedVersion.value) {
		return 'settings.mods.detail.install'
	}
	if (selectedIsInstalled.value) {
		return 'settings.mods.detail.installed'
	}
	return semver.gt(selectedVersion.value, installedVersion.value) ? 'settings.mods.detail.update' : 'settings.mods.detail.downgrade'
})

function versionLabel(version: string): string {
	const latest = version === entry.latestVersion ? ` (${t('settings.mods.detail.latest')})` : ''
	return `v${version}${latest}`
}

async function refreshState() {
	const [row, registry] = await Promise.all([modsService.get(entry.id), getIndex()])
	installedVersion.value = row?.version ?? null
	blocklist.value = registry.index?.blocklist ?? {}
	selectedVersion.value = entry.latestVersion
}

watch(
	isOpen,
	open => {
		if (open) {
			refreshState()
		}
	},
	{ immediate: true }
)

async function performVersionAction() {
	busy.value = true
	try {
		const result = installedVersion.value
			? await changeRegistryVersion(entry.id, selectedVersion.value)
			: await installFromRegistry(entry.id, selectedVersion.value)
		if (result.ok) {
			await showSuccessToast(installedVersion.value ? 'settings.mods.updateSuccess' : 'settings.mods.installSuccess', { id: strings.value.name })
			await refreshState()
			emit('changed')
		} else {
			await showErrorToast('settings.mods.errors.action', { error: result.error })
		}
	} finally {
		busy.value = false
	}
}

async function selectVersion(version: string) {
	selectedVersion.value = version
	await versionPopover.value?.$el.dismiss()
}

async function performRemove() {
	const usedBy = await getCharactersUsingMod(entry.id)
	if (
		!(await confirmRemoveMod(
			strings.value.name,
			usedBy.map(character => character.name)
		))
	) {
		return
	}
	busy.value = true
	try {
		const result = await remove(entry.id)
		if (result.ok) {
			const currentId = characterStore.character?.id
			if (currentId != null && usedBy.some(character => character.id === currentId)) {
				await characterStore.loadCharacter(currentId)
			}
			await refreshState()
			emit('changed')
		} else {
			await showErrorToast('settings.mods.errors.action', { error: result.error })
		}
	} finally {
		busy.value = false
	}
}
</script>

<template>
	<ModalWindow
		v-model="isOpen"
		:title="strings.name"
	>
		<div class="p-4">
			<div class="flex items-start gap-4">
				<img
					:src="imageUrl"
					:alt="strings.name"
					class="aspect-square size-24 shrink-0 rounded-xl object-cover"
					@error="fallbackModStoreImage"
				/>
				<div class="min-w-0 flex-1">
					<h1 class="text-3xl font-bold">{{ strings.name }}</h1>
					<ion-note class="mt-3 block">{{ $t('settings.mods.detail.author', { name: entry.author.name }) }}</ion-note>
					<ion-badge
						v-if="selectedIsBlocked || !selectedIsCompatible"
						color="danger"
						class="mt-2"
					>
						{{ selectedIsBlocked ? $t('settings.mods.detail.blocked') : $t('settings.mods.browse.incompatible') }}
					</ion-badge>
				</div>
			</div>

			<div class="mt-4 flex">
				<ion-button
					:data-testid="installedVersion ? 'mod-store-update-button' : 'mod-store-install-button'"
					:disabled="busy || selectedIsBlocked || !selectedIsCompatible || selectedIsInstalled"
					expand="block"
					class="m-0 flex-1"
					style="--border-radius: 4px 0 0 4px"
					@click="performVersionAction"
				>
					{{ $t(actionKey) }} {{ versionLabel(selectedVersion) }}
				</ion-button>
				<ion-button
					id="mod-version-trigger"
					data-testid="mod-store-version-button"
					:disabled="busy"
					class="m-0"
					style="--border-radius: 0 4px 4px 0"
					:aria-label="$t('settings.mods.detail.versions')"
				>
					<ion-icon
						:icon="chevronDown"
						aria-hidden="true"
					/>
				</ion-button>
			</div>

			<ion-popover
				ref="versionPopover"
				trigger="mod-version-trigger"
			>
				<ion-list lines="none">
					<ion-item
						v-for="version in versions"
						:key="version"
						button
						:detail="false"
						:disabled="isRegistryVersionBlocked(blocklist, entry.id, version) || !isRegistryReleaseCompatible(entry, version)"
						:data-testid="`mod-store-version-${version}`"
						@click="selectVersion(version)"
					>
						<ion-label>{{ versionLabel(version) }}</ion-label>
						<ion-note
							v-if="version === installedVersion"
							slot="end"
						>
							{{ $t('settings.mods.detail.installed') }}
						</ion-note>
					</ion-item>
				</ion-list>
			</ion-popover>

			<ion-button
				v-if="installedVersion"
				color="danger"
				fill="clear"
				data-testid="mod-store-remove-button"
				:disabled="busy"
				expand="block"
				@click="performRemove"
			>
				{{ $t('settings.mods.detail.remove') }}
			</ion-button>

			<div class="my-6 h-px bg-[var(--ion-color-step-200)]" />

			<p>{{ description }}</p>

			<div
				v-if="entry.tags.length"
				class="mt-4 flex flex-wrap gap-1"
			>
				<ion-chip
					v-for="tag in entry.tags"
					:key="tag"
				>
					{{ tag }}
				</ion-chip>
			</div>
		</div>
	</ModalWindow>
</template>
