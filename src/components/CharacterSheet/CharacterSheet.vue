<script setup lang="ts">
import { IonSpinner, IonButton, IonLabel } from '@ionic/vue'
import useCharacter from '@/store/useCharacter'
import useFate from '@/store/useFate'
import { storeToRefs } from 'pinia'
import { ROUTES } from '@/router'
import type { FateModuleComponent } from '@/modules/utils/types'
import { computed, provide } from 'vue'
import CharacterIdentity from './parts/CharacterIdentity.vue'

const fate = useFate()
const { context } = storeToRefs(fate)

// Context for module & core components
provide('context', context)

const { character, isLoaded } = storeToRefs(useCharacter())

const components = computed<FateModuleComponent[]>(() => fate.getModuleComponents())
</script>

<template>
	<div
		v-if="isLoaded && character && fate.isReady"
		class="flex flex-col p-2 gap-8"
	>
		<CharacterIdentity v-model="character" />
		<component
			:is="component.component"
			v-for="component in components"
			:key="component"
			v-model="character"
		/>
	</div>
	<ion-label
		v-else-if="isLoaded && fate.isReady"
		data-testid="character-not-selected"
		class="px-8 h-full flex flex-col items-center justify-center text-center"
	>
		<h2>{{ $t('character.not-selected') }}</h2>
		<router-link :to="ROUTES.CHARACTER_CREATE">
			<ion-button
				fill="clear"
				data-testid="create-character-button"
			>
				{{ $t('common.actions.create') }}
			</ion-button>
		</router-link>
	</ion-label>
	<div
		v-else
		class="grid content-center justify-center rw-full h-full"
	>
		<ion-spinner class="size-30" />
	</div>
</template>
