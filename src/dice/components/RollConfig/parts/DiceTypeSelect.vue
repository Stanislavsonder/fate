<script setup lang="ts">
import { computed } from 'vue'
import { IonLabel, IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonIcon } from '@ionic/vue'
import { DICE_SHAPES, DICE_MATERIALS } from '@/dice/constants'
import type { DiceSceneConfig } from '@/dice/types'

const config = defineModel<DiceSceneConfig>({ required: true })
// `value` is the DICE_SHAPES/DICE_MATERIALS Map key (namespaced for external
// mods, e.g. "author@mod:MyDie") — what config.dice.shape/material actually
// stores. `name` is the shape/material's own display name, which can repeat
// across mods; only the key is guaranteed unique.
const diceTypes = computed(() => Array.from(DICE_SHAPES.entries()).map(([key, shape]) => ({ value: key, name: shape.name, icon: shape.icon })))
const diceMaterials = computed(() =>
	Array.from(DICE_MATERIALS.entries()).map(([key, material]) => ({ value: key, name: material.name, color: material.previewColor }))
)
</script>

<template>
	<ion-card>
		<ion-card-header>
			<ion-card-title>{{ $t('roll-dice.config.dice.title') }}</ion-card-title>
		</ion-card-header>
		<ion-card-content>
			<div class="mb-5">
				<div class="mb-2 text-lg font-bold">{{ $t('roll-dice.config.dice.type') }}</div>
				<ul class="flex flex-wrap gap-2">
					<li
						v-for="type in diceTypes"
						:key="type.value"
					>
						<button
							data-testid="dice-shape-option"
							:data-testname="type.value"
							class="flex items-center gap-2 flex-col"
							@click="config.dice.shape = type.value"
						>
							<ion-icon
								:icon="type.icon"
								class="text-5xl"
								:class="{ 'text-accent': config.dice.shape === type.value }"
							/>
							<ion-label>{{ type.name }}</ion-label>
						</button>
					</li>
				</ul>
			</div>

			<div class="mb-5">
				<div class="mb-2 text-lg font-bold">{{ $t('roll-dice.config.dice.material') }}</div>
				<ul class="flex flex-wrap gap-2">
					<li
						v-for="material in diceMaterials"
						:key="material.value"
					>
						<button
							data-testid="dice-material-option"
							:data-testname="material.value"
							:style="{ backgroundColor: material.color }"
							:class="{ 'border-2 border-accent! shadow-sm shadow-accent': config.dice.material === material.value }"
							class="w-10 h-10 rounded-full border border-gray-300"
							@click="config.dice.material = material.value"
						/>
					</li>
				</ul>
			</div>
		</ion-card-content>
	</ion-card>
</template>
