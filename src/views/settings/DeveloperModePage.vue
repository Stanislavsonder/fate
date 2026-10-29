<script setup lang="ts">
import {
	IonBackButton,
	IonButton,
	IonButtons,
	IonContent,
	IonHeader,
	IonInput,
	IonItem,
	IonLabel,
	IonList,
	IonNote,
	IonPage,
	IonTitle,
	IonToggle,
	IonToolbar
} from '@ionic/vue'
import { ref } from 'vue'
import { isIos } from '@/utils/helpers/platform'
import { ROUTES } from '@/router'
import useDeveloperMode from '@/composables/useDeveloperMode'
import useDebug from '@/composables/useDebug'
import useRegistryBase, { DEFAULT_REGISTRY_BASE } from '@/composables/useRegistryBase'
import { installFromUrl, previewManifestId } from '@/mods/installService'
import { connectDevMod, disconnectDevMod } from '@/mods/devMode'
import { confirmInstallFromUrl } from '@/utils/helpers/dialog'
import { showErrorToast, showSuccessToast } from '@/utils/helpers/toast'

const { isEnabled, setDeveloperMode } = useDeveloperMode()
const { isDebug, setDebugMode } = useDebug()
const { override: registryBaseOverride, setRegistryBaseOverride } = useRegistryBase()

const registryBaseInput = ref(registryBaseOverride.value)

function saveRegistryBase() {
	setRegistryBaseOverride(registryBaseInput.value)
}

const DEFAULT_DEV_MOD_URL = 'http://localhost:5199'

const url = ref('')
const installing = ref(false)

const devUrl = ref(DEFAULT_DEV_MOD_URL)
const connecting = ref(false)
const connectedDevMods = ref<string[]>([])

async function connect() {
	const baseUrl = devUrl.value.trim()
	if (!baseUrl || connecting.value) {
		return
	}

	connecting.value = true
	try {
		const result = await connectDevMod(baseUrl)
		if (result.ok) {
			if (!connectedDevMods.value.includes(result.id)) {
				connectedDevMods.value.push(result.id)
			}
			await showSuccessToast('settings.developer.devMod.connected', { id: result.id })
			devUrl.value = DEFAULT_DEV_MOD_URL
		} else {
			await showErrorToast('settings.developer.devMod.error', { error: result.error })
		}
	} finally {
		connecting.value = false
	}
}

function disconnect(id: string) {
	disconnectDevMod(id)
	connectedDevMods.value = connectedDevMods.value.filter(connectedId => connectedId !== id)
}

async function install() {
	const baseUrl = url.value.trim()
	if (!baseUrl || installing.value) {
		return
	}

	installing.value = true
	try {
		const preview = await previewManifestId(baseUrl)
		if (!preview.ok) {
			await showErrorToast('settings.developer.installFromUrl.error', { error: preview.error })
			return
		}

		if (!(await confirmInstallFromUrl(preview.id))) {
			return
		}

		const result = await installFromUrl(baseUrl)
		if (result.ok) {
			await showSuccessToast('settings.developer.installFromUrl.success', { id: result.manifest.id })
			url.value = ''
		} else {
			await showErrorToast('settings.developer.installFromUrl.error', { error: result.error })
		}
	} finally {
		installing.value = false
	}
}
</script>

<template>
	<ion-page>
		<ion-header>
			<ion-toolbar>
				<ion-buttons slot="start">
					<ion-back-button
						:default-href="ROUTES.SETTINGS"
						:text="isIos ? $t('common.actions.back') : undefined"
					/>
				</ion-buttons>
				<ion-title class="px-4">{{ $t('settings.developer.title') }}</ion-title>
			</ion-toolbar>
		</ion-header>
		<ion-content>
			<ion-list :inset="true">
				<ion-item lines="none">
					<ion-toggle
						:checked="isEnabled"
						@ion-change="(e: CustomEvent) => setDeveloperMode(e.detail.checked)"
					>
						{{ $t('settings.developer.toggle') }}
					</ion-toggle>
				</ion-item>
				<ion-item lines="none">
					<ion-note>{{ $t('settings.developer.toggleDescription') }}</ion-note>
				</ion-item>
			</ion-list>

			<ion-list :inset="true">
				<ion-item lines="none">
					<ion-toggle
						:checked="isDebug"
						@ion-change="(e: CustomEvent) => setDebugMode(e.detail.checked)"
					>
						{{ $t('settings.developer.debugInfo.toggle') }}
					</ion-toggle>
				</ion-item>
				<ion-item lines="none">
					<ion-note>{{ $t('settings.developer.debugInfo.toggleDescription') }}</ion-note>
				</ion-item>
			</ion-list>

			<template v-if="isEnabled">
				<ion-list :inset="true">
					<ion-item>
						<ion-label position="stacked">{{ $t('settings.developer.installFromUrl.title') }}</ion-label>
						<ion-input
							v-model="url"
							data-testid="install-url-input"
							:placeholder="$t('settings.developer.installFromUrl.urlPlaceholder')"
							type="url"
							inputmode="url"
						/>
					</ion-item>
					<ion-item lines="none">
						<ion-button
							data-testid="install-url-button"
							:disabled="!url.trim() || installing"
							@click="install"
						>
							{{ $t('settings.developer.installFromUrl.install') }}
						</ion-button>
					</ion-item>
				</ion-list>

				<ion-list :inset="true">
					<ion-item>
						<ion-label position="stacked">{{ $t('settings.developer.devMod.title') }}</ion-label>
						<ion-input
							v-model="devUrl"
							:placeholder="$t('settings.developer.devMod.urlPlaceholder')"
							type="url"
							inputmode="url"
						/>
					</ion-item>
					<ion-item lines="none">
						<ion-button
							:disabled="!devUrl.trim() || connecting"
							@click="connect"
						>
							{{ $t('settings.developer.devMod.connect') }}
						</ion-button>
					</ion-item>
					<ion-item
						v-for="id in connectedDevMods"
						:key="id"
					>
						<ion-label>{{ id }}</ion-label>
						<ion-button
							slot="end"
							color="danger"
							fill="clear"
							@click="disconnect(id)"
						>
							{{ $t('settings.developer.devMod.disconnect') }}
						</ion-button>
					</ion-item>
				</ion-list>

				<ion-list :inset="true">
					<ion-item>
						<ion-label position="stacked">{{ $t('settings.developer.registryBase.title') }}</ion-label>
						<ion-input
							v-model="registryBaseInput"
							:placeholder="DEFAULT_REGISTRY_BASE"
							type="url"
							inputmode="url"
						/>
					</ion-item>
					<ion-item lines="none">
						<ion-button @click="saveRegistryBase">
							{{ $t('settings.developer.registryBase.save') }}
						</ion-button>
					</ion-item>
					<ion-item lines="none">
						<ion-note>{{ $t('settings.developer.registryBase.description') }}</ion-note>
					</ion-item>
				</ion-list>
			</template>
		</ion-content>
	</ion-page>
</template>
