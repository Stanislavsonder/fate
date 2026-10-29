<script setup lang="ts">
import type { Character } from '@/types'
import { IonTextarea } from '@ionic/vue'
import Avatar from './Avatar.vue'

const character = defineModel<Character>({
	required: true
})
</script>

<template>
	<div class="grid gap-4 md:grid-cols-6">
		<Avatar
			v-model="character.avatar"
			class="md:col-span-2"
		/>
		<div class="md:col-span-4">
			<ion-textarea
				v-model="character.name"
				data-testid="character-name-field"
				auto-grow
				enterkeyhint="done"
				inputmode="text"
				class="text-center !text-2xl font-bold md:text-start md:pl-2"
				:aria-label="$t('character.sheet.name.label')"
				:placeholder="$t('character.sheet.name.placeholder')"
				:rows="1"
			/>
		</div>
	</div>
</template>
