<script setup lang="ts">
import { IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonIcon, IonButton, IonButtons } from '@ionic/vue'
import DiceRoll from '@/dice/components/RollScene/RollScene.vue'
import { options } from 'ionicons/icons'
import DiceRollConfig from '@/dice/components/RollConfig/RollConfig.vue'
import { ref, watch } from 'vue'
import type { DiceSceneConfig } from '@/dice/composables/useDiceScene'
import { DEFAULT_DICE_SCENE_CONFIG } from '@/dice/composables/useDiceScene'
import { clone } from '@/utils/helpers/clone'
import merge from 'lodash/merge'

const isConfigModalOpen = ref<boolean>(false)
// A corrupt or outdated saved config must never take the page down: fall back to
// defaults, and fill in fields added since the config was saved.
function loadSavedConfig(): DiceSceneConfig {
	try {
		const parsed: unknown = JSON.parse(localStorage.getItem('dice-roll-config') ?? 'null')
		if (parsed && typeof parsed === 'object') {
			return merge(clone(DEFAULT_DICE_SCENE_CONFIG), parsed)
		}
	} catch (error) {
		console.error('Failed to parse saved dice config', error)
	}
	return clone(DEFAULT_DICE_SCENE_CONFIG)
}

const config = ref<DiceSceneConfig>(loadSavedConfig())

watch(
	config,
	() => {
		localStorage.setItem('dice-roll-config', JSON.stringify(config.value))
	},
	{ deep: true }
)

function openConfigMenu() {
	isConfigModalOpen.value = true
}
</script>

<template>
	<ion-page>
		<ion-header>
			<ion-toolbar>
				<ion-title class="px-4">
					{{ $t('tabs.roll-dice.title') }}
				</ion-title>
				<ion-buttons slot="end">
					<ion-button
						data-testid="roll-config-open"
						@click="openConfigMenu"
					>
						<ion-icon
							slot="icon-only"
							:icon="options"
						/>
					</ion-button>
				</ion-buttons>
			</ion-toolbar>
		</ion-header>
		<ion-content>
			<DiceRoll v-model="config" />
			<DiceRollConfig
				v-model="config"
				v-model:is-open="isConfigModalOpen"
			/>
		</ion-content>
	</ion-page>
</template>
