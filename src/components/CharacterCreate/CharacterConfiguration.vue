<script setup lang="ts">
import { ref } from 'vue'
import { IonIcon, IonCheckbox, IonItem, IonList, IonLabel, IonNote, IonInput, IonBadge, IonButton } from '@ionic/vue'
import { informationOutline, settings } from 'ionicons/icons'
import type { Character, CharacterModules } from '@/types'
import { getSheetModules } from '@/mods/getSheetModules'
import ModalWindow from '@/components/ui/ModalWindow.vue'
import ModuleInfo from '@/components/CharacterCreate/ModuleInfo.vue'
import useFate from '@/store/useFate'
import CharacterService from '@/service/character.service'
import { useModuleSelection } from '@/composables/useModuleSelection'
import type { FateModuleManifest } from '@/modules/utils/types'
import { storeToRefs } from 'pinia'

const {
	initialConfig,
	initialName = '',
	mode
} = defineProps<{
	initialConfig?: CharacterModules
	initialName?: string
	mode: 'create' | 'update'
}>()

const emit = defineEmits<{
	create: [Character]
	update: [CharacterModules]
}>()

const { context } = storeToRefs(useFate())
const { modulesForDisplay, toggleModule, importConfiguration, getConfigs } = useModuleSelection(getSheetModules(), initialConfig)

const name = ref<string>(initialName || '')

const selectedModule = ref<(typeof modulesForDisplay.value)[number] | undefined>(undefined)
const isModalOpen = ref(false)

function openModuleModal(mod: (typeof modulesForDisplay.value)[number]) {
	selectedModule.value = mod
	isModalOpen.value = true
}

function isConfigurable(mod: FateModuleManifest): boolean {
	return !!mod.config?.options?.length
}

async function importModules() {
	const input = document.createElement('input')
	input.type = 'file'
	input.accept = CharacterService.CHARACTER_MODULE_EXTENSION
	input.onchange = async (event: Event) => {
		const file = (event.target as HTMLInputElement).files?.[0]
		if (file) {
			const modules = await CharacterService.importCharacterModules(file)
			importConfiguration(modules)
		}
	}
	input.click()
}

async function create() {
	const character: Character = {
		...context.value.templates.character,
		name: name.value,
		_modules: getConfigs()
	}

	emit('create', character)
}

async function update() {
	emit('update', getConfigs())
}
</script>

<template>
	<ion-list inset>
		<ion-item>
			<ion-input
				v-model="name"
				data-testid="character-name-input"
				:disabled="!!initialName"
				:label="$t('character.name')"
			/>
		</ion-item>
	</ion-list>

	<ion-label>
		<h2 class="px-8">{{ $t('modules.selected') }}:</h2>
	</ion-label>
	<ion-list inset>
		<ion-item
			v-for="mod in modulesForDisplay"
			:key="mod.id"
			data-testid="module-list-item"
		>
			<ion-checkbox
				slot="start"
				:data-testname="mod.id"
				data-testid="module-checkbox"
				:checked="mod.isSelected"
				:disabled="mod.disabled"
				@ion-change="toggleModule(mod.id)"
			/>

			<ion-label>
				<h3>
					{{ $t(mod.name) }}
					<ion-note>{{ mod.version }}</ion-note>
				</h3>
				<p>{{ $t(mod.description.short) }}</p>
				<ion-note
					v-if="mod.disabled && mod.reason"
					class="text-danger text-xs"
				>
					{{ mod.reason }}
				</ion-note>
			</ion-label>

			<!-- Show how many keys are in the config, just for example -->
			<ion-badge v-if="Object.keys(mod.configuration).length">
				{{ Object.keys(mod.configuration).length }}
			</ion-badge>

			<!-- Button to open modal to edit config -->
			<ion-button
				slot="end"
				:data-testname="mod.id"
				data-testid="module-settings-button"
				:disabled="isConfigurable(mod) ? mod.disabled : false"
				fill="clear"
				:class="isConfigurable(mod) ? '' : 'text-primary'"
				@click.stop="openModuleModal(mod)"
			>
				<!-- If the module has config options we can show 'settings' icon -->
				<ion-icon :icon="isConfigurable(mod) ? settings : informationOutline" />
			</ion-button>
		</ion-item>
	</ion-list>

	<ion-note class="text-center block">
		{{ $t('common.or') }}
	</ion-note>
	<ion-button
		class="mx-4"
		expand="block"
		fill="clear"
		@click="importModules"
	>
		{{ $t('modules.import.title') }}
	</ion-button>
	<ion-button
		data-testid="create-character-form-button"
		class="mx-4 mb-8"
		:disabled="!name"
		expand="block"
		color="primary"
		@click="mode === 'update' ? update() : create()"
	>
		{{ $t(mode === 'update' ? 'common.actions.update' : 'common.actions.create') }}
	</ion-button>

	<ModalWindow
		v-if="selectedModule"
		v-model="isModalOpen"
		:title="$t(selectedModule?.name || '')"
	>
		<ModuleInfo
			v-model="selectedModule.configuration"
			:fate-module="selectedModule"
		/>
	</ModalWindow>
</template>
