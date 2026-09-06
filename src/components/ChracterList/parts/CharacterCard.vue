<script setup lang="ts">
import type { Character } from '@/types'
import { useId } from 'vue'
import CharacterPlaceholder from '@/assets/character-placeholder.jpg'
import { downloadOutline, ellipsisVertical, settings, shareOutline } from 'ionicons/icons'
import { IonIcon, IonPopover, IonButton, IonContent, IonList, IonItem, IonLabel } from '@ionic/vue'
import { confirmRemove } from '@/utils/helpers/dialog'
import CharacterService from '@/service/character.service'
import { ROUTES } from '@/router'

const { character } = defineProps<{
	character: Character
}>()

const emit = defineEmits<{
	select: [id: number]
	remove: [id: number]
	configure: [id: number]
}>()

const popoverId = useId()
const canShare = CharacterService.canShare

async function remove() {
	if (await confirmRemove(character.name)) {
		emit('remove', character.id)
	}
}
</script>

<template>
	<section class="grid grid-cols-2 bg-background-2 rounded-xl relative">
		<img
			class="aspect-square object-cover w-full rounded-xl rounded-bl-none rounded-tr-none"
			:alt="character.name"
			:src="character.avatar || CharacterPlaceholder"
		/>
		<div class="p-2">
			<h3 class="font-bold mb-2 pe-8">{{ character.name }}</h3>

			<h4 class="text-xs mb-2 opacity-70">
				{{ $t('modules.installed', { value: Object.keys(character._modules).length }) }}
			</h4>

			<ul class="grid gap-1">
				<li
					v-for="m in Object.entries(character._modules)"
					:key="m[0]"
					class="flex text-xs p-1 px-2 bg-background-3 text-light justify-between rounded"
				>
					<span>{{ $t(m[0] + '.name') }}</span>
					<span>
						{{ m[1].config && Object.keys(m[1].config).length ? '*' : '' }}
						{{ `${m[1].version}` }}
					</span>
				</li>
			</ul>
		</div>
		<div
			class="absolute inset-e-1 size-8 rounded-full"
			:style="{ background: 'var(--ion-item-background)' }"
		>
			<ion-button
				:id="popoverId"
				data-testid="character-popover"
				:data-testname="character.name"
				class="absolute translate-x-[-18%] translate-y-[-5%] z-10"
				color="dark"
				size="small"
				fill="clear"
			>
				<ion-icon :icon="ellipsisVertical" />
			</ion-button>
		</div>
		<ion-button
			data-testid="character-select"
			:data-testname="character.name"
			class="col-span-2"
			fill="clear"
			expand="block"
			@click="emit('select', character.id)"
		>
			{{ $t('common.actions.select') }}
		</ion-button>
		<ion-popover
			:trigger="popoverId"
			dismiss-on-select
		>
			<ion-content>
				<ion-list>
					<ion-item
						data-testid="character-configure"
						button
						:detail="false"
						:router-link="ROUTES.CHARACTER_CONFIGURE.replace(':id', character.id.toString())"
					>
						{{ $t('character.configure') }}
						<ion-icon
							slot="end"
							:aria-hidden="true"
							:icon="settings"
						/>
					</ion-item>
					<ion-item
						:detail="false"
						button
						@click="CharacterService.saveCharacter(character)"
					>
						{{ $t('character.save') }}
						<ion-icon
							slot="end"
							:aria-hidden="true"
							:icon="downloadOutline"
						/>
					</ion-item>
					<ion-item
						v-if="canShare"
						:detail="false"
						button
						@click="CharacterService.shareCharacter(character)"
					>
						{{ $t('character.share') }}
						<ion-icon
							slot="end"
							:aria-hidden="true"
							:icon="shareOutline"
						/>
					</ion-item>
					<ion-item
						:detail="false"
						button
						@click="CharacterService.saveModules(character)"
					>
						{{ $t('modules.save') }}
						<ion-icon
							slot="end"
							:aria-hidden="true"
							:icon="downloadOutline"
						/>
					</ion-item>
					<ion-item
						v-if="canShare"
						:detail="false"
						button
						@click="CharacterService.shareModules(character)"
					>
						{{ $t('modules.share') }}
						<ion-icon
							slot="end"
							:aria-hidden="true"
							:icon="shareOutline"
						/>
					</ion-item>
					<ion-item
						lines="none"
						button
						:detail="false"
						@click="remove"
					>
						<ion-label color="danger">
							{{ $t('common.actions.delete') }}
						</ion-label>
					</ion-item>
				</ion-list>
			</ion-content>
		</ion-popover>
	</section>
</template>
